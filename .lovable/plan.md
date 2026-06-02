## AI SOC — Agentic Alert Investigation

Add a new top-level feature that turns the platform into the "intelligent brain" sitting on top of a customer's SIEM. Customers connect their SIEM, alerts flow in (or are pasted/uploaded for demo), and an agentic AI triages, enriches, and investigates each alert end-to-end — with guardrails, evidence trails, and analyst-in-the-loop controls.

### What gets built

**1. New navigation entry: "AI SOC"** (`/ai-soc`) with three sub-views:
- **Alerts Inbox** — incoming SIEM alerts, severity, status (new / triaging / investigated / closed), AI verdict (true positive / false positive / benign / needs human), confidence score.
- **Investigation Detail** — per-alert deep dive: timeline, AI reasoning steps, enrichment (IOC lookups, asset context, user context), MITRE ATT&CK mapping, recommended actions, "Promote to Incident" button (wires to existing Incidents).
- **SIEM Connections** — connect Splunk, Sentinel, Elastic, Chronicle, Datadog, QRadar (demo connectors with mock credentials, same pattern as `cloud_connections`).

**2. Database (new tables, all gated behind authenticated user)**
- `siem_connections` — provider, name, status, config (sanitized), last_sync_at.
- `soc_alerts` — siem_connection_id, external_id, source, title, severity, raw payload (jsonb), status, ai_verdict, ai_confidence, mitre_tactics[], received_at.
- `soc_investigations` — alert_id, status, summary, reasoning_steps (jsonb), enrichments (jsonb), recommended_actions (jsonb), guardrail_flags (jsonb), created_at, completed_at.

All with RLS scoped to `auth.uid()` (these are real-account features, not the anon CSPM session model).

**3. Edge function: `soc-investigate-alert`**
Agentic loop using Lovable AI (`google/gemini-2.5-pro` for reasoning):
1. Parse alert → extract entities (IPs, hashes, users, hosts, processes).
2. Enrich — pull related findings/assets/threat-intel from existing tables; mock external IOC lookups.
3. Reason — multi-step chain: hypothesis → evidence check → verdict.
4. Map to MITRE ATT&CK tactics/techniques.
5. Recommend actions (contain, investigate further, dismiss).
6. Write `soc_investigations` row with full reasoning trail.

**4. Guardrails (prominently surfaced in UI)**
- Confidence threshold: verdicts <70% auto-flagged "Needs human review".
- Destructive-action gate: AI never executes containment — only recommends; user clicks to act.
- Evidence required: every verdict shows the reasoning steps + sources used.
- PII redaction in raw payload preview.
- Rate limit: max N investigations per hour per user.
- Visible "AI-generated" banner on every investigation, with "Override verdict" control for analysts.

**5. Gating**
AI SOC is a Pro/Enterprise feature — free tier sees the page with a sample investigation and an upgrade CTA, same pattern as cloud scans / pentester hiring (uses `useSubscription`).

**6. Demo data**
Seed 6–8 sample alerts (brute force, suspicious PowerShell, exfil-shaped DNS, impossible travel, etc.) so the page is alive on first visit.

### Technical details

- New files: `src/pages/AISoc.tsx`, `src/pages/AISocInvestigation.tsx`, `src/pages/SiemConnections.tsx`, `src/components/soc/*` (AlertRow, VerdictBadge, ReasoningTimeline, GuardrailsPanel, MitreMap, ConnectSiemDialog).
- Edge function: `supabase/functions/soc-investigate-alert/index.ts` with `verify_jwt = true`.
- Sidebar: insert "AI SOC" link under Threat Intel.
- Subscription `features` JSONB gets `ai_soc: true` for paid tiers (already structured for this).
- Reuse existing `Incidents` flow for "Promote to Incident".

### Out of scope (call out)
- Real SIEM API integrations (Splunk HEC, Sentinel Graph, etc.) — connectors are demo-shaped; real wiring is a follow-up.
- Auto-remediation actions — guardrail says AI only recommends.
