-- ─────────────────────────────────────────────────────────────────────────────
-- Reagendar una clase que el cliente canceló.
-- NO APLICADA. Correr en el SQL Editor de Supabase.
--
-- Problema: UNIQUE (client_id, time_block_id) incluye las reservas canceladas, así que al
-- reagendar el mismo horario book_time_block fallaba con 23505 ("Ya tienes una reserva para
-- este horario") aunque la anterior estuviera cancelada.
-- Solución: si existe una reserva cancelada/rechazada para ese cliente y bloque, se reactiva
-- (status = approved) en vez de insertar otra. Se conserva el historial y el cupo se recuenta
-- por el trigger sync_block_count. late_cancel se limpia solo (bookings_guard, punto 3).
-- Pending/approved/completed/no_show siguen dando 23505.
--
-- El guard impide que un cliente salga de 'cancelled', así que book_time_block levanta una
-- bandera local a la transacción (app.rebooking) que el guard reconoce.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.bookings_guard()
RETURNS TRIGGER AS $$
DECLARE
  v_privileged boolean := (auth.uid() IS NULL OR public.is_admin()
                           OR current_setting('app.rebooking', true) = 'on');
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

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

  -- Reagendar: reactivar la reserva cancelada/rechazada del mismo cliente y bloque.
  PERFORM set_config('app.rebooking', 'on', true);
  UPDATE public.bookings
  SET status = 'approved', notified_at = now(), reminder_sent = false, rejection_reason = NULL
  WHERE client_id = auth.uid()
    AND time_block_id = p_time_block_id
    AND status IN ('cancelled', 'rejected')
  RETURNING id INTO v_booking_id;
  PERFORM set_config('app.rebooking', 'off', true);

  IF v_booking_id IS NOT NULL THEN
    RETURN v_booking_id;
  END IF;

  INSERT INTO public.bookings (client_id, time_block_id, status, notified_at)
  VALUES (auth.uid(), p_time_block_id, 'approved', now())
  RETURNING id INTO v_booking_id;

  RETURN v_booking_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Para deshacer: volver a las definiciones de supabase/schema.sql previas a este cambio.
