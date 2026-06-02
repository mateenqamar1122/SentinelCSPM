-- Enums
CREATE TYPE public.app_role AS ENUM ('startup', 'pentester', 'admin');
CREATE TYPE public.engagement_status AS ENUM ('requested', 'accepted', 'declined', 'in_progress', 'completed', 'cancelled');
CREATE TYPE public.availability_status AS ENUM ('available', 'limited', 'unavailable');

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own role on signup" ON public.user_roles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Pentester profiles
CREATE TABLE public.pentester_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  headline TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  hourly_rate INTEGER,
  years_experience INTEGER NOT NULL DEFAULT 0,
  skills TEXT[] NOT NULL DEFAULT '{}',
  certifications TEXT[] NOT NULL DEFAULT '{}',
  specialties TEXT[] NOT NULL DEFAULT '{}',
  location TEXT,
  availability public.availability_status NOT NULL DEFAULT 'available',
  website_url TEXT,
  linkedin_url TEXT,
  github_url TEXT,
  published BOOLEAN NOT NULL DEFAULT false,
  verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pentester_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published pentester profiles viewable by all" ON public.pentester_profiles
  FOR SELECT USING (published = true OR auth.uid() = user_id);
CREATE POLICY "Pentesters insert own listing" ON public.pentester_profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id AND public.has_role(auth.uid(), 'pentester'));
CREATE POLICY "Pentesters update own listing" ON public.pentester_profiles
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Pentesters delete own listing" ON public.pentester_profiles
  FOR DELETE USING (auth.uid() = user_id);

-- Engagements
CREATE TABLE public.engagements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  startup_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pentester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  scope TEXT NOT NULL,
  budget INTEGER,
  timeline TEXT,
  status public.engagement_status NOT NULL DEFAULT 'requested',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.engagements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Engagement parties view" ON public.engagements
  FOR SELECT USING (auth.uid() = startup_id OR auth.uid() = pentester_id);
CREATE POLICY "Startups create engagements" ON public.engagements
  FOR INSERT WITH CHECK (auth.uid() = startup_id);
CREATE POLICY "Engagement parties update" ON public.engagements
  FOR UPDATE USING (auth.uid() = startup_id OR auth.uid() = pentester_id);

-- Engagement messages
CREATE TABLE public.engagement_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL REFERENCES public.engagements(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.engagement_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Engagement parties view messages" ON public.engagement_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.engagements e
      WHERE e.id = engagement_id AND (auth.uid() = e.startup_id OR auth.uid() = e.pentester_id)
    )
  );
CREATE POLICY "Engagement parties send messages" ON public.engagement_messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND EXISTS (
      SELECT 1 FROM public.engagements e
      WHERE e.id = engagement_id AND (auth.uid() = e.startup_id OR auth.uid() = e.pentester_id)
    )
  );

-- updated_at triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_pentester_profiles_updated_at BEFORE UPDATE ON public.pentester_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_engagements_updated_at BEFORE UPDATE ON public.engagements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile + default role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _role public.app_role;
BEGIN
  INSERT INTO public.profiles (user_id, display_name, email, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url'
  );

  _role := COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'startup');
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Indexes
CREATE INDEX idx_pentester_profiles_published ON public.pentester_profiles(published) WHERE published = true;
CREATE INDEX idx_engagements_startup ON public.engagements(startup_id);
CREATE INDEX idx_engagements_pentester ON public.engagements(pentester_id);
CREATE INDEX idx_engagement_messages_engagement ON public.engagement_messages(engagement_id);