-- ============================================================
-- VitalGym — Schema completo para Supabase
-- Ejecutar en: Supabase Dashboard > SQL Editor
--
-- Snapshot del estado final para instalaciones nuevas. En una base que ya existe NO se re-ejecuta:
-- se aplican las migraciones de supabase/migrations/ en orden (ver supabase/README.md). Este
-- archivo está sincronizado con 2026-10-05_01…05.
-- ============================================================

-- Requerida por los cron jobs de abajo (complete_past_bookings, monthly_classes_reset).
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- ─────────────────────────────────────────
-- 1. PROFILES (extiende auth.users)
-- ─────────────────────────────────────────
CREATE TABLE public.profiles (
  id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name    text NOT NULL,
  email        text,
  phone        text,
  role         text NOT NULL DEFAULT 'client' CHECK (role IN ('admin', 'client')),
  notify_via   text NOT NULL DEFAULT 'gmail' CHECK (notify_via IN ('whatsapp', 'gmail')),
  birth_date   date,           -- la edad se calcula desde acá; NULL en clientes antiguos
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Trigger: actualiza updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Trigger: crea el profile automáticamente al registrar usuario en auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_birth date;
BEGIN
  BEGIN
    v_birth := NULLIF(NEW.raw_user_meta_data->>'birth_date', '')::date;
  EXCEPTION WHEN others THEN
    v_birth := NULL;
  END;

  INSERT INTO public.profiles (id, full_name, email, phone, notify_via, birth_date)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email,
    NEW.raw_user_meta_data->>'phone',
    COALESCE(NEW.raw_user_meta_data->>'notify_via', 'gmail'),
    v_birth
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Hardening: las policies "Cliente edita su propio perfil" e "Insertar perfil propio" no tienen
-- WITH CHECK sobre columnas, así que un cliente podía hacerse admin (UPDATE ... SET role='admin').
-- Este trigger lo impide. auth.uid() IS NULL = SQL Editor / service_role / triggers de auth
-- (handle_new_user), que siguen pudiendo todo.
CREATE OR REPLACE FUNCTION public.profiles_guard_role()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.role <> 'client' THEN
    RAISE EXCEPTION 'No autorizado a crear un perfil con rol %', NEW.role USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'No autorizado a cambiar el rol' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS profiles_guard_role ON public.profiles;
CREATE TRIGGER profiles_guard_role
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_role();


-- ─────────────────────────────────────────
-- 2. PLANES
-- ─────────────────────────────────────────
CREATE TABLE public.plans (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text NOT NULL,
  classes_per_month  int NOT NULL,
  price_monthly      int NOT NULL,
  is_trial           boolean NOT NULL DEFAULT false, -- plan de prueba: classes_per_month en total, no por cuota
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- Datos iniciales de los packs
-- Pack Familia: clases ilimitadas (9999 = sentinel de "ilimitado" usado en toda la app) y gratis
-- Clases de prueba: 1 sola clase, gratis
INSERT INTO public.plans (name, classes_per_month, price_monthly) VALUES
  ('Pack Inicio',    8,  50000),
  ('Pack Transforma', 12, 64990),
  ('Pack Elite',     20, 94990),
  ('Pack Familia',   9999, 0),
  ('Clases de prueba', 1, 0);
UPDATE public.plans SET is_trial = true WHERE name = 'Clases de prueba';


-- ─────────────────────────────────────────
-- 3. SUSCRIPCIONES
-- ─────────────────────────────────────────
CREATE TABLE public.subscriptions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_id             uuid NOT NULL REFERENCES public.plans(id),
  start_date          date NOT NULL,
  end_date            date NOT NULL,
  status              text NOT NULL DEFAULT 'active' CHECK (status IN ('scheduled', 'active', 'paused', 'expired')),
  -- LEGADO: congelado desde 2026-10-05. El saldo real es la vista subscription_class_balance.
  classes_remaining   int NOT NULL DEFAULT 0,
  reset_day           int NOT NULL DEFAULT 1 CHECK (reset_day BETWEEN 1 AND 28),
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Función: ajusta en ±1 las clases restantes de la propia suscripción activa del cliente,
-- de forma atómica (evita condiciones de carrera) y sin necesitar permiso de UPDATE directo
-- sobre la tabla (RLS solo permite SELECT al cliente; el admin sigue gestionando todo lo demás).
-- Se usa desde requestBooking (delta -1) y cancelBooking (delta +1) en el cliente.
CREATE OR REPLACE FUNCTION public.adjust_my_subscription_classes(
  p_subscription_id uuid,
  p_delta int
)
RETURNS boolean AS $$
DECLARE
  v_updated int;
BEGIN
  IF p_delta NOT IN (-1, 1) THEN
    RAISE EXCEPTION 'delta inválido: %', p_delta;
  END IF;

  UPDATE public.subscriptions
  SET classes_remaining = classes_remaining + p_delta
  WHERE id = p_subscription_id
    AND client_id = auth.uid()
    AND status = 'active'
    AND classes_remaining < 9999           -- planes ilimitados no se tocan
    AND (p_delta = 1 OR classes_remaining > 0); -- solo descuenta si queda saldo

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE INDEX idx_subscriptions_client ON public.subscriptions(client_id);
CREATE INDEX idx_subscriptions_status ON public.subscriptions(status);

-- Trigger: end_date siempre es start_date + 3 meses, calculado por la base de datos.
-- Ignora cualquier valor de end_date que venga en el INSERT (el admin ya no lo ingresa a mano).
CREATE OR REPLACE FUNCTION public.set_subscription_end_date()
RETURNS TRIGGER AS $$
BEGIN
  NEW.end_date := (NEW.start_date + interval '3 months')::date;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER subscriptions_set_end_date
  BEFORE INSERT ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_subscription_end_date();

-- Una sola suscripción activa por cliente (en la migración 04 hay además un chequeo previo de duplicados).
CREATE UNIQUE INDEX IF NOT EXISTS uq_subscriptions_one_active_per_client
  ON public.subscriptions(client_id) WHERE status = 'active';

-- Al INSERTAR una suscripción activa/programada, su rango no puede pisar el de otra activa o
-- programada del mismo cliente. Adyacentes sí (start_date nueva = end_date anterior). Solo valida
-- inserts nuevos: el historial existente no se re-valida. Se llama "a_" para correr antes de
-- subscriptions_set_end_date; igual calcula su propio fin (start_date + 3 meses).
CREATE OR REPLACE FUNCTION public.subscriptions_check_overlap()
RETURNS TRIGGER AS $$
DECLARE
  v_end date := (NEW.start_date + interval '3 months')::date;
BEGIN
  IF NEW.status IN ('active', 'scheduled') AND EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.client_id = NEW.client_id
      AND s.status IN ('active', 'scheduled')
      AND s.start_date < v_end
      AND s.end_date > NEW.start_date
  ) THEN
    RAISE EXCEPTION 'La suscripción se solapa con otra activa o programada del cliente (la nueva debe empezar el día en que termina la anterior)'
      USING ERRCODE = 'P0003';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS a_subscriptions_check_overlap ON public.subscriptions;
CREATE TRIGGER a_subscriptions_check_overlap
  BEFORE INSERT ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.subscriptions_check_overlap();

-- Job idempotente: (1) finaliza lo que llegó a end_date, (2) activa las programadas cuyo
-- start_date ya llegó y el cliente quedó sin activa. Orden importa por el índice único.
-- "Hoy" = fecha de Santiago. Devuelve cuántas filas cambió.
CREATE OR REPLACE FUNCTION public.roll_subscriptions()
RETURNS int AS $$
DECLARE
  v_today     date := (now() AT TIME ZONE 'America/Santiago')::date;
  v_expired   int;
  v_activated int;
BEGIN
  UPDATE public.subscriptions
  SET status = 'expired'
  WHERE status IN ('active', 'paused', 'scheduled') AND end_date <= v_today;
  GET DIAGNOSTICS v_expired = ROW_COUNT;

  UPDATE public.subscriptions s
  SET status = 'active'
  WHERE s.status = 'scheduled'
    AND s.start_date <= v_today
    AND NOT EXISTS (SELECT 1 FROM public.subscriptions a
                    WHERE a.client_id = s.client_id AND a.status = 'active');
  GET DIAGNOSTICS v_activated = ROW_COUNT;

  RETURN v_expired + v_activated;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.roll_subscriptions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.roll_subscriptions() TO service_role;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'roll-subscriptions';
SELECT cron.schedule('roll-subscriptions', '*/15 * * * *', 'SELECT public.roll_subscriptions()');


-- ─────────────────────────────────────────
-- 4. PAGOS
-- ─────────────────────────────────────────
CREATE TABLE public.payments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subscription_id  uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  amount           int NOT NULL,
  month            date NOT NULL, -- primer día del mes pagado (ej: 2025-05-01)
  due_date         date NOT NULL, -- "vencido" se calcula: status = 'pending' y due_date < hoy
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue')),
  paid_at          timestamptz,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_client ON public.payments(client_id);
CREATE INDEX idx_payments_status ON public.payments(status);
CREATE INDEX idx_payments_due_date ON public.payments(due_date);

-- Trigger: al crear una suscripción, genera automáticamente los 3 pagos mensuales
-- correspondientes (mismo monto que el precio del plan, uno por cada mes que cubre la
-- suscripción). SECURITY DEFINER para no depender de que quien inserte en subscriptions
-- tenga además permiso de INSERT directo sobre payments.
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

CREATE TRIGGER subscriptions_generate_payments
  AFTER INSERT ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION generate_subscription_payments();


-- ─────────────────────────────────────────
-- 5. BLOQUES HORARIOS
-- ─────────────────────────────────────────
CREATE TABLE public.time_blocks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  start_time     timestamptz NOT NULL,
  end_time       timestamptz NOT NULL,
  max_capacity   int NOT NULL DEFAULT 3,
  current_count  int NOT NULL DEFAULT 0,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_time_blocks_start ON public.time_blocks(start_time);
CREATE INDEX idx_time_blocks_active ON public.time_blocks(is_active);

-- Función: genera bloques horarios para un rango de fechas
-- Horario: Lun-Vie 06-10h y 18-22h (bloques de 1h), Sáb 09-11h
CREATE OR REPLACE FUNCTION generate_time_blocks(
  p_start_date date,
  p_end_date   date,
  p_timezone   text DEFAULT 'America/Santiago'
)
RETURNS int AS $$
DECLARE
  current_date date := p_start_date;
  day_of_week  int;
  block_start  timestamptz;
  blocks_created int := 0;
  morning_hours int[] := ARRAY[6, 7, 8, 9];
  evening_hours int[] := ARRAY[18, 19, 20, 21];
  saturday_hours int[] := ARRAY[9, 10];
  h int;
BEGIN
  WHILE current_date <= p_end_date LOOP
    day_of_week := EXTRACT(DOW FROM current_date); -- 0=Dom, 1=Lun, ..., 6=Sáb

    -- Lunes a Viernes (1-5)
    IF day_of_week BETWEEN 1 AND 5 THEN
      -- Bloques de mañana
      FOREACH h IN ARRAY morning_hours LOOP
        block_start := (current_date::text || ' ' || h || ':00:00')::timestamp AT TIME ZONE p_timezone;
        -- Solo insertar si no existe ya
        IF NOT EXISTS (SELECT 1 FROM public.time_blocks WHERE start_time = block_start) THEN
          INSERT INTO public.time_blocks (start_time, end_time)
          VALUES (block_start, block_start + interval '1 hour');
          blocks_created := blocks_created + 1;
        END IF;
      END LOOP;

      -- Bloques de tarde/noche
      FOREACH h IN ARRAY evening_hours LOOP
        block_start := (current_date::text || ' ' || h || ':00:00')::timestamp AT TIME ZONE p_timezone;
        IF NOT EXISTS (SELECT 1 FROM public.time_blocks WHERE start_time = block_start) THEN
          INSERT INTO public.time_blocks (start_time, end_time)
          VALUES (block_start, block_start + interval '1 hour');
          blocks_created := blocks_created + 1;
        END IF;
      END LOOP;

    -- Sábado (6)
    ELSIF day_of_week = 6 THEN
      FOREACH h IN ARRAY saturday_hours LOOP
        block_start := (current_date::text || ' ' || h || ':00:00')::timestamp AT TIME ZONE p_timezone;
        IF NOT EXISTS (SELECT 1 FROM public.time_blocks WHERE start_time = block_start) THEN
          INSERT INTO public.time_blocks (start_time, end_time)
          VALUES (block_start, block_start + interval '1 hour');
          blocks_created := blocks_created + 1;
        END IF;
      END LOOP;
    END IF;

    current_date := current_date + interval '1 day';
  END LOOP;

  RETURN blocks_created;
END;
$$ LANGUAGE plpgsql;

-- Ejemplo de uso: SELECT generate_time_blocks('2025-05-01', '2025-07-31');


-- ─────────────────────────────────────────
-- 6. RESERVAS
-- ─────────────────────────────────────────
CREATE TABLE public.bookings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  time_block_id    uuid NOT NULL REFERENCES public.time_blocks(id) ON DELETE CASCADE,
  status           text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'completed', 'no_show')),
  rejection_reason text,
  notified_at      timestamptz,
  reminder_sent    boolean NOT NULL DEFAULT false,
  late_cancel      boolean NOT NULL DEFAULT false, -- cancelada con < 4 h: cuenta como clase usada (lo fija bookings_guard)
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, time_block_id)
);

