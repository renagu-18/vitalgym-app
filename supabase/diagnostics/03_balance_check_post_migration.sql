-- ============================================================
-- POST-MIGRACIÓN — SOLO LECTURA. Verifica que la vista nueva deja a cada cliente con el mismo
-- saldo que tenía antes de migrar (subscriptions.classes_remaining queda congelado como
-- legado, así que sirve de referencia mientras no haya reservas nuevas desde la migración).
--
-- Corre en el SQL Editor como postgres: se consulta la vista interna _subscription_balance_calc
-- (la pública filtra por auth.uid() y devolvería 0 filas sin sesión de usuario).
--
-- Esperado: 0 filas con diff <> 0. Si pasó tiempo desde la migración y hubo clases
-- completadas/ajustes, las diferencias son legítimas (el contador legado ya no se actualiza).
-- ============================================================
SELECT
  pr.full_name, c.plan_name, c.start_date, c.end_date,
  s.classes_remaining       AS saldo_legado,
  c.available               AS saldo_vista,
  c.available - s.classes_remaining AS diff
FROM public._subscription_balance_calc c
JOIN public.subscriptions s ON s.id = c.subscription_id
JOIN public.profiles pr ON pr.id = c.client_id
WHERE s.status = 'active' AND NOT c.is_unlimited
ORDER BY abs(c.available - s.classes_remaining) DESC, pr.full_name;
