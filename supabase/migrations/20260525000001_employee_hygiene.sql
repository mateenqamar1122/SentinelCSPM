-- ══════════════════════════════════════════════════════════════
-- Employee Cyber Hygiene & Insider Threat Monitoring Schema
-- ══════════════════════════════════════════════════════════════

-- ── Enums ──────────────────────────────────────────────────────────────────────

CREATE TYPE public.hygiene_risk_level AS ENUM ('critical', 'high', 'medium', 'low');

CREATE TYPE public.hygiene_training_status AS ENUM (
  'completed', 'in_progress', 'overdue', 'not_started'
);

CREATE TYPE public.insider_threat_category AS ENUM (
  'data_exfil',
  'privilege_abuse',
  'anomalous_access',
  'policy_violation',
  'credential_misuse'
);

CREATE TYPE public.insider_alert_status AS ENUM (
  'open', 'investigating', 'resolved', 'dismissed'
);

-- ── Tables ──────────────────────────────────────────────────────────────────────

-- Employees monitored for hygiene
CREATE TABLE public.hygiene_employees (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          TEXT NOT NULL,
  name                TEXT NOT NULL,
  email               TEXT NOT NULL,
  department          TEXT NOT NULL,
  role                TEXT NOT NULL,

  -- Hygiene signals
  mfa_enabled         BOOLEAN NOT NULL DEFAULT true,
  password_age_days   INTEGER NOT NULL DEFAULT 0,   -- days since last password change
  last_login_at       TIMESTAMPTZ,

  -- Training
  training_completed  INTEGER NOT NULL DEFAULT 0,
  training_total      INTEGER NOT NULL DEFAULT 0,
  training_status     public.hygiene_training_status NOT NULL DEFAULT 'not_started',

  -- Computed risk (0-100)
  risk_score          INTEGER NOT NULL DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100),
  risk_level          public.hygiene_risk_level NOT NULL DEFAULT 'low',

  -- Metadata
  join_date           DATE,
  open_alerts_count   INTEGER NOT NULL DEFAULT 0,
  risk_flags          TEXT[] NOT NULL DEFAULT '{}',

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_hygiene_employees_session  ON public.hygiene_employees(session_id);
CREATE INDEX idx_hygiene_employees_risk     ON public.hygiene_employees(risk_level, risk_score DESC);
CREATE INDEX idx_hygiene_employees_dept     ON public.hygiene_employees(department);

-- Insider threat alerts
CREATE TABLE public.insider_alerts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      TEXT NOT NULL,
  employee_id     UUID NOT NULL REFERENCES public.hygiene_employees(id) ON DELETE CASCADE,

  category        public.insider_threat_category NOT NULL,
  severity        public.hygiene_risk_level NOT NULL,
  status          public.insider_alert_status NOT NULL DEFAULT 'open',

  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  indicators      TEXT[] NOT NULL DEFAULT '{}',
  confidence      INTEGER NOT NULL DEFAULT 50 CHECK (confidence >= 0 AND confidence <= 100),

  -- Investigation notes (append-only JSON array of {at, note, author})
  investigation_log JSONB NOT NULL DEFAULT '[]'::jsonb,

  detected_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_insider_alerts_session    ON public.insider_alerts(session_id);
CREATE INDEX idx_insider_alerts_employee   ON public.insider_alerts(employee_id);
CREATE INDEX idx_insider_alerts_status     ON public.insider_alerts(status);
CREATE INDEX idx_insider_alerts_severity   ON public.insider_alerts(severity);
CREATE INDEX idx_insider_alerts_detected   ON public.insider_alerts(detected_at DESC);

-- Security training modules catalog
CREATE TABLE public.hygiene_training_modules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  duration_min    INTEGER NOT NULL DEFAULT 15,
  category        TEXT NOT NULL DEFAULT 'General',
  mandatory       BOOLEAN NOT NULL DEFAULT false,
  due_date        DATE,
  completion_rate INTEGER NOT NULL DEFAULT 0 CHECK (completion_rate >= 0 AND completion_rate <= 100),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_hygiene_modules_session ON public.hygiene_training_modules(session_id);

-- ── Row Level Security ──────────────────────────────────────────────────────────

ALTER TABLE public.hygiene_employees        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insider_alerts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hygiene_training_modules ENABLE ROW LEVEL SECURITY;

-- hygiene_employees policies
CREATE POLICY "session can view own hygiene employees"
  ON public.hygiene_employees FOR SELECT
  USING (session_id = public.current_session_id() AND public.current_session_id() <> '');

CREATE POLICY "session can insert own hygiene employees"
  ON public.hygiene_employees FOR INSERT
  WITH CHECK (session_id = public.current_session_id() AND public.current_session_id() <> '');

CREATE POLICY "session can update own hygiene employees"
  ON public.hygiene_employees FOR UPDATE
  USING (session_id = public.current_session_id() AND public.current_session_id() <> '');

CREATE POLICY "session can delete own hygiene employees"
  ON public.hygiene_employees FOR DELETE
  USING (session_id = public.current_session_id() AND public.current_session_id() <> '');

-- insider_alerts policies
CREATE POLICY "session can view own insider alerts"
  ON public.insider_alerts FOR SELECT
  USING (session_id = public.current_session_id() AND public.current_session_id() <> '');

