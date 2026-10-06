-- ============================================================
-- 03 · Asistencia en bookings: no_show, late_cancel, guardas de columnas
-- Idempotente. Reversa al final (comentada).
--
-- Qué descuenta una clase (lo calcula la vista de la migración 05, no un contador):
--   completed                          → sí
--   no_show                            → sí
--   cancelled con late_cancel = true   → sí   (cancelación con MENOS de 4 h de anticipación)
--   cancelled con late_cancel = false  → no   (4 h o más)
--   pending / approved / rejected      → no
-- Como el saldo se deriva de estos estados, corregir uno después (completed → no_show,
-- cancelled → completed, etc.) deja el saldo consistente solo, sin tocar contadores.
-- ============================================================
BEGIN;

-- Reemplaza el CHECK de status buscándolo por contenido (en producción ya hubo un desvío de
-- nombre/definición: ver 2026-10-01_activate_class_decrement_cron.sql).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.bookings'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.bookings DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.bookings ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'completed', 'no_show'));

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS late_cancel boolean NOT NULL DEFAULT false;

-- ── Guarda de bookings ───────────────────────────────────────────────────────
-- 1) late_cancel lo decide la base, no el cliente: al pasar a 'cancelled' desde pending/approved
--    se calcula con start_time del bloque (< 4 h → true). Un admin puede fijarlo a mano
--    explícitamente (p.ej. condonar una cancelación tardía); si no lo toca, se calcula igual.
-- 2) Un cliente (no admin) solo puede cambiar status a 'cancelled' (y solo desde pending/approved:
--    no puede "des-completar" una clase para recuperarla). Ninguna otra columna.
-- 3) Al salir de 'cancelled', late_cancel se limpia.
-- auth.uid() IS NULL = SQL Editor / pg_cron / service_role: privilegiado.
CREATE OR REPLACE FUNCTION public.bookings_guard()
RETURNS TRIGGER AS $$
DECLARE
  v_privileged boolean := (auth.uid() IS NULL OR public.is_admin());
  v_start      timestamptz;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT v_privileged THEN NEW.late_cancel := false; END IF;
    RETURN NEW;
  END IF;

  IF NOT v_privileged THEN
    IF NEW.client_id        IS DISTINCT FROM OLD.client_id
       OR NEW.time_block_id IS DISTINCT FROM OLD.time_block_id
       OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
       OR NEW.notified_at   IS DISTINCT FROM OLD.notified_at
       OR NEW.reminder_sent IS DISTINCT FROM OLD.reminder_sent
       OR NEW.created_at    IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'No autorizado a modificar esa columna de la reserva' USING ERRCODE = '42501';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (NEW.status = 'cancelled' AND OLD.status IN ('pending', 'approved')) THEN
      RAISE EXCEPTION 'Solo puedes cancelar una reserva pendiente o aprobada' USING ERRCODE = '42501';
    END IF;
    NEW.late_cancel := OLD.late_cancel;  -- el cliente no controla late_cancel
  END IF;

  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    IF OLD.status IN ('pending', 'approved') AND NEW.late_cancel IS NOT DISTINCT FROM OLD.late_cancel THEN
      SELECT start_time INTO v_start FROM public.time_blocks WHERE id = NEW.time_block_id;
      NEW.late_cancel := (v_start - now()) < interval '4 hours';
    END IF;
  ELSIF NEW.status <> 'cancelled' THEN
    NEW.late_cancel := false;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;  -- DEFINER: un cliente no ve bloques inactivos por RLS

DROP TRIGGER IF EXISTS bookings_guard ON public.bookings;
CREATE TRIGGER bookings_guard
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.bookings_guard();

-- ── Cupo del bloque ─────────────────────────────────────────────────────────
-- Antes solo 'approved' ocupaba cupo; con correcciones de estado (completed → approved) se
-- habría contado dos veces. Ahora ocupan cupo approved/completed/no_show.
CREATE OR REPLACE FUNCTION public.sync_block_count()
RETURNS TRIGGER AS $$
DECLARE
  v_new_occ boolean := NEW.status IN ('approved', 'completed', 'no_show');
  v_old_occ boolean := (TG_OP = 'UPDATE' AND OLD.status IN ('approved', 'completed', 'no_show'));
BEGIN
  IF v_new_occ AND NOT v_old_occ THEN
    UPDATE public.time_blocks SET current_count = current_count + 1 WHERE id = NEW.time_block_id;
  ELSIF v_old_occ AND NOT v_new_occ THEN
    UPDATE public.time_blocks SET current_count = GREATEST(current_count - 1, 0) WHERE id = NEW.time_block_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
-- SECURITY DEFINER: antes corría con los permisos de quien cancela, y como un cliente no tiene
-- UPDATE sobre time_blocks (RLS), al cancelar el contador NO se decrementaba y el cupo quedaba
-- ocupado. (La ruta de insert sí funcionaba porque book_time_block ya es definer.)

-- ── Cron: completa reservas pasadas, SIN descontar nada ─────────────────────
-- El saldo ya no es un contador que se decrementa: lo deriva la vista subscription_class_balance
-- (migración 05) a partir de los estados de bookings. Solo procesa 'approved'; corregir a
-- no_show/cancelled después es un UPDATE de status y el saldo sigue bien.
CREATE OR REPLACE FUNCTION public.complete_past_bookings()
RETURNS int AS $$
DECLARE
  v_count int;
BEGIN
  WITH done AS (
    UPDATE public.bookings bk
    SET status = 'completed', updated_at = now()
    FROM public.time_blocks tb
    WHERE tb.id = bk.time_block_id
      AND bk.status = 'approved'
      AND tb.start_time <= now()
    RETURNING bk.id
  )
  SELECT count(*) INTO v_count FROM done;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'complete-past-bookings';
SELECT cron.schedule('complete-past-bookings', '*/5 * * * *', 'SELECT complete_past_bookings()');

-- decrement_subscription_classes() queda definida pero DEPRECADA: nada la llama ya.
COMMENT ON FUNCTION public.decrement_subscription_classes(uuid) IS
  'DEPRECADA (2026-10-05): el saldo se deriva de subscription_class_balance; no usar.';

COMMIT;

-- ── REVERSA (manual) ─────────────────────────────────────────
-- DROP TRIGGER IF EXISTS bookings_guard ON public.bookings;
-- DROP FUNCTION IF EXISTS public.bookings_guard();
-- UPDATE public.bookings SET status = 'completed' WHERE status = 'no_show';  -- si se quiere volver atrás
-- ALTER TABLE public.bookings DROP CONSTRAINT bookings_status_check;
-- ALTER TABLE public.bookings ADD CONSTRAINT bookings_status_check
--   CHECK (status IN ('pending','approved','rejected','cancelled','completed'));
-- ALTER TABLE public.bookings DROP COLUMN late_cancel;
-- y restaurar sync_block_count() / complete_past_bookings() de 2026-10-01 y schema.sql (git log).
