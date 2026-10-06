-- ============================================================
-- SOLO LECTURA. Previo a 2026-10-06_01_one_refund_per_booking.sql.
-- Lista las reservas con MÁS DE UN ajuste positivo. Debe devolver 0 filas; si devuelve alguna, el
-- índice único fallaría (la migración aborta con el mismo listado). Revisa cada una y deja un solo
-- ajuste positivo por reserva (p.ej. cambia el booking_id del sobrante a NULL).
-- ============================================================
SELECT
  a.booking_id,
  pr.full_name,
  count(*)                         AS ajustes_positivos,
  sum(a.quantity)                  AS clases_devueltas,
  array_agg(a.id ORDER BY a.created_at)     AS ajustes,
  array_agg(a.reason ORDER BY a.created_at) AS motivos
FROM public.class_adjustments a
JOIN public.bookings b  ON b.id = a.booking_id
JOIN public.profiles pr ON pr.id = b.client_id
WHERE a.booking_id IS NOT NULL AND a.quantity > 0
GROUP BY a.booking_id, pr.full_name
HAVING count(*) > 1;
