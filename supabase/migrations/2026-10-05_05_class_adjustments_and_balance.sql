-- ============================================================
-- 05 · class_adjustments + saldo de clases derivado + historial de suscripciones
-- Requiere 01–04 aplicadas (usa bookings.late_cancel, subscriptions 'scheduled', payments.due_date).
-- Idempotente. Reversa al final (comentada). No borra datos ni columnas.
--
-- MODELO DE SALDO (reemplaza el contador subscriptions.classes_remaining, que queda congelado
-- como legado y ya nadie escribe):
--
--   disponibles = derecho_del_plan + SUM(ajustes) - usadas
--
--   derecho_del_plan  classes_per_month × cuotas iniciadas (1, 2 o 3; la cuota n inicia en
--                     start_date + (n-1) meses, igual que los vencimientos de pago). Las clases
--                     sin usar se arrastran dentro del trimestre; al llegar end_date la suscripción
--                     deja de ser vigente y su saldo se pierde (available = 0, lost_classes
--                     informa cuántas), salvo que el admin las sume como ajuste a la NUEVA suscripción.
--                     Plan de prueba (plans.is_trial): classes_per_month en total, no ×3.
--                     Plan ilimitado (>= 9999): sin saldo numérico; available = 9999 (sentinel).
--   ajustes           class_adjustments.quantity de esa suscripción (+/-).
--   usadas            reservas del CLIENTE con estado completed, no_show o cancelled+late_cancel
--                     cuya fecha de clase (hora de Santiago) cae en [start_date, end_date) de la
--                     suscripción. bookings no tiene subscription_id: se asigna por cliente y rango.
--                     Cada reserva cuenta en UNA sola suscripción: si los rangos se solaparan
--                     (datos viejos de renovaciones anticipadas) gana la de start_date más reciente.
--                     Renovación adyacente (start nueva = end anterior, end exclusivo): una clase
--                     del día del corte cuenta en la nueva, nunca en ambas. Una suscripción
--                     scheduled no tiene clases usadas hasta que llegue su start_date.
-- ============================================================
BEGIN;

-- ── plans.is_trial ───────────────────────────────────────────────────────────
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS is_trial boolean NOT NULL DEFAULT false;
UPDATE public.plans SET is_trial = true WHERE name = 'Clases de prueba' AND NOT is_trial;

-- ── class_adjustments ───────────────────────────────────────────────────────
-- reason es texto libre; valores sugeridos: recuperación, cortesía, corrección, reagendada,
-- arrastre, saldo inicial migración.
CREATE TABLE IF NOT EXISTS public.class_adjustments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id  uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  quantity         int  NOT NULL CHECK (quantity <> 0),            -- + suma clases, - resta
  reason           text NOT NULL CHECK (length(btrim(reason)) > 0),
  booking_id       uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  created_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_class_adjustments_subscription ON public.class_adjustments(subscription_id);
CREATE INDEX IF NOT EXISTS idx_class_adjustments_booking ON public.class_adjustments(booking_id);

ALTER TABLE public.class_adjustments ENABLE ROW LEVEL SECURITY;
-- Los privilegios de tabla los da Supabase por defecto; se explicitan acá y el RLS decide quién
-- escribe (solo admin) y qué ve cada cliente (solo lo suyo).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_adjustments TO authenticated;

DROP POLICY IF EXISTS "Admin gestiona ajustes de clases" ON public.class_adjustments;
CREATE POLICY "Admin gestiona ajustes de clases" ON public.class_adjustments
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Cliente lee sus ajustes de clases" ON public.class_adjustments;
CREATE POLICY "Cliente lee sus ajustes de clases" ON public.class_adjustments
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.id = subscription_id AND s.client_id = auth.uid()
  ));

-- ── Vista interna con el cálculo (sin filtro por usuario) ────────────────────
-- Es la única fuente del saldo. No es accesible desde la API: solo la leen las vistas públicas
-- de abajo (que filtran por usuario) y el SQL Editor / service_role.
CREATE OR REPLACE VIEW public._subscription_balance_calc AS
WITH
today AS (SELECT (now() AT TIME ZONE 'America/Santiago')::date AS d),

