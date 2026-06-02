
-- 1. Profiles: drop email exposure
ALTER TABLE public.profiles DROP COLUMN IF EXISTS email;

DROP POLICY IF EXISTS "Profiles viewable by everyone" ON public.profiles;
CREATE POLICY "Profiles viewable by authenticated users"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

-- 2. user_roles: restrict self-assignment to non-privileged roles
DROP POLICY IF EXISTS "Users insert own role on signup" ON public.user_roles;
CREATE POLICY "Users insert own role on signup"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND role IN ('startup'::public.app_role, 'pentester'::public.app_role)
);

-- 3. Harden handle_new_user trigger so signup metadata can't elevate role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _requested text;
  _role public.app_role;
BEGIN
  INSERT INTO public.profiles (user_id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  );

  _requested := NEW.raw_user_meta_data->>'role';
  IF _requested IN ('startup', 'pentester') THEN
    _role := _requested::public.app_role;
  ELSE
    _role := 'startup'::public.app_role;
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- 4. Revoke public EXECUTE on internal trigger-only definer functions
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated, public;
