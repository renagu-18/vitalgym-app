-- ============================================================
-- 01 · payments.due_date
-- Idempotente. Reversa al final (comentada).
-- "Vencido" NO es un estado almacenado: se calcula como status='pending' AND due_date < hoy.
-- ============================================================
BEGIN;

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS due_date date;

-- Relleno de pagos existentes: due_date = start_date de su suscripción + N meses, donde N es la
-- diferencia de meses calendario entre payments.month y start_date. Los pagos autogenerados
-- tienen month = start_date + N meses, así que N = 0, 1, 2 exacto; los creados a mano (month =
-- primer día de un mes) caen en el mes que corresponde. Nunca antes de start_date.
UPDATE public.payments p
SET due_date = (
  s.start_date + make_interval(months => GREATEST(
    (EXTRACT(YEAR FROM p.month)::int * 12 + EXTRACT(MONTH FROM p.month)::int)
    - (EXTRACT(YEAR FROM s.start_date)::int * 12 + EXTRACT(MONTH FROM s.start_date)::int), 0))
)::date
FROM public.subscriptions s
WHERE s.id = p.subscription_id AND p.due_date IS NULL;

-- Pagos creados a mano desde el panel (CreatePaymentForm) no mandan due_date: por defecto = month.
CREATE OR REPLACE FUNCTION public.payments_default_due_date()
RETURNS TRIGGER AS $$
BEGIN
  NEW.due_date := COALESCE(NEW.due_date, NEW.month);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS payments_default_due_date ON public.payments;
CREATE TRIGGER payments_default_due_date
  BEFORE INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.payments_default_due_date();

ALTER TABLE public.payments ALTER COLUMN due_date SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_due_date ON public.payments(due_date);

-- Cuota 1 vence en start_date, la 2 en +1 mes, la 3 en +2 meses (interval ajusta fines de mes).
CREATE OR REPLACE FUNCTION public.generate_subscription_payments()
RETURNS TRIGGER AS $$
DECLARE
  v_price int;
BEGIN
  SELECT price_monthly INTO v_price FROM public.plans WHERE id = NEW.plan_id;

  INSERT INTO public.payments (client_id, subscription_id, amount, month, due_date, status, notes)
  VALUES
    (NEW.client_id, NEW.id, v_price, NEW.start_date,
      NEW.start_date, 'pending', 'Generado automáticamente al crear suscripción'),
    (NEW.client_id, NEW.id, v_price, (NEW.start_date + interval '1 month')::date,
      (NEW.start_date + interval '1 month')::date, 'pending', 'Generado automáticamente al crear suscripción'),
    (NEW.client_id, NEW.id, v_price, (NEW.start_date + interval '2 months')::date,
      (NEW.start_date + interval '2 months')::date, 'pending', 'Generado automáticamente al crear suscripción');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;

-- ── REVERSA (manual) ─────────────────────────────────────────
-- DROP TRIGGER IF EXISTS payments_default_due_date ON public.payments;
-- DROP FUNCTION IF EXISTS public.payments_default_due_date();
-- DROP INDEX IF EXISTS public.idx_payments_due_date;
-- ALTER TABLE public.payments DROP COLUMN IF EXISTS due_date;
-- y re-crear generate_subscription_payments() sin due_date (versión en schema.sql, git log).
