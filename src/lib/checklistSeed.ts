// Seed list of starter security tasks for early-stage startups.
// Mapped loosely to SOC 2 / ISO 27001 controls.
export interface SeedItem {
  category: string;
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
}

export const CHECKLIST_SEED: SeedItem[] = [
  // Identity & access
  { category: "Identity", title: "Enforce MFA on all admin accounts", description: "Require MFA on root/admin for cloud, GitHub, email, and password manager.", priority: "high" },
  { category: "Identity", title: "Use a password manager company-wide", description: "1Password / Bitwarden with a shared vault and SSO if available.", priority: "high" },
  { category: "Identity", title: "Quarterly access review", description: "Review who has access to production, repos, and admin tools every 3 months.", priority: "medium" },
  { category: "Identity", title: "Offboarding checklist", description: "Document steps to revoke access within 24h when someone leaves.", priority: "high" },

  // Code & secrets
  { category: "Code", title: "Enable branch protection on main", description: "Require PR review and status checks before merging on default branches.", priority: "high" },
  { category: "Code", title: "Enable secret scanning on repos", description: "Turn on GitHub secret scanning + push protection (or run gitleaks in CI).", priority: "high" },
  { category: "Code", title: "Enable Dependabot / Renovate", description: "Auto-PRs for vulnerable dependencies. Triage weekly.", priority: "medium" },

  // Cloud
  { category: "Cloud", title: "Enable CloudTrail / audit logs", description: "Turn on audit logs for AWS / GCP / Azure with 90-day retention minimum.", priority: "high" },
  { category: "Cloud", title: "No public S3/GCS buckets unless intentional", description: "Audit buckets and block public access by default.", priority: "high" },
  { category: "Cloud", title: "Encrypt data at rest", description: "Default-encrypt databases, buckets, and disks.", priority: "medium" },

  // Data & backups
  { category: "Data", title: "Automated daily backups with restore test", description: "Run a restore drill at least once per quarter.", priority: "high" },
  { category: "Data", title: "Document data classification", description: "Tag what's PII, financial, or customer-confidential.", priority: "medium" },

  // Vendor
  { category: "Vendor", title: "Track all SaaS vendors with data access", description: "Maintain a vendor list with SOC 2 status and renewal dates.", priority: "medium" },
  { category: "Vendor", title: "Sign DPAs with EU data processors", description: "Required under GDPR Art. 28.", priority: "medium" },

  // People
  { category: "People", title: "Annual security awareness training", description: "Phishing + secure-coding refresher for the whole team.", priority: "medium" },
  { category: "People", title: "Acceptable Use Policy signed", description: "Every employee/contractor signs an AUP at onboarding.", priority: "low" },

  // Incident
  { category: "Incident", title: "Written incident response plan", description: "Roles, comms tree, and step-by-step playbooks.", priority: "high" },
  { category: "Incident", title: "Status page + customer comms template", description: "Pre-written templates for breach notification within 72h.", priority: "medium" },
];
