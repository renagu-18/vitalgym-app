-- ============================================================
-- PRE-MIGRACIÓN — SOLO LECTURA. Compara, por suscripción activa, el saldo que muestra hoy la
-- app (subscriptions.classes_remaining) contra el que daría la fórmula nueva, y calcula el
-- ajuste "saldo inicial migración" que la migración 05 insertaría para dejarlos idénticos.
--
-- No depende de objetos nuevos: replica la fórmula de la vista subscription_class_balance con
-- las columnas que existen hoy (todavía no hay no_show ni late_cancel, así que "usadas" =
-- reservas 'completed'). Si la fórmula y la vista están alineadas, esta columna
-- `ajuste_a_insertar` es exactamente lo que la migración inserta.
--
-- Cómo leerla:
--   * saldo_nuevo_con_ajuste debe ser IGUAL a classes_remaining en todas las filas (diff = 0).
--   * ajuste_a_insertar grande/negativo en un cliente = su contador actual no cuadra con sus
--     reservas completadas (p.ej. el bug histórico de clases sin descontar, o clases editadas
--     a mano). Es esperable; revísalo con criterio humano antes de migrar.
--   * Ilimitados (>= 9999) se omiten: no tienen ajuste ni saldo numérico.
-- ============================================================

WITH today AS (SELECT (now() AT TIME ZONE 'America/Santiago')::date AS d),

used AS (   -- clases usadas por suscripción: por cliente y por rango [start_date, end_date)
  SELECT a.subscription_id, count(*)::int AS used
  FROM (
    SELECT bk.client_id, (tb.start_time AT TIME ZONE 'America/Santiago')::date AS class_date
    FROM public.bookings bk
    JOIN public.time_blocks tb ON tb.id = bk.time_block_id
    WHERE bk.status = 'completed'
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

calc AS (
  SELECT
    s.id AS subscription_id, s.client_id, pr.full_name, p.name AS plan, s.start_date, s.end_date,
    s.classes_remaining,
    CASE
      WHEN p.name = 'Clases de prueba' THEN               -- is_trial: 1 clase en total
        CASE WHEN t.d >= s.start_date THEN p.classes_per_month ELSE 0 END
      ELSE p.classes_per_month * (
        (t.d >= s.start_date)::int
        + (t.d >= (s.start_date + interval '1 month')::date)::int
        + (t.d >= (s.start_date + interval '2 months')::date)::int)
    END AS entitled,
    COALESCE(u.used, 0) AS used
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  JOIN public.profiles pr ON pr.id = s.client_id
  CROSS JOIN today t
  LEFT JOIN used u ON u.subscription_id = s.id
  WHERE s.status = 'active' AND p.classes_per_month < 9999
)
SELECT
  full_name, plan, start_date, end_date,
  classes_remaining                                   AS saldo_actual,
  entitled                                            AS derecho_plan,
  used                                                AS usadas,
  classes_remaining - (entitled - used)               AS ajuste_a_insertar,
  (entitled - used) + (classes_remaining - (entitled - used)) AS saldo_nuevo_con_ajuste,
  classes_remaining - ((entitled - used) + (classes_remaining - (entitled - used))) AS diff
FROM calc
ORDER BY abs(classes_remaining - (entitled - used)) DESC, full_name;