CREATE INDEX idx_bookings_client ON public.bookings(client_id);
CREATE INDEX idx_bookings_block ON public.bookings(time_block_id);
CREATE INDEX idx_bookings_status ON public.bookings(status);

CREATE TRIGGER bookings_updated_at
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Guarda de bookings ───────────────────────────────────────────────────────
-- 1) late_cancel lo decide la base, no el cliente: al pasar a 'cancelled' desde pending/approved
--    se calcula con start_time del bloque (< 4 h → true). Un admin puede fijarlo a mano
--    explícitamente (p.ej. condonar una cancelación tardía); si no lo toca, se calcula igual.
-- 2) Un cliente (no admin) solo puede cambiar status a 'cancelled' (y solo desde pending/approved:
--    no puede "des-completar" una clase para recuperarla). Ninguna otra columna.
-- 3) Al salir de 'cancelled', late_cancel se limpia.
-- auth.uid() IS NULL = SQL Editor / pg_cron / service_role: privilegiado.
CREATE OR REPLACE FUNCTION public.bookings_guard()
RETURNS TRIGGER AS $$
DECLARE
  v_privileged boolean := (auth.uid() IS NULL OR public.is_admin());
  v_start      timestamptz;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT v_privileged THEN NEW.late_cancel := false; END IF;
    RETURN NEW;
  END IF;

  IF NOT v_privileged THEN
    IF NEW.client_id        IS DISTINCT FROM OLD.client_id
       OR NEW.time_block_id IS DISTINCT FROM OLD.time_block_id
       OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
       OR NEW.notified_at   IS DISTINCT FROM OLD.notified_at
       OR NEW.reminder_sent IS DISTINCT FROM OLD.reminder_sent
       OR NEW.created_at    IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'No autorizado a modificar esa columna de la reserva' USING ERRCODE = '42501';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (NEW.status = 'cancelled' AND OLD.status IN ('pending', 'approved')) THEN
      RAISE EXCEPTION 'Solo puedes cancelar una reserva pendiente o aprobada' USING ERRCODE = '42501';
    END IF;
    NEW.late_cancel := OLD.late_cancel;  -- el cliente no controla late_cancel
  END IF;

  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    IF OLD.status IN ('pending', 'approved') AND NEW.late_cancel IS NOT DISTINCT FROM OLD.late_cancel THEN
      SELECT start_time INTO v_start FROM public.time_blocks WHERE id = NEW.time_block_id;
      NEW.late_cancel := (v_start - now()) < interval '4 hours';
    END IF;
  ELSIF NEW.status <> 'cancelled' THEN
    NEW.late_cancel := false;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;  -- DEFINER: un cliente no ve bloques inactivos por RLS

