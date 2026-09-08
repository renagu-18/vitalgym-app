-- ============================================================
-- VitalGym — Schema completo para Supabase
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================

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
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, phone, notify_via)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email,
    NEW.raw_user_meta_data->>'phone',
    COALESCE(NEW.raw_user_meta_data->>'notify_via', 'gmail')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ─────────────────────────────────────────
-- 2. PLANES
-- ─────────────────────────────────────────
CREATE TABLE public.plans (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text NOT NULL,
  classes_per_month  int NOT NULL,
  price_monthly      int NOT NULL,
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


-- ─────────────────────────────────────────
-- 3. SUSCRIPCIONES
-- ─────────────────────────────────────────
CREATE TABLE public.subscriptions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_id             uuid NOT NULL REFERENCES public.plans(id),
  start_date          date NOT NULL,
  end_date            date NOT NULL,
  status              text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'expired')),
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


-- ─────────────────────────────────────────
-- 4. PAGOS
-- ─────────────────────────────────────────
CREATE TABLE public.payments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subscription_id  uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  amount           int NOT NULL,
  month            date NOT NULL, -- primer día del mes pagado (ej: 2025-05-01)
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue')),
  paid_at          timestamptz,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_client ON public.payments(client_id);
CREATE INDEX idx_payments_status ON public.payments(status);


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
                   CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'completed')),
  rejection_reason text,
  notified_at      timestamptz,
  reminder_sent    boolean NOT NULL DEFAULT false,
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

-- Trigger: actualiza current_count en time_blocks cuando se aprueba/cancela una reserva
CREATE OR REPLACE FUNCTION sync_block_count()
RETURNS TRIGGER AS $$
BEGIN
  -- Al aprobar una reserva
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    UPDATE public.time_blocks
    SET current_count = current_count + 1
    WHERE id = NEW.time_block_id;

  -- Al cancelar o rechazar una reserva que estaba aprobada
  ELSIF OLD.status = 'approved' AND NEW.status IN ('cancelled', 'rejected') THEN
    UPDATE public.time_blocks
    SET current_count = GREATEST(current_count - 1, 0)
    WHERE id = NEW.time_block_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER bookings_sync_count
  AFTER UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION sync_block_count();

-- La función ya contempla el caso INSERT (ver "OLD.status IS NULL" arriba): cuando una
-- reserva se crea directamente como 'approved' (auto-aprobación en requestBooking, sin pasar
-- por un UPDATE de pending -> approved), solo este trigger AFTER INSERT la captura.
CREATE TRIGGER bookings_sync_count_insert
  AFTER INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION sync_block_count();

-- Función: completa automáticamente las reservas 'approved' cuyo bloque horario ya pasó, y
-- recién en ese momento descuenta 1 clase de la suscripción activa del cliente. El descuento
-- ya NO ocurre al reservar ni al aprobar (ver requestBooking/approveBooking) — solo cuando la
-- clase efectivamente ocurrió o un admin la marca completada a mano (completeBooking). Pensada
-- para correr periódicamente vía pg_cron, mismo patrón que monthly_classes_reset.
CREATE OR REPLACE FUNCTION public.complete_past_bookings()
RETURNS int AS $$
DECLARE
  v_count int := 0;
  b RECORD;
BEGIN
  FOR b IN
    SELECT bk.id, bk.client_id
    FROM public.bookings bk
    JOIN public.time_blocks tb ON tb.id = bk.time_block_id
    WHERE bk.status = 'approved'
      AND tb.start_time <= now()
  LOOP
    UPDATE public.bookings
    SET status = 'completed', updated_at = now()
    WHERE id = b.id;

    UPDATE public.subscriptions
    SET classes_remaining = classes_remaining - 1
    WHERE client_id = b.client_id
      AND status = 'active'
      AND classes_remaining > 0
      AND classes_remaining < 9999; -- planes ilimitados no se tocan

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Para activar el cron en Supabase (requiere pg_cron habilitado), cada 5 minutos:
-- SELECT cron.schedule('complete-past-bookings', '*/5 * * * *', 'SELECT complete_past_bookings()');

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
  waist_cm       numeric(5,1),
  hip_cm         numeric(5,1),
  chest_cm       numeric(5,1),
  arms_cm        numeric(5,1),
  legs_cm        numeric(5,1),
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

-- Para activar el cron en Supabase (requiere pg_cron habilitado):
-- SELECT cron.schedule('monthly-classes-reset', '5 0 * * *', 'SELECT monthly_classes_reset()');


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
