-- ============================================================
-- Reconciliar pagos con status = 'overdue' y dejar de permitirlo.
-- NO APLICADA. Correr antes diagnostics/05_overdue_status_check.sql para ver qué filas toca.
-- Idempotente. Reversa al final.
--
-- "Vencido" se calcula (status <> 'paid' AND due_date < hoy en Santiago); no es un estado. Las filas
-- que el botón "Vencido" dejó guardadas vuelven a 'pending': ninguna estaba pagada (paid_at ya era
-- NULL) y, si su due_date pasó, la app las sigue mostrando vencidas. Después el CHECK solo admite
-- 'pending' y 'paid'. El código nuevo ya no escribe 'overdue', así que se puede aplicar antes o
-- después del despliegue; hasta aplicarla, la app ignora el valor guardado.
-- ============================================================
BEGIN;

UPDATE public.payments SET status = 'pending', paid_at = NULL WHERE status = 'overdue';

-- Reemplaza el CHECK de status (buscado por contenido, como en las otras migraciones).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.payments'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.payments DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.payments ADD CONSTRAINT payments_status_check
  CHECK (status IN ('pending', 'paid'));

COMMIT;

-- ── REVERSA (manual) ─────────────────────────────────────────
-- ALTER TABLE public.payments DROP CONSTRAINT payments_status_check;
-- ALTER TABLE public.payments ADD CONSTRAINT payments_status_check
--   CHECK (status IN ('pending', 'paid', 'overdue'));
-- (las filas que volvieron a 'pending' no se vuelven a marcar 'overdue' solas)