DROP TRIGGER IF EXISTS bookings_guard ON public.bookings;
CREATE TRIGGER bookings_guard
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.bookings_guard();

-- Trigger: actualiza current_count en time_blocks cuando se aprueba/cancela una reserva
-- Ocupan cupo approved/completed/no_show (así corregir un estado no cuenta dos veces).
CREATE OR REPLACE FUNCTION public.sync_block_count()
RETURNS TRIGGER AS $$
DECLARE
  v_new_occ boolean := NEW.status IN ('approved', 'completed', 'no_show');
  v_old_occ boolean := (TG_OP = 'UPDATE' AND OLD.status IN ('approved', 'completed', 'no_show'));
BEGIN
  IF v_new_occ AND NOT v_old_occ THEN
    UPDATE public.time_blocks SET current_count = current_count + 1 WHERE id = NEW.time_block_id;
  ELSIF v_old_occ AND NOT v_new_occ THEN
    UPDATE public.time_blocks SET current_count = GREATEST(current_count - 1, 0) WHERE id = NEW.time_block_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
-- SECURITY DEFINER: antes corría con los permisos de quien cancela, y como un cliente no tiene
-- UPDATE sobre time_blocks (RLS), al cancelar el contador NO se decrementaba y el cupo quedaba
-- ocupado. (La ruta de insert sí funcionaba porque book_time_block ya es definer.)

