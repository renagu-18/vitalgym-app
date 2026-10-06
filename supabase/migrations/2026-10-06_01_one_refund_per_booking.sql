-- ============================================================
-- Una sola devolución de clase por reserva (índice único parcial).
-- NO APLICADA. Correr antes diagnostics/04_duplicate_refunds_check.sql: debe devolver 0 filas.
-- Idempotente. Reversa al final.
--
-- Regla: como máximo UN ajuste positivo (quantity > 0) por booking_id. Los ajustes sin reserva
-- (booking_id NULL) y los negativos no se restringen. returnClass() ya lo revisa en el servidor;
-- el índice cierra la carrera de dos clics casi simultáneos.
-- ============================================================
BEGIN;

-- Si hay duplicados NO se arreglan solos (no sé cuál borrar): aborta y lista las reservas.
DO $$
DECLARE v_dups text;
BEGIN
  SELECT string_agg(booking_id::text || ' (' || n || ')', ', ') INTO v_dups
  FROM (SELECT booking_id, count(*) n FROM public.class_adjustments
        WHERE booking_id IS NOT NULL AND quantity > 0
        GROUP BY booking_id HAVING count(*) > 1) d;
  IF v_dups IS NOT NULL THEN
    RAISE EXCEPTION 'Reservas con más de un ajuste positivo: %. Deja uno por reserva y reintenta.', v_dups;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_class_adjustments_one_refund_per_booking
  ON public.class_adjustments(booking_id)
  WHERE booking_id IS NOT NULL AND quantity > 0;

COMMIT;

-- ── REVERSA (manual) ─────────────────────────────────────────
-- DROP INDEX IF EXISTS public.uq_class_adjustments_one_refund_per_booking;