used_classes AS (
  SELECT a.subscription_id, count(*)::int AS used
  FROM (
    SELECT bk.client_id, (tb.start_time AT TIME ZONE 'America/Santiago')::date AS class_date
    FROM public.bookings bk
    JOIN public.time_blocks tb ON tb.id = bk.time_block_id
    WHERE bk.status IN ('completed', 'no_show')
       OR (bk.status = 'cancelled' AND bk.late_cancel)
  ) c
  CROSS JOIN LATERAL (
    SELECT s.id AS subscription_id
    FROM public.subscriptions s
    WHERE s.client_id = c.client_id
      AND c.class_date >= s.start_date AND c.class_date < s.end_date
    ORDER BY s.start_date DESC, s.created_at DESC
    LIMIT 1
  ) a
  GROUP BY a.subscription_id
),

adj AS (
  SELECT subscription_id, sum(quantity)::int AS adjustments
  FROM public.class_adjustments GROUP BY subscription_id
),

base AS (
  SELECT
    s.id AS subscription_id, s.client_id, s.plan_id, p.name AS plan_name,
    s.status, s.start_date, s.end_date, t.d AS as_of,
    (p.classes_per_month >= 9999) AS is_unlimited,
    p.classes_per_month AS plan_classes_per_month,
    ((t.d >= s.start_date)::int
      + (t.d >= (s.start_date + interval '1 month')::date)::int
      + (t.d >= (s.start_date + interval '2 months')::date)::int) AS installments_started,
    CASE
      WHEN p.classes_per_month >= 9999 THEN NULL
      WHEN p.is_trial THEN CASE WHEN t.d >= s.start_date THEN p.classes_per_month ELSE 0 END
      ELSE p.classes_per_month * (
        (t.d >= s.start_date)::int
        + (t.d >= (s.start_date + interval '1 month')::date)::int
        + (t.d >= (s.start_date + interval '2 months')::date)::int)
    END AS entitled,
    COALESCE(ad.adjustments, 0) AS adjustments,
    COALESCE(u.used, 0)         AS used,
    -- vigente: activa que aún no llegó a end_date (se ignora start_date para no cambiar el
    -- comportamiento de activas con inicio futuro creadas antes de existir 'scheduled'), o
    -- programada cuyo rango ya incluye hoy (cubre el retraso del cron al cambiar de día).
    ((s.status = 'active' AND t.d < s.end_date)
      OR (s.status = 'scheduled' AND t.d >= s.start_date AND t.d < s.end_date)) AS is_current
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  CROSS JOIN today t
  LEFT JOIN used_classes u ON u.subscription_id = s.id
  LEFT JOIN adj ad ON ad.subscription_id = s.id
)
SELECT
  b.subscription_id, b.client_id, b.plan_id, b.plan_name, b.status, b.start_date, b.end_date, b.as_of,
  b.is_unlimited, b.plan_classes_per_month, b.installments_started,
  b.entitled, b.adjustments, b.used,
  CASE WHEN b.is_unlimited THEN NULL ELSE b.entitled + b.adjustments - b.used END AS balance,
  b.is_current,
  -- Lo que puede reservar hoy: 0 si no es vigente (finalizada, pausada, programada futura).
  CASE
    WHEN NOT b.is_current THEN 0
    WHEN b.is_unlimited   THEN 9999
    ELSE GREATEST(b.entitled + b.adjustments - b.used, 0)
  END AS available,
  -- Informativo: clases que sobraron al cerrar el trimestre y se perdieron. Para suscripciones
  -- cerradas anticipadamente por el flujo viejo sobrestima (cuenta las 3 cuotas completas).
  CASE
    WHEN b.is_unlimited OR b.is_current OR b.status = 'scheduled' THEN 0
    ELSE GREATEST(b.entitled + b.adjustments - b.used, 0)
  END AS lost_classes
FROM base b;

REVOKE ALL ON public._subscription_balance_calc FROM PUBLIC, anon, authenticated;