CREATE TRIGGER bookings_sync_count
  AFTER UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION sync_block_count();

-- La función ya contempla el caso INSERT (ver "OLD.status IS NULL" arriba): cuando una
-- reserva se crea directamente como 'approved' (auto-aprobación en requestBooking, sin pasar
-- por un UPDATE de pending -> approved), solo este trigger AFTER INSERT la captura.
CREATE TRIGGER bookings_sync_count_insert
  AFTER INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION sync_block_count();

-- decrement_subscription_classes() (descuento sobre el contador legado) fue DEPRECADA el 2026-10-05
-- y ya no forma parte del schema: el saldo se deriva de los estados de bookings (ver
-- subscription_class_balance al final). Sigue existiendo en bases migradas, sin uso.

-- Función: completa las reservas 'approved' cuyo bloque ya pasó, SIN descontar nada (el saldo se
-- deriva de los estados). Corre vía pg_cron cada 5 min. Corregir después a no_show/cancelled es un
-- UPDATE de status y el saldo queda consistente solo.
CREATE OR REPLACE FUNCTION public.complete_past_bookings()
RETURNS int AS $$
DECLARE
  v_count int;
BEGIN
  WITH done AS (
    UPDATE public.bookings bk
    SET status = 'completed', updated_at = now()
    FROM public.time_blocks tb
    WHERE tb.id = bk.time_block_id
      AND bk.status = 'approved'
      AND tb.start_time <= now()
    RETURNING bk.id
  )
  SELECT count(*) INTO v_count FROM done;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Activa el cron, cada 5 minutos. Si ya existe un job con este nombre, re-ejecutar este
