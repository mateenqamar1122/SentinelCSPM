// Smart mapping from a finding to the most appropriate IR playbook.
// Pure logic — no side effects, easy to unit-test later.
import type { Database } from "@/integrations/supabase/types";

type Finding = Database["public"]["Tables"]["findings"]["Row"];

export interface AutoIncidentDraft {
  finding_id: string;
  title: string;
  severity: "critical" | "high";
  playbook: string;
  summary: string;
  resource: string;
}

const RULES: { match: (f: Finding) => boolean; playbook: string; titlePrefix: string }[] = [
  // Leaked secret patterns
  {
    match: (f) =>
      /secret|api.?key|token|credential|gitleaks/i.test(f.rule_id) ||
      /secret|api key|token|leaked|exposed credential/i.test(f.title),
    playbook: "leaked-secret",
    titlePrefix: "Leaked secret",
  },
  // Public data exposure → treat as suspected breach
  {
    match: (f) =>
      /public|exposed|world.?readable|0\.0\.0\.0|anonymous/i.test(`${f.rule_id} ${f.title} ${f.description}`) &&
      /bucket|storage|database|s3|gcs|blob|rds|sql/i.test(`${f.resource} ${f.title}`),
    playbook: "data-breach",
    titlePrefix: "Public data exposure",
  },
  // Ransomware-like: missing backups + encryption issues on critical infra (rare in CSPM, but covered)
  {
    match: (f) => /ransomware|backup|encryption.*disabled/i.test(`${f.rule_id} ${f.title}`),
    playbook: "ransomware",
    titlePrefix: "Backup / encryption gap",
  },
  // DDoS / availability
  {
    match: (f) => /ddos|rate.?limit|waf|shield/i.test(`${f.rule_id} ${f.title}`),
    playbook: "ddos",
    titlePrefix: "Availability risk",
  },
];

const DEFAULT_PLAYBOOK = "data-breach"; // safest default for a critical/high finding

export function shouldAutoIncident(f: Finding): boolean {
  return f.severity === "critical" || f.severity === "high";
}

export function draftFromFinding(f: Finding): AutoIncidentDraft {
  const rule = RULES.find((r) => r.match(f));
  const playbook = rule?.playbook ?? DEFAULT_PLAYBOOK;
  const prefix = rule?.titlePrefix ?? "Critical finding";
  return {
    finding_id: f.id,
    title: `${prefix}: ${f.title}`.slice(0, 140),
    severity: f.severity === "critical" ? "critical" : "high",
    playbook,
    summary: `Auto-opened from finding ${f.rule_id} on ${f.resource}.\n\n${f.description}\n\nSuggested mitigation: ${f.mitigation}`,
    resource: f.resource,
  };
}