CREATE POLICY "session can insert own insider alerts"
  ON public.insider_alerts FOR INSERT
  WITH CHECK (session_id = public.current_session_id() AND public.current_session_id() <> '');

CREATE POLICY "session can update own insider alerts"
  ON public.insider_alerts FOR UPDATE
  USING (session_id = public.current_session_id() AND public.current_session_id() <> '');

CREATE POLICY "session can delete own insider alerts"
  ON public.insider_alerts FOR DELETE
  USING (session_id = public.current_session_id() AND public.current_session_id() <> '');

-- hygiene_training_modules policies
CREATE POLICY "session can view own training modules"
  ON public.hygiene_training_modules FOR SELECT
  USING (session_id = public.current_session_id() AND public.current_session_id() <> '');

CREATE POLICY "session can insert own training modules"
  ON public.hygiene_training_modules FOR INSERT
  WITH CHECK (session_id = public.current_session_id() AND public.current_session_id() <> '');

CREATE POLICY "session can update own training modules"
  ON public.hygiene_training_modules FOR UPDATE
  USING (session_id = public.current_session_id() AND public.current_session_id() <> '');

CREATE POLICY "session can delete own training modules"
  ON public.hygiene_training_modules FOR DELETE
  USING (session_id = public.current_session_id() AND public.current_session_id() <> '');

-- ── Server-side risk score computation ─────────────────────────────────────────
-- Recalculate risk_score and risk_level from hygiene signals automatically

CREATE OR REPLACE FUNCTION public.compute_employee_risk_score(
  p_mfa_enabled       BOOLEAN,
  p_password_age_days INTEGER,
  p_training_completed INTEGER,
  p_training_total     INTEGER,
  p_open_alerts        INTEGER
)
RETURNS TABLE (risk_score INTEGER, risk_level public.hygiene_risk_level)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_score INTEGER := 0;
BEGIN
  -- MFA disabled: +30
  IF NOT p_mfa_enabled THEN v_score := v_score + 30; END IF;

  -- Password age: +0/+10/+20/+30 by age bracket
  IF p_password_age_days > 180 THEN    v_score := v_score + 30;
  ELSIF p_password_age_days > 90 THEN  v_score := v_score + 20;
  ELSIF p_password_age_days > 60 THEN  v_score := v_score + 10;
  END IF;

  -- Training completion: +0 to +25 based on how little completed
  IF p_training_total > 0 THEN
    v_score := v_score + ROUND(25.0 * (1.0 - (p_training_completed::NUMERIC / p_training_total)));
  ELSE
    v_score := v_score + 25;
  END IF;

  -- Open alerts: +5 per alert, capped at 15
  v_score := v_score + LEAST(p_open_alerts * 5, 15);

  -- Cap at 100
  v_score := LEAST(v_score, 100);

  RETURN QUERY SELECT
    v_score,
    CASE
      WHEN v_score >= 80 THEN 'critical'::public.hygiene_risk_level
      WHEN v_score >= 60 THEN 'high'::public.hygiene_risk_level
      WHEN v_score >= 40 THEN 'medium'::public.hygiene_risk_level
      ELSE 'low'::public.hygiene_risk_level
    END;
END;
$$;

-- Trigger: recompute risk on every employee insert/update
CREATE OR REPLACE FUNCTION public.refresh_employee_risk()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_score  INTEGER;
  v_level  public.hygiene_risk_level;
BEGIN
  SELECT r.risk_score, r.risk_level
    INTO v_score, v_level
    FROM public.compute_employee_risk_score(
      NEW.mfa_enabled,
      NEW.password_age_days,
      NEW.training_completed,
      NEW.training_total,
      NEW.open_alerts_count
    ) r;

  NEW.risk_score := v_score;
  NEW.risk_level := v_level;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_refresh_employee_risk
  BEFORE INSERT OR UPDATE ON public.hygiene_employees
  FOR EACH ROW EXECUTE FUNCTION public.refresh_employee_risk();

-- Trigger: update employee open_alerts_count when alerts change
CREATE OR REPLACE FUNCTION public.sync_employee_alert_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_emp_id UUID;
  v_count  INTEGER;
BEGIN
  v_emp_id := COALESCE(NEW.employee_id, OLD.employee_id);

  SELECT COUNT(*) INTO v_count
    FROM public.insider_alerts
   WHERE employee_id = v_emp_id
     AND status IN ('open', 'investigating');

  UPDATE public.hygiene_employees
     SET open_alerts_count = v_count
   WHERE id = v_emp_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_sync_alert_count_insert
  AFTER INSERT ON public.insider_alerts
  FOR EACH ROW EXECUTE FUNCTION public.sync_employee_alert_count();

CREATE TRIGGER trg_sync_alert_count_update
  AFTER UPDATE OF status ON public.insider_alerts
  FOR EACH ROW EXECUTE FUNCTION public.sync_employee_alert_count();

CREATE TRIGGER trg_sync_alert_count_delete
  AFTER DELETE ON public.insider_alerts
  FOR EACH ROW EXECUTE FUNCTION public.sync_employee_alert_count();

-- updated_at triggers
CREATE TRIGGER update_hygiene_employees_updated_at
  BEFORE UPDATE ON public.hygiene_employees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_insider_alerts_updated_at
  BEFORE UPDATE ON public.insider_alerts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_hygiene_modules_updated_at
  BEFORE UPDATE ON public.hygiene_training_modules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