-- SELECT no falla gracias a unschedule previo (evita duplicarlo en reseeds del schema).
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'complete-past-bookings';
SELECT cron.schedule('complete-past-bookings', '*/5 * * * *', 'SELECT complete_past_bookings()');

-- Función: reserva un cupo de forma atómica. Bloquea la fila del bloque (SELECT ... FOR UPDATE)
-- para serializar solicitudes concurrentes sobre el mismo horario, valida el cupo con el dato
-- ya bloqueado (no un snapshot leído antes) y crea el booking en la misma transacción. Así,
-- si dos clientes piden el último cupo al mismo tiempo, el segundo espera a que el primero
-- termine y ve el current_count ya actualizado (por el trigger de arriba) antes de decidir.
-- Devuelve el id de la reserva creada; lanza excepción (con SQLSTATE propio) si no hay cupo,
-- el bloque no existe/está inactivo, o el cliente ya tiene una reserva para ese horario.
CREATE OR REPLACE FUNCTION public.book_time_block(p_time_block_id uuid)
RETURNS uuid AS $$
DECLARE
  v_current_count int;
  v_max_capacity  int;
  v_is_active     boolean;
  v_booking_id    uuid;
BEGIN
  SELECT current_count, max_capacity, is_active
  INTO v_current_count, v_max_capacity, v_is_active
  FROM public.time_blocks
  WHERE id = p_time_block_id
  FOR UPDATE;

  IF NOT FOUND OR NOT v_is_active THEN
    RAISE EXCEPTION 'Bloque no encontrado o inactivo' USING ERRCODE = 'P0001';
  END IF;

  IF v_current_count >= v_max_capacity THEN
    RAISE EXCEPTION 'Este bloque ya no tiene cupos disponibles' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.bookings (client_id, time_block_id, status, notified_at)
  VALUES (auth.uid(), p_time_block_id, 'approved', now())
  RETURNING id INTO v_booking_id;

  RETURN v_booking_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─────────────────────────────────────────
-- 7. RUTINAS Y EJERCICIOS
-- ─────────────────────────────────────────
CREATE TABLE public.routines (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name         text NOT NULL,
  description  text,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_routines_client ON public.routines(client_id);

CREATE TABLE public.exercises (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_id       uuid NOT NULL REFERENCES public.routines(id) ON DELETE CASCADE,
  name             text NOT NULL,
  sets             int,
  reps             text,
  suggested_weight text,
  notes            text,
  order_index      int NOT NULL DEFAULT 0
);

CREATE INDEX idx_exercises_routine ON public.exercises(routine_id);


-- ─────────────────────────────────────────
-- 8. REGISTROS DE ENTRENAMIENTO
-- ─────────────────────────────────────────
CREATE TABLE public.training_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  booking_id  uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  routine_id  uuid REFERENCES public.routines(id) ON DELETE SET NULL,
  log_date    date NOT NULL,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_training_logs_client ON public.training_logs(client_id);
CREATE INDEX idx_training_logs_date ON public.training_logs(log_date);

CREATE TABLE public.exercise_logs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  training_log_id  uuid NOT NULL REFERENCES public.training_logs(id) ON DELETE CASCADE,
  exercise_id      uuid REFERENCES public.exercises(id) ON DELETE SET NULL,
  exercise_name    text NOT NULL,
  sets_done        int,
  reps_done        text,
  weight_used      text,
  notes            text
);

CREATE INDEX idx_exercise_logs_training ON public.exercise_logs(training_log_id);


