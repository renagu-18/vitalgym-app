-- ============================================================
-- Los planes gratis (clase de prueba, Pack Familia: price_monthly = 0) ya no generan cuotas.
-- NO APLICADA. Correr antes diagnostics/06_free_plan_payments_check.sql para ver qué se borra.
-- Idempotente. Reversa al final.
--
-- Antes, crear una suscripción gratis generaba 3 pagos pendientes de $0 (una "deuda" de tres meses
-- sin sentido en Pagos y en el contador "Pagos por cobrar").
-- ============================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.generate_subscription_payments()
RETURNS TRIGGER AS $$
DECLARE
  v_price int;
BEGIN
  SELECT price_monthly INTO v_price FROM public.plans WHERE id = NEW.plan_id;

  -- Plan gratis: no hay nada que cobrar, no se crea ninguna cuota.
  IF COALESCE(v_price, 0) = 0 THEN
    RETURN NEW;
  END IF;

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

-- Limpieza: borra SOLO las cuotas de $0 que generó el trigger y siguen pendientes. No toca pagos
-- pagados, ni de monto > 0, ni los creados a mano (distinta nota).
DELETE FROM public.payments
WHERE amount = 0
  AND status = 'pending'
  AND notes = 'Generado automáticamente al crear suscripción';

COMMIT;

-- ── REVERSA (manual) ─────────────────────────────────────────
-- Restaurar generate_subscription_payments() sin el IF de plan gratis (versión de
-- 2026-10-05_01_payments_due_date.sql). Los pagos de $0 borrados no se recuperan solos.
