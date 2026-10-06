-- ============================================================
-- SOLO LECTURA. Previo a 2026-10-07_01_no_payments_for_free_plans.sql, y para diagnosticar clientes
-- que quedaron con 0 clases tras pasar de clase de prueba a un plan.
-- Resultado único (section, ...). Mira las dos secciones:
--
--  1_pagos_cero_que_se_borran : cuotas de $0 pendientes autogeneradas; son las que la migración borra.
--  2_programadas_sin_activa   : clientes cuya suscripción quedó 'scheduled' (inicio futuro) y sin
--                               ninguna activa. Ese es el caso de "clases en 0": mientras no llegue
--                               start_date el plan no está vigente. Se arregla en la ficha del
--                               cliente con el botón "Iniciar hoy".
-- ============================================================
SELECT '1_pagos_cero_que_se_borran' AS section, pr.full_name,
       p.due_date::text AS dato1, p.status AS dato2, p.id::text AS id
FROM public.payments p JOIN public.profiles pr ON pr.id = p.client_id
WHERE p.amount = 0 AND p.status = 'pending'
  AND p.notes = 'Generado automáticamente al crear suscripción'
UNION ALL
SELECT '2_programadas_sin_activa', pr.full_name,
       s.start_date::text || ' (' || pl.name || ')', s.status, s.id::text
FROM public.subscriptions s
JOIN public.profiles pr ON pr.id = s.client_id
JOIN public.plans pl ON pl.id = s.plan_id
WHERE s.status = 'scheduled'
  AND NOT EXISTS (SELECT 1 FROM public.subscriptions a WHERE a.client_id = s.client_id AND a.status = 'active')
ORDER BY 1, 2;
