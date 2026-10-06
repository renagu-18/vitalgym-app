-- ============================================================
-- 02 · profiles.birth_date + guardas de seguridad en profiles
-- Idempotente. Reversa al final (comentada). NO toca ninguna columna de edad existente.
-- ============================================================
BEGIN;

-- La edad se CALCULA desde birth_date (no se guarda). Clientes actuales: NULL hasta que el admin
-- los cargue; todo el código debe tolerar NULL.
-- Privacidad: profiles solo es legible por el propio cliente y por admin (policies
-- "Cliente lee su propio perfil" / "Admin lee todos los perfiles"), así que birth_date hereda eso.
-- No hay vistas ni joins que expongan profiles a otros clientes.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS birth_date date;

-- El rango 17–60 se valida en el registro (server action), NO con un CHECK/trigger acá: un
-- CHECK con la fecha actual rompe restores, y un trigger bloquearía al admin al cargar fechas de
-- clientes fuera de rango (p.ej. Pack Familia).

-- El registro manda birth_date en raw_user_meta_data. Si viene inválido se ignora (NULL) en vez de
-- abortar el signup de auth.
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

COMMIT;

-- ── REVERSA (manual) ─────────────────────────────────────────
-- DROP TRIGGER IF EXISTS profiles_guard_role ON public.profiles;
-- DROP FUNCTION IF EXISTS public.profiles_guard_role();
-- ALTER TABLE public.profiles DROP COLUMN IF EXISTS birth_date;  -- destruye los datos cargados
-- y restaurar handle_new_user() sin birth_date (versión en schema.sql, git log).
