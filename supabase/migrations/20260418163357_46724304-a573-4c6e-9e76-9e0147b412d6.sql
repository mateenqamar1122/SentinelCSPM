-- 1. New asset_type enum (separate from cloud_provider so we can mix)
CREATE TYPE public.asset_type AS ENUM ('cloud','code_repo','container_image','kubernetes','ai_workflow');
CREATE TYPE public.scan_kind AS ENUM ('cloud','code','container','kubernetes','ai_security','threat_intel');

-- 2. Assets table (repos, images, clusters, AI workflows)
CREATE TABLE public.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  asset_type public.asset_type NOT NULL,
  name text NOT NULL,
  identifier text NOT NULL,           -- repo URL / image ref / cluster context / workflow name
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'connected',
  last_scan_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "session can view own assets" ON public.assets
  FOR SELECT USING (session_id = public.current_session_id() AND public.current_session_id() <> '');
CREATE POLICY "session can insert own assets" ON public.assets
  FOR INSERT WITH CHECK (session_id = public.current_session_id() AND public.current_session_id() <> '');
CREATE POLICY "session can update own assets" ON public.assets
  FOR UPDATE USING (session_id = public.current_session_id() AND public.current_session_id() <> '');
CREATE POLICY "session can delete own assets" ON public.assets
  FOR DELETE USING (session_id = public.current_session_id() AND public.current_session_id() <> '');

CREATE TRIGGER trg_assets_updated_at
  BEFORE UPDATE ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Threat intel alerts
CREATE TABLE public.threat_intel_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  cve_id text NOT NULL,
  severity public.finding_severity NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  affected_tech text[] NOT NULL DEFAULT '{}',
  references_urls text[] NOT NULL DEFAULT '{}',
  kev_listed boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_threat_intel_session ON public.threat_intel_alerts(session_id);
ALTER TABLE public.threat_intel_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "session can view own threat intel" ON public.threat_intel_alerts
  FOR SELECT USING (session_id = public.current_session_id() AND public.current_session_id() <> '');
CREATE POLICY "session can insert own threat intel" ON public.threat_intel_alerts
  FOR INSERT WITH CHECK (session_id = public.current_session_id() AND public.current_session_id() <> '');
CREATE POLICY "session can delete own threat intel" ON public.threat_intel_alerts
  FOR DELETE USING (session_id = public.current_session_id() AND public.current_session_id() <> '');

-- 4. Extend findings + scans tables (nullable; backwards compatible)
ALTER TABLE public.findings
  ADD COLUMN asset_id uuid,
  ADD COLUMN asset_type public.asset_type,
  ADD COLUMN cve_id text;

ALTER TABLE public.scans
  ADD COLUMN asset_id uuid,
  ADD COLUMN scan_kind public.scan_kind NOT NULL DEFAULT 'cloud';

CREATE INDEX idx_findings_asset ON public.findings(asset_id);
CREATE INDEX idx_scans_asset ON public.scans(asset_id);
CREATE INDEX idx_findings_cve ON public.findings(cve_id);

-- 5. Allow scans to be updated by owning session (was missing)
CREATE POLICY "session can update own scans" ON public.scans
  FOR UPDATE USING (session_id = public.current_session_id() AND public.current_session_id() <> '');