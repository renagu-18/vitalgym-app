-- ============================================================
-- Introspección de PRODUCCIÓN — SOLO LECTURA. Correr ANTES de aplicar las migraciones
-- 2026-10-05_*. Pegar completo en Supabase Dashboard > SQL Editor; devuelve una sola tabla
-- (section, item, detail). Pásale el resultado a quien revise las migraciones.
--
-- Objetivo: confirmar que producción coincide con supabase/schema.sql (ya hubo un desvío:
-- bookings_status_check desactualizado) y detectar datos que harían fallar una migración.
-- ============================================================

WITH
t(name) AS (VALUES ('profiles'),('plans'),('subscriptions'),('payments'),('time_blocks'),('bookings')),

cols AS (
  SELECT '1_columns' AS section, c.table_name || '.' || c.column_name AS item,
         c.data_type || CASE WHEN c.is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END
         || COALESCE(' DEFAULT ' || c.column_default, '') AS detail
  FROM information_schema.columns c JOIN t ON t.name = c.table_name
  WHERE c.table_schema = 'public'
),
cons AS (
  SELECT '2_constraints', cl.relname || '.' || co.conname, pg_get_constraintdef(co.oid)
  FROM pg_constraint co
  JOIN pg_class cl ON cl.oid = co.conrelid
  JOIN t ON t.name = cl.relname
  WHERE cl.relnamespace = 'public'::regnamespace
),
idx AS (
  SELECT '3_indexes', tablename || '.' || indexname, indexdef
  FROM pg_indexes WHERE schemaname = 'public' AND tablename IN (SELECT name FROM t)
),
trg AS (
  SELECT '4_triggers', cl.relname || '.' || tg.tgname, pg_get_triggerdef(tg.oid)
  FROM pg_trigger tg JOIN pg_class cl ON cl.oid = tg.tgrelid
  WHERE NOT tg.tgisinternal AND cl.relnamespace = 'public'::regnamespace
    AND cl.relname IN (SELECT name FROM t)
),
rls AS (
  SELECT '5_rls_enabled', cl.relname, CASE WHEN cl.relrowsecurity THEN 'RLS ON' ELSE '*** RLS OFF ***' END
  FROM pg_class cl
  WHERE cl.relnamespace = 'public'::regnamespace AND cl.relkind = 'r'
),
pol AS (
  SELECT '6_policies', tablename || '.' || policyname,
         cmd || ' | USING ' || COALESCE(qual, '-') || ' | CHECK ' || COALESCE(with_check, '-')
  FROM pg_policies WHERE schemaname = 'public'
),
fns AS (
  SELECT '7_functions', p.proname, pg_get_functiondef(p.oid)
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname IN ('complete_past_bookings','decrement_subscription_classes','sync_block_count',
                      'generate_subscription_payments','set_subscription_end_date','handle_new_user',
                      'monthly_classes_reset','book_time_block','is_admin')
),
cronjobs AS (
  SELECT '8_cron', jobname, schedule || ' | active=' || active || ' | ' || command
  FROM cron.job
),
-- ── Datos que podrían romper las migraciones ─────────────────────────────────
dup_active AS (
  SELECT '9_DATA_clients_with_2+_active_subs', client_id::text, count(*) || ' suscripciones activas'
  FROM public.subscriptions WHERE status = 'active'
  GROUP BY client_id HAVING count(*) > 1
),
future_active AS (
  SELECT '9_DATA_active_with_future_start', id::text,
         'client ' || client_id || ' start ' || start_date || ' end ' || end_date
  FROM public.subscriptions WHERE status = 'active' AND start_date > current_date
),
past_active AS (
  SELECT '9_DATA_active_but_past_end_date', id::text,
         'client ' || client_id || ' end ' || end_date || ' (roll_subscriptions() las marcará expired)'
  FROM public.subscriptions WHERE status = 'active' AND end_date <= current_date
),
pay_per_sub AS (
  SELECT '9_DATA_subs_with_payments_count_not_3', subscription_id::text, count(*) || ' pagos'
  FROM public.payments GROUP BY subscription_id HAVING count(*) <> 3
),
status_counts AS (
  SELECT '9_DATA_status_counts', 'subscriptions.' || status, count(*)::text FROM public.subscriptions GROUP BY status
  UNION ALL
  SELECT '9_DATA_status_counts', 'bookings.' || status, count(*)::text FROM public.bookings GROUP BY status
  UNION ALL
  SELECT '9_DATA_status_counts', 'payments.' || status, count(*)::text FROM public.payments GROUP BY status
),
stuck_bookings AS (
  SELECT '9_DATA_approved_bookings_already_past', bk.id::text, 'client ' || bk.client_id || ' ' || tb.start_time
  FROM public.bookings bk JOIN public.time_blocks tb ON tb.id = bk.time_block_id
  WHERE bk.status = 'approved' AND tb.start_time <= now()
)
SELECT * FROM cols
UNION ALL SELECT * FROM cons
UNION ALL SELECT * FROM idx
UNION ALL SELECT * FROM trg
UNION ALL SELECT * FROM rls
UNION ALL SELECT * FROM pol
UNION ALL SELECT * FROM fns
UNION ALL SELECT * FROM cronjobs
UNION ALL SELECT * FROM dup_active
UNION ALL SELECT * FROM future_active
UNION ALL SELECT * FROM past_active
UNION ALL SELECT * FROM pay_per_sub
UNION ALL SELECT * FROM status_counts
UNION ALL SELECT * FROM stuck_bookings
ORDER BY 1, 2;

-- Lo que hay que mirar primero:
--   * section 9_DATA_clients_with_2+_active_subs: DEBE estar vacía. Si no, la migración
--     2026-10-05_04 aborta a propósito (no decide por ti cuál suscripción vale).
--   * 1_columns profiles: ¿existe una columna de edad (age)? El repo no la tiene.
--   * 2_constraints: nombres reales de los CHECK de status (las migraciones los buscan por
--     contenido, pero conviene verlos).
--   * 6_policies sobre profiles y bookings: confirmar que son las del repo.
