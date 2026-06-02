// Maps rule_id / compliance tags from findings to high-level frameworks.
// Used by the Compliance dashboard to score SOC2 / ISO 27001 / GDPR / HIPAA.
export type Framework = "SOC2" | "ISO27001" | "GDPR" | "HIPAA";

export interface ControlDef {
  id: string;            // e.g. "CC6.1"
  framework: Framework;
  title: string;
  description: string;
  // Match if a finding's compliance[] contains any of these substrings
  // OR finding.rule_id matches any of these regex patterns.
  match: { tags?: string[]; rules?: RegExp[] };
}

export const CONTROLS: ControlDef[] = [
  // SOC 2
  { id: "CC6.1", framework: "SOC2", title: "Logical access controls",
    description: "Restrict access to data, software, and infrastructure to authorized individuals.",
    match: { tags: ["SOC2 CC6.1", "CIS 1.10", "CIS Azure 6.2", "PCI 3.4"], rules: [/IAM_NO_MFA/, /SG_SSH_OPEN/, /NSG_RDP_OPEN/, /HARDCODED_JWT/, /GITLEAKS_/, /DOCKER_ENV_SECRET/] } },
  { id: "CC6.3", framework: "SOC2", title: "Privileged access management",
    description: "Limit privileged access and review periodically.",
    match: { tags: ["SOC2 CC6.3", "CIS GCP 1.5", "CIS K8s 5.1.1"], rules: [/SA_OWNER_ROLE/, /CLUSTER_ADMIN/, /STALE_KEY/] } },
  { id: "CC6.6", framework: "SOC2", title: "Data in transit / boundary protection",
    description: "Protect data in transit and at network boundaries.",
    match: { tags: ["SOC2 CC6.6", "OWASP A03"], rules: [/HTTP$/, /SQLI/, /STORAGE_HTTP/] } },
  { id: "CC7.1", framework: "SOC2", title: "Vulnerability management",
    description: "Identify, evaluate, and remediate vulnerabilities.",
    match: { tags: ["SOC2 CC7.1"], rules: [/^DEPS_/, /^TRIVY_/, /CVE-/] } },

  // ISO 27001
  { id: "A.9.4.3", framework: "ISO27001", title: "Password / credential management",
    description: "Manage authentication and credential storage securely.",
    match: { tags: ["ISO27001 A.9.4.3"], rules: [/GITLEAKS_/, /HARDCODED_JWT/] } },
  { id: "A.12.6.1", framework: "ISO27001", title: "Technical vulnerability management",
    description: "Information about technical vulnerabilities is obtained and addressed.",
    match: { tags: ["ISO27001 A.12.6.1", "CIS K8s 5.2.1"], rules: [/^DEPS_/, /^TRIVY_/, /NO_DEPENDABOT/] } },
  { id: "A.13.1.1", framework: "ISO27001", title: "Network controls",
    description: "Networks are managed and controlled to protect information in systems and applications.",
    match: { tags: ["CIS 5.2", "CIS K8s 5.3.2", "CIS Azure 6.2"], rules: [/SG_SSH_OPEN/, /NSG_RDP_OPEN/, /NO_NETWORK_POLICY/] } },
  { id: "A.18.1.4", framework: "ISO27001", title: "Privacy & PII protection",
    description: "Privacy and protection of PII as required by applicable legislation.",
    match: { rules: [/AI_PII_/, /AI_PROMPT_/] } },

  // GDPR
  { id: "Art.5", framework: "GDPR", title: "Principles of processing",
    description: "Data minimisation, integrity & confidentiality.",
    match: { tags: ["GDPR Art.5(1)(c)", "GDPR Art.5"], rules: [/AI_PII_/, /PUBLIC_ACL/, /GCS_PUBLIC/] } },
  { id: "Art.28", framework: "GDPR", title: "Processor obligations",
    description: "Engaging processors (incl. LLM providers) under appropriate contracts.",
    match: { tags: ["GDPR Art.28"], rules: [/AI_LLM_EGRESS/, /AI_SHADOW_USAGE/] } },
  { id: "Art.32", framework: "GDPR", title: "Security of processing",
    description: "Encryption, pseudonymisation, ongoing CIA of processing systems.",
    match: { tags: ["GDPR Art.32"], rules: [/NO_ENCRYPTION/, /STORAGE_HTTP/, /SHADOW_USAGE/, /PLAINTEXT_SECRET/] } },

  // HIPAA
  { id: "164.308", framework: "HIPAA", title: "Administrative safeguards",
    description: "Workforce security, access management, audit controls.",
    match: { tags: ["HIPAA 164.308"], rules: [/IAM_NO_MFA/, /STALE_KEY/, /SHADOW_USAGE/] } },
  { id: "164.312(a)(2)(iv)", framework: "HIPAA", title: "Encryption & decryption",
    description: "Encrypt ePHI at rest and in transit.",
    match: { tags: ["HIPAA 164.312(a)(2)(iv)"], rules: [/NO_ENCRYPTION/, /STORAGE_HTTP/, /PLAINTEXT_SECRET/] } },
  { id: "164.502", framework: "HIPAA", title: "Uses & disclosures of PHI",
    description: "Minimum necessary; safeguards against unauthorized disclosure.",
    match: { tags: ["HIPAA 164.502"], rules: [/AI_PII_/, /SHADOW_USAGE/] } },
];

export interface FindingLite { rule_id: string; compliance?: string[] | null; severity: string }

export function evaluateControl(c: ControlDef, findings: FindingLite[]) {
  const hits = findings.filter(f => {
    if (c.match.tags?.some(t => (f.compliance ?? []).some(x => x === t || x.startsWith(t)))) return true;
    if (c.match.rules?.some(rx => rx.test(f.rule_id))) return true;
    return false;
  });
  const severityWeight: Record<string, number> = { critical: 5, high: 3, medium: 1.5, low: 0.5, info: 0.1 };
  const penalty = hits.reduce((s, f) => s + (severityWeight[f.severity] ?? 0), 0);
  const status: "pass" | "warn" | "fail" =
    penalty === 0 ? "pass" : penalty < 3 ? "warn" : "fail";
  return { hits, penalty, status };
}

export function scoreFramework(framework: Framework, findings: FindingLite[]) {
  const controls = CONTROLS.filter(c => c.framework === framework);
  const evals = controls.map(c => ({ control: c, ...evaluateControl(c, findings) }));
  const passing = evals.filter(e => e.status === "pass").length;
  const score = Math.round((passing / controls.length) * 100);
  return { evals, score, passing, total: controls.length };
}

export const FRAMEWORK_META: Record<Framework, { label: string; blurb: string }> = {
  SOC2:    { label: "SOC 2",      blurb: "Trust Services Criteria — Security & Confidentiality" },
  ISO27001:{ label: "ISO 27001",  blurb: "Information Security Management Annex A" },
  GDPR:    { label: "GDPR",       blurb: "EU General Data Protection Regulation" },
  HIPAA:   { label: "HIPAA",      blurb: "US Health Insurance Portability and Accountability Act" },
};