-- ── Vista pública: saldo por suscripción ────────────────────────────────────
-- Corre con permisos del dueño (necesita ver reservas/bloques inactivos que el RLS le oculta a
-- un cliente) pero SOLO devuelve filas del usuario que consulta, o todas si es admin.
-- Uso: SELECT available FROM subscription_class_balance WHERE is_current;
CREATE OR REPLACE VIEW public.subscription_class_balance
WITH (security_invoker = false) AS
SELECT * FROM public._subscription_balance_calc
WHERE client_id = auth.uid() OR public.is_admin();

-- ── Vista pública: historial de suscripciones por cliente (más reciente primero) ──
-- effective_status refleja las fechas aunque el cron no haya corrido todavía.
-- Uso: SELECT * FROM subscription_history WHERE client_id = '<uuid>';
CREATE OR REPLACE VIEW public.subscription_history
WITH (security_invoker = false) AS
SELECT
  c.client_id, c.subscription_id, c.plan_name, c.start_date, c.end_date, c.status,
  CASE
    WHEN c.status = 'active'    AND c.as_of >= c.end_date THEN 'expired'
    WHEN c.status = 'scheduled' AND c.is_current          THEN 'active'
    ELSE c.status
  END AS effective_status,
  c.entitled, c.adjustments, c.used, c.balance, c.lost_classes,
  COALESCE(pay.paid, 0)    AS payments_paid,
  COALESCE(pay.pending, 0) AS payments_pending,
  COALESCE(pay.overdue, 0) AS payments_overdue   -- calculado: pending con due_date < hoy
FROM public._subscription_balance_calc c
LEFT JOIN LATERAL (
  SELECT
    count(*) FILTER (WHERE p.status = 'paid')                                  AS paid,
    count(*) FILTER (WHERE p.status <> 'paid')                                 AS pending,
    count(*) FILTER (WHERE p.status <> 'paid' AND p.due_date < c.as_of)        AS overdue
  FROM public.payments p WHERE p.subscription_id = c.subscription_id
) pay ON true
WHERE c.client_id = auth.uid() OR public.is_admin()
ORDER BY c.client_id, c.start_date DESC, c.subscription_id;

GRANT SELECT ON public.subscription_class_balance, public.subscription_history TO authenticated;
REVOKE ALL ON public.subscription_class_balance, public.subscription_history FROM anon;

-- ── Apagar el reseteo mensual ───────────────────────────────────────────────
-- Ya no hay contador que rellenar: el derecho mensual lo da la fórmula. Si siguiera corriendo
-- seguiría subiendo classes_remaining (legado), sin efecto pero confuso. La función
-- monthly_classes_reset() queda definida por si hay que volver atrás.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'monthly-classes-reset';

-- ── Saldo inicial: deja a cada activa con EXACTAMENTE su saldo actual ───────
-- ajuste = classes_remaining (lo que ve el cliente hoy) − saldo que daría la fórmula.
-- Una sola vez por suscripción (idempotente). Ilimitadas se omiten. Verificar antes con
-- supabase/diagnostics/02_balance_preview_pre_migration.sql y después con 03.
INSERT INTO public.class_adjustments (subscription_id, quantity, reason, created_by)
SELECT c.subscription_id, s.classes_remaining - c.balance, 'saldo inicial migración', NULL
FROM public._subscription_balance_calc c
JOIN public.subscriptions s ON s.id = c.subscription_id
WHERE s.status = 'active'
  AND NOT c.is_unlimited
  AND s.classes_remaining - c.balance <> 0
  AND NOT EXISTS (
    SELECT 1 FROM public.class_adjustments a
    WHERE a.subscription_id = c.subscription_id AND a.reason = 'saldo inicial migración'
  );

COMMIT;

-- ── REVERSA (manual) ─────────────────────────────────────────
-- DROP VIEW IF EXISTS public.subscription_history;
-- DROP VIEW IF EXISTS public.subscription_class_balance;
-- DROP VIEW IF EXISTS public._subscription_balance_calc;
-- DROP TABLE IF EXISTS public.class_adjustments;   -- destruye los ajustes cargados
-- ALTER TABLE public.plans DROP COLUMN IF EXISTS is_trial;
-- SELECT cron.schedule('monthly-classes-reset', '5 0 * * *', 'SELECT monthly_classes_reset()');
-- (classes_remaining quedó congelado en la fecha de migración: habría que recalcularlo.)