-- ─────────────────────────────────────────
-- 9. MEDIDAS CORPORALES
-- ─────────────────────────────────────────
CREATE TABLE public.measurements (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  measured_at    date NOT NULL,
  weight_kg      numeric(5,2),
  height_cm      numeric(5,1),
  body_fat_pct   numeric(5,2),
  biceps_mm      numeric(5,1),
  triceps_mm     numeric(5,1),
  subescapular_mm   numeric(5,1),
  abdominal_mm   numeric(5,1),
  suprailiaco_mm numeric(5,1),
  cuadricep_mm   numeric(5,1),
  pantorrilla_mm numeric(5,1),
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_measurements_client ON public.measurements(client_id);
CREATE INDEX idx_measurements_date ON public.measurements(measured_at);


-- ─────────────────────────────────────────
-- 10. RESET MENSUAL DE CLASES (función)
-- ─────────────────────────────────────────
-- Llama a esta función con un cron job de Supabase (pg_cron) todos los días a las 00:05
-- Solo afecta a suscripciones donde hoy es el día de reset

CREATE OR REPLACE FUNCTION monthly_classes_reset()
RETURNS void AS $$
DECLARE
  sub RECORD;
  plan_classes int;
  unused_classes int;
BEGIN
  FOR sub IN
    SELECT s.id, s.client_id, s.classes_remaining, s.plan_id
    FROM public.subscriptions s
    WHERE s.status = 'active'
      AND EXTRACT(DAY FROM now()) = s.reset_day
  LOOP
    SELECT classes_per_month INTO plan_classes
    FROM public.plans WHERE id = sub.plan_id;

    -- Clases sin usar (rollover)
    unused_classes := sub.classes_remaining;

    UPDATE public.subscriptions
    SET classes_remaining = plan_classes + unused_classes
    WHERE id = sub.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- DEPRECADO (2026-10-05): el cron 'monthly-classes-reset' se desactivó. El derecho mensual lo da la
-- fórmula de subscription_class_balance (classes_per_month × cuotas iniciadas). La función queda
-- definida solo por si hay que volver atrás; no se agenda.


-- ─────────────────────────────────────────
-- 11. ROW LEVEL SECURITY (RLS)
-- ─────────────────────────────────────────

ALTER TABLE public.profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_blocks   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routines      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercises     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.measurements  ENABLE ROW LEVEL SECURITY;

-- Helper: verifica si el usuario actual es admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- PROFILES
CREATE POLICY "Admin lee todos los perfiles"   ON public.profiles FOR SELECT USING (is_admin());
CREATE POLICY "Admin edita todos los perfiles"  ON public.profiles FOR UPDATE USING (is_admin());
CREATE POLICY "Cliente lee su propio perfil"    ON public.profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "Cliente edita su propio perfil"  ON public.profiles FOR UPDATE USING (id = auth.uid());
CREATE POLICY "Insertar perfil propio"          ON public.profiles FOR INSERT WITH CHECK (id = auth.uid());

-- PLANS (todos pueden leer)
CREATE POLICY "Todos leen planes" ON public.plans FOR SELECT USING (true);
CREATE POLICY "Admin gestiona planes" ON public.plans FOR ALL USING (is_admin());

-- SUBSCRIPTIONS
CREATE POLICY "Admin gestiona suscripciones"  ON public.subscriptions FOR ALL USING (is_admin());
CREATE POLICY "Cliente lee su suscripción"    ON public.subscriptions FOR SELECT USING (client_id = auth.uid());

-- PAYMENTS
CREATE POLICY "Admin gestiona pagos"    ON public.payments FOR ALL USING (is_admin());
CREATE POLICY "Cliente lee sus pagos"   ON public.payments FOR SELECT USING (client_id = auth.uid());

-- TIME_BLOCKS (todos leen los activos; solo admin gestiona)
CREATE POLICY "Todos leen bloques activos"   ON public.time_blocks FOR SELECT USING (is_active = true OR is_admin());
CREATE POLICY "Admin gestiona bloques"       ON public.time_blocks FOR ALL USING (is_admin());

-- BOOKINGS
CREATE POLICY "Admin gestiona reservas"      ON public.bookings FOR ALL USING (is_admin());
CREATE POLICY "Cliente lee sus reservas"     ON public.bookings FOR SELECT USING (client_id = auth.uid());
CREATE POLICY "Cliente crea sus reservas"    ON public.bookings FOR INSERT WITH CHECK (client_id = auth.uid());
CREATE POLICY "Cliente cancela sus reservas" ON public.bookings FOR UPDATE
  USING (client_id = auth.uid())
  WITH CHECK (status = 'cancelled');

-- ROUTINES
CREATE POLICY "Admin gestiona rutinas"    ON public.routines FOR ALL USING (is_admin());
CREATE POLICY "Cliente lee sus rutinas"   ON public.routines FOR SELECT USING (client_id = auth.uid());

-- EXERCISES
CREATE POLICY "Admin gestiona ejercicios" ON public.exercises FOR ALL USING (is_admin());
CREATE POLICY "Cliente lee sus ejercicios" ON public.exercises FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.routines r
    WHERE r.id = routine_id AND r.client_id = auth.uid()
  ));

