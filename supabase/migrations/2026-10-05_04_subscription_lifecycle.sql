-- ============================================================
-- 04 · Ciclo de vida de suscripciones: scheduled, una sola activa, expiración automática
-- Idempotente. Reversa al final (comentada).
--
-- Estados de subscriptions.status:
--   scheduled  programada: renovación con start_date futura (aún no cuenta como plan vigente)
--   active     vigente (máx. UNA por cliente, índice único parcial)
--   paused     pausada por el admin
--   expired    finalizada (por end_date o porque el admin la cerró). Queda como historial.
-- Rango de una suscripción = [start_date, end_date): end_date es EXCLUSIVO. Por eso una renovación
-- puede empezar en start_date = end_date de la anterior sin solaparse.
-- ============================================================
BEGIN;

-- CHECK de status (buscado por contenido) con el estado nuevo.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.subscriptions'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.subscriptions DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('scheduled', 'active', 'paused', 'expired'));

-- Una sola suscripción activa por cliente. Si hoy hay duplicados NO se arreglan solos (no sé
-- cuál vale): la migración aborta y lista los clientes. Resuélvelos y vuelve a correrla.
DO $$
DECLARE v_dups text;
BEGIN
  SELECT string_agg(client_id::text || ' (' || n || ')', ', ') INTO v_dups
  FROM (SELECT client_id, count(*) n FROM public.subscriptions
        WHERE status = 'active' GROUP BY client_id HAVING count(*) > 1) d;
  IF v_dups IS NOT NULL THEN
    RAISE EXCEPTION 'Clientes con más de una suscripción activa: %. Deja solo una activa y reintenta.', v_dups;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_subscriptions_one_active_per_client
  ON public.subscriptions(client_id) WHERE status = 'active';

-- Al INSERTAR una suscripción activa/programada, su rango no puede pisar el de otra activa o
-- programada del mismo cliente. Adyacentes sí (start_date nueva = end_date anterior). Solo valida
-- inserts nuevos: el historial existente no se re-valida. Se llama "a_" para correr antes de
-- subscriptions_set_end_date; igual calcula su propio fin (start_date + 3 meses).
CREATE OR REPLACE FUNCTION public.subscriptions_check_overlap()
RETURNS TRIGGER AS $$
DECLARE
  v_end date := (NEW.start_date + interval '3 months')::date;
BEGIN
  IF NEW.status IN ('active', 'scheduled') AND EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.client_id = NEW.client_id
      AND s.status IN ('active', 'scheduled')
      AND s.start_date < v_end
      AND s.end_date > NEW.start_date
  ) THEN
    RAISE EXCEPTION 'La suscripción se solapa con otra activa o programada del cliente (la nueva debe empezar el día en que termina la anterior)'
      USING ERRCODE = 'P0003';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS a_subscriptions_check_overlap ON public.subscriptions;
CREATE TRIGGER a_subscriptions_check_overlap
  BEFORE INSERT ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.subscriptions_check_overlap();

-- Job idempotente: (1) finaliza lo que llegó a end_date, (2) activa las programadas cuyo
-- start_date ya llegó y el cliente quedó sin activa. Orden importa por el índice único.
-- "Hoy" = fecha de Santiago. Devuelve cuántas filas cambió.
CREATE OR REPLACE FUNCTION public.roll_subscriptions()
RETURNS int AS $$
DECLARE
  v_today     date := (now() AT TIME ZONE 'America/Santiago')::date;
  v_expired   int;
  v_activated int;
BEGIN
  UPDATE public.subscriptions
  SET status = 'expired'
  WHERE status IN ('active', 'paused', 'scheduled') AND end_date <= v_today;
  GET DIAGNOSTICS v_expired = ROW_COUNT;

  UPDATE public.subscriptions s
  SET status = 'active'
  WHERE s.status = 'scheduled'
    AND s.start_date <= v_today
    AND NOT EXISTS (SELECT 1 FROM public.subscriptions a
                    WHERE a.client_id = s.client_id AND a.status = 'active');
  GET DIAGNOSTICS v_activated = ROW_COUNT;

  RETURN v_expired + v_activated;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.roll_subscriptions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.roll_subscriptions() TO service_role;

-- Cada 15 min (idempotente). La vista de saldo (migración 05) además decide "vigente" por fecha,
-- así que un retraso del cron no deja a nadie con clases de más ni de menos.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'roll-subscriptions';
SELECT cron.schedule('roll-subscriptions', '*/15 * * * *', 'SELECT public.roll_subscriptions()');

-- Aplica ya el estado correcto a lo existente (activas con end_date vencido pasan a expired).
SELECT public.roll_subscriptions();

COMMIT;

-- ── REVERSA (manual) ─────────────────────────────────────────
-- SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'roll-subscriptions';
-- DROP TRIGGER IF EXISTS a_subscriptions_check_overlap ON public.subscriptions;
-- DROP FUNCTION IF EXISTS public.subscriptions_check_overlap();
-- DROP FUNCTION IF EXISTS public.roll_subscriptions();
-- DROP INDEX IF EXISTS public.uq_subscriptions_one_active_per_client;
-- UPDATE public.subscriptions SET status = 'active' WHERE status = 'scheduled';  -- antes de recrear el CHECK
-- ALTER TABLE public.subscriptions DROP CONSTRAINT subscriptions_status_check;
-- ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_status_check
--   CHECK (status IN ('active', 'paused', 'expired'));
-- (las suscripciones que roll_subscriptions() ya marcó 'expired' no se reabren solas)
