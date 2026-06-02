// Subset of the public Gitleaks ruleset (https://github.com/gitleaks/gitleaks)
// Ported to TypeScript regex. Apache-2.0 — same rules used by gitleaks scan in CI.
// Add Shannon-entropy gate on generic high-entropy strings to cut false positives.

export interface SecretRule {
  id: string;
  description: string;
  regex: RegExp;
  severity: "critical" | "high" | "medium";
  // Optional minimum entropy on the matched group (group index 1 by default).
  entropy?: number;
  group?: number;
}

export interface SecretHit {
  rule: SecretRule;
  match: string;          // the secret value (truncated)
  fullLine: string;
  line: number;
}

export const RULES: SecretRule[] = [
  { id: "aws-access-key",   description: "AWS Access Key ID",          severity: "critical",
    regex: /\b(AKIA|ASIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASCA)[A-Z0-9]{16}\b/g },
  { id: "aws-secret-key",   description: "AWS Secret Access Key",      severity: "critical",
    regex: /\b(?:aws.?secret.?(?:access)?.?key|aws_secret_access_key)["'\s:=]+([A-Za-z0-9/+=]{40})\b/gi, entropy: 4.2 },
  { id: "github-pat",       description: "GitHub Personal Access Token", severity: "critical",
    regex: /\bghp_[A-Za-z0-9]{36}\b/g },
  { id: "github-fine-pat",  description: "GitHub Fine-Grained PAT",    severity: "critical",
    regex: /\bgithub_pat_[A-Za-z0-9_]{82}\b/g },
  { id: "github-oauth",     description: "GitHub OAuth Token",         severity: "critical",
    regex: /\bgho_[A-Za-z0-9]{36}\b/g },
  { id: "slack-bot",        description: "Slack Bot Token",            severity: "high",
    regex: /\bxoxb-\d+-\d+-[A-Za-z0-9]{24,34}\b/g },
  { id: "slack-user",       description: "Slack User Token",           severity: "high",
    regex: /\bxoxp-\d+-\d+-\d+-[a-f0-9]{32}\b/g },
  { id: "slack-webhook",    description: "Slack Incoming Webhook",     severity: "high",
    regex: /\bhttps:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]{8,11}\/B[A-Z0-9]{8,11}\/[A-Za-z0-9]{24}\b/g },
  { id: "stripe-live",      description: "Stripe Live Secret Key",     severity: "critical",
    regex: /\bsk_live_[A-Za-z0-9]{24,99}\b/g },
  { id: "stripe-restricted", description: "Stripe Restricted Key",     severity: "high",
    regex: /\brk_live_[A-Za-z0-9]{24,99}\b/g },
  { id: "stripe-publishable", description: "Stripe Publishable Key",   severity: "medium",
    regex: /\bpk_live_[A-Za-z0-9]{24,99}\b/g },
  { id: "openai",           description: "OpenAI API Key",             severity: "critical",
    regex: /\bsk-(?:proj-)?[A-Za-z0-9_\-]{32,}\b/g, entropy: 3.5 },
  { id: "anthropic",        description: "Anthropic API Key",          severity: "critical",
    regex: /\bsk-ant-(?:api03|admin01)-[A-Za-z0-9\-_]{93,}\b/g },
  { id: "google-api",       description: "Google API Key",             severity: "high",
    regex: /\bAIza[0-9A-Za-z_\-]{35}\b/g },
  { id: "google-oauth",     description: "Google OAuth Client Secret", severity: "high",
    regex: /\bGOCSPX-[A-Za-z0-9_\-]{28}\b/g },
  { id: "twilio-key",       description: "Twilio API Key",             severity: "high",
    regex: /\bSK[a-f0-9]{32}\b/g },
  { id: "sendgrid",         description: "SendGrid API Key",           severity: "high",
    regex: /\bSG\.[A-Za-z0-9_\-]{22}\.[A-Za-z0-9_\-]{43}\b/g },
  { id: "mailgun",          description: "Mailgun API Key",            severity: "high",
    regex: /\bkey-[a-f0-9]{32}\b/g },
  { id: "hugging-face",     description: "HuggingFace Access Token",   severity: "high",
    regex: /\bhf_[A-Za-z0-9]{34}\b/g },
  { id: "supabase-service", description: "Supabase Service Role JWT",  severity: "critical",
    regex: /\beyJ[A-Za-z0-9_\-]{10,}\.eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]{20,}\b/g, entropy: 4.5 },
  { id: "private-key",      description: "Private Key (PEM)",          severity: "critical",
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g },
  { id: "jwt-generic",      description: "JSON Web Token",             severity: "medium",
    regex: /\beyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\b/g, entropy: 4.0 },
  { id: "generic-secret",   description: "Generic high-entropy secret assignment", severity: "medium",
    regex: /\b(?:secret|token|api[_-]?key|password|passwd|pwd)["'\s:=]+["']([A-Za-z0-9+/_\-=]{20,})["']/gi, entropy: 4.3 },
];

function shannonEntropy(s: string): number {
  const freq: Record<string, number> = {};
  for (const c of s) freq[c] = (freq[c] ?? 0) + 1;
  let h = 0;
  for (const c in freq) {
    const p = freq[c] / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

export function scan(text: string): SecretHit[] {
  const lines = text.split(/\r?\n/);
  const hits: SecretHit[] = [];
  for (const rule of RULES) {
    rule.regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.regex.exec(text))) {
      const matched = (rule.group !== undefined ? m[rule.group] : (m[1] ?? m[0]));
      if (rule.entropy !== undefined && matched && shannonEntropy(matched) < rule.entropy) continue;
      // Find line number
      const before = text.slice(0, m.index);
      const lineNum = before.split(/\r?\n/).length;
      const fullLine = lines[lineNum - 1] ?? "";
      hits.push({
        rule, line: lineNum, fullLine: fullLine.trim().slice(0, 200),
        match: (matched ?? "").slice(0, 12) + "…",
      });
      if (!rule.regex.global) break;
    }
  }
  return hits;
}
