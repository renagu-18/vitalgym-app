-- ============================================================
-- 01 · Aceptación del reglamento + guardas de columnas en profiles
-- NO APLICADA. Correr en el SQL Editor de Supabase.
-- Idempotente. Reversa al final (comentada). No borra datos.
-- ============================================================
BEGIN;

-- Clientes actuales quedan en NULL (= pendiente); la app trata NULL como versión 0.
-- La versión vigente vive en el código (src/lib/rules.ts → RULES_VERSION), no acá.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS rules_accepted_at      timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS rules_accepted_version integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_rules_accepted_version_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_rules_accepted_version_check
      CHECK (rules_accepted_version IS NULL OR rules_accepted_version >= 1);
  END IF;
END $$;

-- Hardening: "Cliente edita su propio perfil" no tiene WITH CHECK por columna. Además de role,
-- ahora un cliente tampoco puede cambiar id, email, birth_date, notify_via ni created_at
-- (full_name y phone siguen editables), y rules_accepted_* solo se escriben vía accept_rules().
-- auth.uid() IS NULL = SQL Editor / service_role / handle_new_user; admin puede todo.
CREATE OR REPLACE FUNCTION public.profiles_guard_role()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.role <> 'client' THEN
      RAISE EXCEPTION 'No autorizado a crear un perfil con rol %', NEW.role USING ERRCODE = '42501';
    END IF;
    NEW.rules_accepted_at      := NULL;
    NEW.rules_accepted_version := NULL;
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'No autorizado a cambiar el rol' USING ERRCODE = '42501';
  END IF;
  IF NEW.id            IS DISTINCT FROM OLD.id
     OR NEW.email      IS DISTINCT FROM OLD.email
     OR NEW.birth_date IS DISTINCT FROM OLD.birth_date
     OR NEW.notify_via IS DISTINCT FROM OLD.notify_via
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'No autorizado a modificar esa columna del perfil' USING ERRCODE = '42501';
  END IF;
  IF (NEW.rules_accepted_at         IS DISTINCT FROM OLD.rules_accepted_at
      OR NEW.rules_accepted_version IS DISTINCT FROM OLD.rules_accepted_version)
     AND current_setting('app.accepting_rules', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'La aceptación del reglamento solo se registra con accept_rules()' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS profiles_guard_role ON public.profiles;
CREATE TRIGGER profiles_guard_role
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_role();

-- El cliente autenticado acepta el reglamento. Solo toca su propia fila (auth.uid(), sin parámetro
-- de usuario), la fecha la pone la base (now()) y la versión nunca baja. Levanta una bandera local
-- a la transacción (app.accepting_rules) que profiles_guard_role reconoce.
-- Riesgo aceptado: la base no conoce RULES_VERSION, así que un cliente podría declarar una versión
-- mayor a la vigente para su propia fila.
CREATE OR REPLACE FUNCTION public.accept_rules(p_version integer)
RETURNS timestamptz AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_at  timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501';
  END IF;
  IF p_version IS NULL OR p_version < 1 THEN
    RAISE EXCEPTION 'Versión de reglamento inválida' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.accepting_rules', 'on', true);
  UPDATE public.profiles
  SET rules_accepted_at      = now(),
      rules_accepted_version = GREATEST(COALESCE(rules_accepted_version, 0), p_version)
  WHERE id = v_uid
  RETURNING rules_accepted_at INTO v_at;
  PERFORM set_config('app.accepting_rules', 'off', true);

  IF v_at IS NULL THEN
    RAISE EXCEPTION 'Perfil no encontrado' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.accept_rules(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_rules(integer) TO authenticated;

COMMIT;

-- ── REVERSA (manual) ─────────────────────────────────────────
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.accept_rules(integer);
-- -- Restaurar profiles_guard_role() a la versión de 2026-10-05_02 (solo bloquea cambios de role):
-- CREATE OR REPLACE FUNCTION public.profiles_guard_role()
-- RETURNS TRIGGER AS $$
-- BEGIN
--   IF auth.uid() IS NULL OR public.is_admin() THEN
--     RETURN NEW;
--   END IF;
--   IF TG_OP = 'INSERT' AND NEW.role <> 'client' THEN
--     RAISE EXCEPTION 'No autorizado a crear un perfil con rol %', NEW.role USING ERRCODE = '42501';
--   END IF;
--   IF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role THEN
--     RAISE EXCEPTION 'No autorizado a cambiar el rol' USING ERRCODE = '42501';
--   END IF;
--   RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
-- ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_rules_accepted_version_check;
-- -- Las dos líneas siguientes destruyen las aceptaciones registradas; omitirlas si se quieren conservar.
-- ALTER TABLE public.profiles DROP COLUMN IF EXISTS rules_accepted_version;
-- ALTER TABLE public.profiles DROP COLUMN IF EXISTS rules_accepted_at;
-- COMMIT;
