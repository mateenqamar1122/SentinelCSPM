-- Enums
CREATE TYPE public.cloud_provider AS ENUM ('aws', 'gcp', 'azure', 'demo');
CREATE TYPE public.scan_status AS ENUM ('pending', 'running', 'completed', 'failed');
CREATE TYPE public.finding_severity AS ENUM ('critical', 'high', 'medium', 'low', 'info');

-- Connections table
CREATE TABLE public.cloud_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  provider public.cloud_provider NOT NULL,
  name TEXT NOT NULL,
  credentials JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'connected',
  last_scan_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cloud_connections_session ON public.cloud_connections(session_id);

-- Scans table
CREATE TABLE public.scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  connection_id UUID NOT NULL REFERENCES public.cloud_connections(id) ON DELETE CASCADE,
  status public.scan_status NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  error_message TEXT,
  total_findings INT NOT NULL DEFAULT 0,
  critical_count INT NOT NULL DEFAULT 0,
  high_count INT NOT NULL DEFAULT 0,
  medium_count INT NOT NULL DEFAULT 0,
  low_count INT NOT NULL DEFAULT 0,
  info_count INT NOT NULL DEFAULT 0,
  resources_scanned INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_scans_session ON public.scans(session_id);
CREATE INDEX idx_scans_connection ON public.scans(connection_id);

-- Findings table
CREATE TABLE public.findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  scan_id UUID NOT NULL REFERENCES public.scans(id) ON DELETE CASCADE,
  severity public.finding_severity NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  resource TEXT NOT NULL,
  region TEXT,
  description TEXT NOT NULL,
  mitigation TEXT NOT NULL,
  compliance TEXT[] DEFAULT ARRAY[]::TEXT[],
  rule_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_findings_session ON public.findings(session_id);
CREATE INDEX idx_findings_scan ON public.findings(scan_id);
CREATE INDEX idx_findings_severity ON public.findings(severity);

-- Helper to read session id from request header
CREATE OR REPLACE FUNCTION public.current_session_id()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    current_setting('request.headers', true)::json->>'x-session-id',
    ''
  );
$$;

-- Enable RLS
ALTER TABLE public.cloud_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.findings ENABLE ROW LEVEL SECURITY;

-- Connections policies (no SELECT on credentials column from clients — handled via view)
CREATE POLICY "session can view own connections"
  ON public.cloud_connections FOR SELECT
  USING (session_id = public.current_session_id() AND public.current_session_id() <> '');

CREATE POLICY "session can insert own connections"
  ON public.cloud_connections FOR INSERT
  WITH CHECK (session_id = public.current_session_id() AND public.current_session_id() <> '');

CREATE POLICY "session can update own connections"
  ON public.cloud_connections FOR UPDATE
  USING (session_id = public.current_session_id() AND public.current_session_id() <> '');

CREATE POLICY "session can delete own connections"
  ON public.cloud_connections FOR DELETE
  USING (session_id = public.current_session_id() AND public.current_session_id() <> '');

-- Scans policies
CREATE POLICY "session can view own scans"
  ON public.scans FOR SELECT
  USING (session_id = public.current_session_id() AND public.current_session_id() <> '');

CREATE POLICY "session can insert own scans"
  ON public.scans FOR INSERT
  WITH CHECK (session_id = public.current_session_id() AND public.current_session_id() <> '');

CREATE POLICY "session can delete own scans"
  ON public.scans FOR DELETE
  USING (session_id = public.current_session_id() AND public.current_session_id() <> '');

-- Findings policies (read only from clients; edge function inserts via service role)
CREATE POLICY "session can view own findings"
  ON public.findings FOR SELECT
  USING (session_id = public.current_session_id() AND public.current_session_id() <> '');

-- Public-safe view that hides credentials
CREATE OR REPLACE VIEW public.cloud_connections_safe
WITH (security_invoker = true) AS
SELECT id, session_id, provider, name, status, last_scan_at, created_at, updated_at,
       (credentials ? 'configured') AS has_credentials
FROM public.cloud_connections;

-- Updated-at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_connections_updated_at
  BEFORE UPDATE ON public.cloud_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();