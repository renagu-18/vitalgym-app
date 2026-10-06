-- ============================================================
-- SOLO LECTURA. Previo a 2026-10-06_02_payments_overdue_reconcile.sql.
-- "Vencido" ya no se guarda: se calcula (pendiente con due_date < hoy, hora de Santiago).
-- Cuenta los pagos que quedaron guardados con status = 'overdue' (los dejó el botón "Vencido" que
-- se eliminó) y muestra cómo se verían tras reconciliar: siguen sin pagarse y el panel los
-- mostrará vencidos si su due_date ya pasó, sin depender del valor guardado.
-- ============================================================
SELECT
  p.id, pr.full_name, p.month, p.due_date, p.status AS status_guardado,
  CASE WHEN p.due_date < (now() AT TIME ZONE 'America/Santiago')::date
       THEN 'vencido (calculado)' ELSE 'pendiente (calculado)' END AS se_mostrara_como,
  p.paid_at
FROM public.payments p
JOIN public.profiles pr ON pr.id = p.client_id
WHERE p.status = 'overdue'
ORDER BY p.due_date;
-- Esperado tras la migración 02: 0 filas.