-- TRAINING_LOGS
CREATE POLICY "Admin gestiona logs"        ON public.training_logs FOR ALL USING (is_admin());
CREATE POLICY "Cliente lee sus logs"       ON public.training_logs FOR SELECT USING (client_id = auth.uid());

-- EXERCISE_LOGS
CREATE POLICY "Admin gestiona exercise_logs" ON public.exercise_logs FOR ALL USING (is_admin());
CREATE POLICY "Cliente lee sus exercise_logs" ON public.exercise_logs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.training_logs tl
    WHERE tl.id = training_log_id AND tl.client_id = auth.uid()
  ));

-- MEASUREMENTS
CREATE POLICY "Admin gestiona medidas"     ON public.measurements FOR ALL USING (is_admin());
CREATE POLICY "Cliente lee sus medidas"    ON public.measurements FOR SELECT USING (client_id = auth.uid());


-- ─────────────────────────────────────────
-- 12. AJUSTES DE CLASES Y SALDO DERIVADO
-- ─────────────────────────────────────────
-- Saldo = derecho del plan (classes_per_month × cuotas iniciadas) + ajustes − usadas (completed,
-- no_show, cancelled+late_cancel por cliente y rango [start_date, end_date)). Modelo completo en
-- supabase/migrations/2026-10-05_05_class_adjustments_and_balance.sql.
-- reason: texto libre; sugeridos: recuperación, cortesía, corrección, reagendada, arrastre.
CREATE TABLE IF NOT EXISTS public.class_adjustments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id  uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  quantity         int  NOT NULL CHECK (quantity <> 0),            -- + suma clases, - resta
  reason           text NOT NULL CHECK (length(btrim(reason)) > 0),
  booking_id       uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  created_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_class_adjustments_subscription ON public.class_adjustments(subscription_id);
CREATE INDEX IF NOT EXISTS idx_class_adjustments_booking ON public.class_adjustments(booking_id);

ALTER TABLE public.class_adjustments ENABLE ROW LEVEL SECURITY;
-- Los privilegios de tabla los da Supabase por defecto; se explicitan acá y el RLS decide quién
-- escribe (solo admin) y qué ve cada cliente (solo lo suyo).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_adjustments TO authenticated;

CREATE POLICY "Admin gestiona ajustes de clases" ON public.class_adjustments
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Cliente lee sus ajustes de clases" ON public.class_adjustments
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.id = subscription_id AND s.client_id = auth.uid()
  ));


-- ── Vista interna con el cálculo (sin filtro por usuario) ────────────────────
-- Es la única fuente del saldo. No es accesible desde la API: solo la leen las vistas públicas
-- de abajo (que filtran por usuario) y el SQL Editor / service_role.
CREATE OR REPLACE VIEW public._subscription_balance_calc AS
WITH
today AS (SELECT (now() AT TIME ZONE 'America/Santiago')::date AS d),

