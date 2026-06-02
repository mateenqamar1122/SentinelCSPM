// Pre-built incident response playbooks for common startup scenarios.
export interface Playbook {
  id: string;
  title: string;
  severity: "critical" | "high" | "medium";
  description: string;
  steps: string[];
}

export const PLAYBOOKS: Playbook[] = [
  {
    id: "leaked-secret",
    title: "Leaked API key / secret",
    severity: "high",
    description: "An API key, token, or credential has been exposed (in a repo, log, screenshot, or third-party leak).",
    steps: [
      "Rotate the secret immediately at the provider (e.g., AWS, Stripe, OpenAI).",
      "Invalidate old sessions / tokens that used the secret.",
      "Search audit logs for unauthorized use in the last 30 days.",
      "Purge the secret from git history (BFG / git-filter-repo) if it was committed.",
      "Document root cause and add detection (gitleaks in CI, push protection).",
    ],
  },
  {
    id: "data-breach",
    title: "Suspected data breach",
    severity: "critical",
    description: "Customer data may have been accessed by an unauthorized party.",
    steps: [
      "Activate IR team. Preserve logs and snapshots before remediating.",
      "Contain: revoke compromised credentials, isolate affected systems.",
      "Determine scope: which records, which customers, which jurisdictions.",
      "Notify legal counsel. GDPR requires regulator notification within 72h.",
      "Draft customer comms; do not speculate beyond confirmed facts.",
      "Post-mortem: timeline, root cause, prevention plan.",
    ],
  },
  {
    id: "ransomware",
    title: "Ransomware / destructive malware",
    severity: "critical",
    description: "An endpoint or server has been encrypted or wiped by malware.",
    steps: [
      "Disconnect affected machines from the network — do not power off.",
      "Identify patient zero and entry vector (phishing, RDP, exposed service).",
      "Restore from clean offline backups; verify integrity before reconnecting.",
      "Do not pay ransom without legal/insurance guidance.",
      "Notify cyber insurance carrier within their SLA.",
      "Reset all credentials that touched affected systems.",
    ],
  },
  {
    id: "phishing",
    title: "Targeted phishing of employee",
    severity: "high",
    description: "An employee clicked a phishing link or entered credentials on a fake page.",
    steps: [
      "Reset the user's password and revoke all active sessions.",
      "Re-enroll MFA; check for attacker-added MFA devices.",
      "Audit email rules / forwarding for malicious additions.",
      "Search SIEM/audit logs for OAuth grants or token issuance.",
      "Notify the rest of the team with the phishing example.",
    ],
  },
  {
    id: "ddos",
    title: "DDoS / availability attack",
    severity: "medium",
    description: "Service is degraded or down due to abnormal traffic.",
    steps: [
      "Enable upstream protection (Cloudflare, AWS Shield).",
      "Identify attack pattern: L3/4 volumetric vs L7 application.",
      "Apply rate limits, geo blocks, or WAF rules as appropriate.",
      "Communicate on status page; avoid technical detail publicly.",
      "Post-incident: review capacity, autoscaling, and protection tier.",
    ],
  },
];

export const findPlaybook = (id?: string | null) => PLAYBOOKS.find(p => p.id === id);
