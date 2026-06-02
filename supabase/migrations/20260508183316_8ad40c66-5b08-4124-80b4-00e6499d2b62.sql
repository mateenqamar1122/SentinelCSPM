
CREATE TYPE public.siem_provider AS ENUM ('splunk','sentinel','elastic','chronicle','datadog','qradar','other');
CREATE TYPE public.soc_alert_status AS ENUM ('new','triaging','investigated','closed');
CREATE TYPE public.soc_verdict AS ENUM ('true_positive','false_positive','benign','needs_human','pending');

CREATE TABLE public.siem_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider public.siem_provider NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'connected',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.siem_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users view own siem" ON public.siem_connections FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users insert own siem" ON public.siem_connections FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update own siem" ON public.siem_connections FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users delete own siem" ON public.siem_connections FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER trg_siem_updated BEFORE UPDATE ON public.siem_connections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.soc_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  siem_connection_id uuid REFERENCES public.siem_connections(id) ON DELETE SET NULL,
  external_id text,
  source text NOT NULL DEFAULT 'demo',
  title text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  status public.soc_alert_status NOT NULL DEFAULT 'new',
  ai_verdict public.soc_verdict NOT NULL DEFAULT 'pending',
  ai_confidence numeric,
  mitre_tactics text[] NOT NULL DEFAULT '{}',
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.soc_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users view own alerts" ON public.soc_alerts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users insert own alerts" ON public.soc_alerts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update own alerts" ON public.soc_alerts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users delete own alerts" ON public.soc_alerts FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_soc_alerts_user ON public.soc_alerts(user_id, received_at DESC);
CREATE TRIGGER trg_soc_alerts_updated BEFORE UPDATE ON public.soc_alerts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.soc_investigations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  alert_id uuid NOT NULL REFERENCES public.soc_alerts(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'completed',
  summary text,
  reasoning_steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  enrichments jsonb NOT NULL DEFAULT '{}'::jsonb,
  recommended_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  guardrail_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
ALTER TABLE public.soc_investigations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users view own inv" ON public.soc_investigations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users insert own inv" ON public.soc_investigations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update own inv" ON public.soc_investigations FOR UPDATE USING (auth.uid() = user_id);
CREATE INDEX idx_soc_inv_alert ON public.soc_investigations(alert_id, created_at DESC);