used_classes AS (
  SELECT a.subscription_id, count(*)::int AS used
  FROM (
    SELECT bk.client_id, (tb.start_time AT TIME ZONE 'America/Santiago')::date AS class_date
    FROM public.bookings bk
    JOIN public.time_blocks tb ON tb.id = bk.time_block_id
    WHERE bk.status IN ('completed', 'no_show')
       OR (bk.status = 'cancelled' AND bk.late_cancel)
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

adj AS (
  SELECT subscription_id, sum(quantity)::int AS adjustments
  FROM public.class_adjustments GROUP BY subscription_id
),

base AS (
  SELECT
    s.id AS subscription_id, s.client_id, s.plan_id, p.name AS plan_name,
    s.status, s.start_date, s.end_date, t.d AS as_of,
    (p.classes_per_month >= 9999) AS is_unlimited,
    p.classes_per_month AS plan_classes_per_month,
    ((t.d >= s.start_date)::int
      + (t.d >= (s.start_date + interval '1 month')::date)::int
      + (t.d >= (s.start_date + interval '2 months')::date)::int) AS installments_started,
    CASE
      WHEN p.classes_per_month >= 9999 THEN NULL
      WHEN p.is_trial THEN CASE WHEN t.d >= s.start_date THEN p.classes_per_month ELSE 0 END
      ELSE p.classes_per_month * (
        (t.d >= s.start_date)::int
        + (t.d >= (s.start_date + interval '1 month')::date)::int
        + (t.d >= (s.start_date + interval '2 months')::date)::int)
    END AS entitled,
    COALESCE(ad.adjustments, 0) AS adjustments,
    COALESCE(u.used, 0)         AS used,
    -- vigente: activa que aún no llegó a end_date (se ignora start_date para no cambiar el
    -- comportamiento de activas con inicio futuro creadas antes de existir 'scheduled'), o
    -- programada cuyo rango ya incluye hoy (cubre el retraso del cron al cambiar de día).
    ((s.status = 'active' AND t.d < s.end_date)
      OR (s.status = 'scheduled' AND t.d >= s.start_date AND t.d < s.end_date)) AS is_current
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  CROSS JOIN today t
  LEFT JOIN used_classes u ON u.subscription_id = s.id
  LEFT JOIN adj ad ON ad.subscription_id = s.id
)
SELECT
  b.subscription_id, b.client_id, b.plan_id, b.plan_name, b.status, b.start_date, b.end_date, b.as_of,
  b.is_unlimited, b.plan_classes_per_month, b.installments_started,
  b.entitled, b.adjustments, b.used,
  CASE WHEN b.is_unlimited THEN NULL ELSE b.entitled + b.adjustments - b.used END AS balance,
  b.is_current,
  -- Lo que puede reservar hoy: 0 si no es vigente (finalizada, pausada, programada futura).
  CASE
    WHEN NOT b.is_current THEN 0
    WHEN b.is_unlimited   THEN 9999
    ELSE GREATEST(b.entitled + b.adjustments - b.used, 0)
  END AS available,
  -- Informativo: clases que sobraron al cerrar el trimestre y se perdieron. Para suscripciones
  -- cerradas anticipadamente por el flujo viejo sobrestima (cuenta las 3 cuotas completas).
  CASE
    WHEN b.is_unlimited OR b.is_current OR b.status = 'scheduled' THEN 0
    ELSE GREATEST(b.entitled + b.adjustments - b.used, 0)
  END AS lost_classes
FROM base b;

REVOKE ALL ON public._subscription_balance_calc FROM PUBLIC, anon, authenticated;

-- ── Vista pública: saldo por suscripción ────────────────────────────────────
-- Corre con permisos del dueño (necesita ver reservas/bloques inactivos que el RLS le oculta a
-- un cliente) pero SOLO devuelve filas del usuario que consulta, o todas si es admin.
-- Uso: SELECT available FROM subscription_class_balance WHERE is_current;
CREATE OR REPLACE VIEW public.subscription_class_balance
WITH (security_invoker = false) AS
SELECT * FROM public._subscription_balance_calc
WHERE client_id = auth.uid() OR public.is_admin();

-- ── Vista pública: historial de suscripciones por cliente (más reciente primero) ──
-- effective_status refleja las fechas aunque el cron no haya corrido todavía.
-- Uso: SELECT * FROM subscription_history WHERE client_id = '<uuid>';
CREATE OR REPLACE VIEW public.subscription_history
WITH (security_invoker = false) AS
SELECT
  c.client_id, c.subscription_id, c.plan_name, c.start_date, c.end_date, c.status,
  CASE
    WHEN c.status = 'active'    AND c.as_of >= c.end_date THEN 'expired'
    WHEN c.status = 'scheduled' AND c.is_current          THEN 'active'
    ELSE c.status
  END AS effective_status,
  c.entitled, c.adjustments, c.used, c.balance, c.lost_classes,
  COALESCE(pay.paid, 0)    AS payments_paid,
  COALESCE(pay.pending, 0) AS payments_pending,
  COALESCE(pay.overdue, 0) AS payments_overdue   -- calculado: pending con due_date < hoy
FROM public._subscription_balance_calc c
LEFT JOIN LATERAL (
  SELECT
    count(*) FILTER (WHERE p.status = 'paid')                                  AS paid,
    count(*) FILTER (WHERE p.status <> 'paid')                                 AS pending,
    count(*) FILTER (WHERE p.status <> 'paid' AND p.due_date < c.as_of)        AS overdue
  FROM public.payments p WHERE p.subscription_id = c.subscription_id
) pay ON true
WHERE c.client_id = auth.uid() OR public.is_admin()
ORDER BY c.client_id, c.start_date DESC, c.subscription_id;

GRANT SELECT ON public.subscription_class_balance, public.subscription_history TO authenticated;
REVOKE ALL ON public.subscription_class_balance, public.subscription_history FROM anon;
