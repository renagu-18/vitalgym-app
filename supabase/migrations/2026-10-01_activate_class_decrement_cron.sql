-- ============================================================
-- Fix: las clases no se descontaban automáticamente al tomarlas.
-- Ejecutar en: Supabase Dashboard > SQL Editor (seguro de re-ejecutar,
-- todo es CREATE OR REPLACE / IF NOT EXISTS / unschedule-primero).
--
-- Causa: el descuento de clases solo ocurre cuando una reserva pasa a
-- 'completed', y eso dependía de un cron (pg_cron) que nunca se activó
-- (quedó como comentario de ejemplo en schema.sql). Sin el cron, las
-- clases solo se descontaban si un admin hacía clic en "Completar" a
-- mano en /admin/bookings, reserva por reserva.
-- ============================================================

-- Requerida por los cron jobs de abajo.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Tu constraint de "bookings_status_check" en producción quedó desactualizado
-- (de antes de que existiera el status 'completed') y rechaza ese valor con
-- el error "violates check constraint bookings_status_check". Esta es la
-- causa real de que ninguna reserva pudiera completarse nunca, ni a mano ni
-- por cron. La recreamos para que coincida con schema.sql.
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'completed'));

-- Descuenta atómicamente 1 clase de la suscripción activa de un cliente
-- (sin read-then-write, para no perder un descuento si dos llamadas
-- corren en paralelo, p.ej. completeBooking manual y el cron al mismo
-- tiempo). Devuelve true si efectivamente descontó.
CREATE OR REPLACE FUNCTION public.decrement_subscription_classes(p_client_id uuid)
RETURNS boolean AS $$
DECLARE
  v_updated int;
BEGIN
  UPDATE public.subscriptions
  SET classes_remaining = classes_remaining - 1
  WHERE client_id = p_client_id
    AND status = 'active'
    AND classes_remaining > 0
    AND classes_remaining < 9999; -- planes ilimitados no se tocan

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Completa automáticamente las reservas 'approved' cuyo bloque horario ya
-- pasó, y recién en ese momento descuenta 1 clase. Reemplaza la versión
-- anterior (que hacía el descuento inline) para reusar la función atómica
-- de arriba.
CREATE OR REPLACE FUNCTION public.complete_past_bookings()
RETURNS int AS $$
DECLARE
  v_count int := 0;
  b RECORD;
BEGIN
  FOR b IN
    SELECT bk.id, bk.client_id
    FROM public.bookings bk
    JOIN public.time_blocks tb ON tb.id = bk.time_block_id
    WHERE bk.status = 'approved'
      AND tb.start_time <= now()
  LOOP
    UPDATE public.bookings
    SET status = 'completed', updated_at = now()
    WHERE id = b.id;

    PERFORM public.decrement_subscription_classes(b.client_id);

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Activa el cron, cada 5 minutos.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'complete-past-bookings';
SELECT cron.schedule('complete-past-bookings', '*/5 * * * *', 'SELECT complete_past_bookings()');

-- Activa también el reseteo mensual de clases, que tenía el mismo problema
-- (el cron tampoco estaba activado). monthly_classes_reset() ya existía en
-- schema.sql, no se toca su definición acá.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'monthly-classes-reset';
SELECT cron.schedule('monthly-classes-reset', '5 0 * * *', 'SELECT monthly_classes_reset()');

-- Verificación rápida: deberían aparecer los 2 jobs, con active = true.
-- SELECT jobid, jobname, schedule, active FROM cron.job;

-- Arreglo puntual para reservas ya pasadas que quedaron 'approved' sin
-- descontar (el bug histórico). Esto las completa y descuenta YA, sin
-- esperar al próximo tick del cron. Si querés revisar antes de aplicar,
-- corré primero el SELECT de abajo comentado.
-- SELECT bk.id, bk.client_id, p.full_name, tb.start_time
-- FROM public.bookings bk
-- JOIN public.time_blocks tb ON tb.id = bk.time_block_id
-- JOIN public.profiles p ON p.id = bk.client_id
-- WHERE bk.status = 'approved' AND tb.start_time <= now()
-- ORDER BY tb.start_time;

SELECT public.complete_past_bookings();
