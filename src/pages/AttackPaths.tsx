import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { AppShell } from "@/components/cspm/AppShell";
import {
  Shield, AlertTriangle, ChevronRight, X, ZoomIn, ZoomOut, Maximize2,
  Filter, RefreshCw, Lock, Database, Globe, Server, Cloud, Key, User,
  Cpu, Search, Clock, Wrench, ChevronDown, ChevronUp, Activity,
  TrendingDown, BookOpen, ExternalLink, Info, CheckCircle2, Circle,
  SlidersHorizontal, CalendarDays, BarChart3, Target, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

// ── Types ──────────────────────────────────────────────────────────────────

type NodeKind = "internet" | "service" | "iam" | "database" | "storage" | "compute" | "secret";
type Severity  = "critical" | "high" | "medium" | "low";
type RightTab  = "paths" | "timeline" | "remediation";

interface GraphNode {
  id: string;
  label: string;
  kind: NodeKind;
  x: number;
  y: number;
  severity?: Severity;
  findings: string[];
  asset: string;
  cves?: string[];
  affectedCount?: number;
  remediationEffort?: "low" | "medium" | "high";
  description?: string;
}

interface GraphEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  severity: Severity;
}

interface TimelineEvent {
  date: string;
  label: string;
  type: "detected" | "changed" | "escalated" | "resolved";
}

interface RemediationStep {
  step: number;
  title: string;
  detail: string;
  effort: "low" | "medium" | "high";
}

interface AttackPath {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  nodeIds: string[];
  mitre: string[];
  blast_radius: number;
  firstDetected: string;
  lastSeen: string;
  riskAfterFix: number;
  timeline: TimelineEvent[];
  remediation: RemediationStep[];
}

// ── Mock Data ──────────────────────────────────────────────────────────────

const NODES: GraphNode[] = [
  {
    id: "n1",
    label: "Public Internet",
    kind: "internet",
    x: 80,  y: 300,
    findings: [],
    asset: "external",
    description: "External internet entry point. All inbound traffic originates here.",
  },
  {
    id: "n2",
    label: "Load Balancer",
    kind: "service",
    x: 260, y: 200,
    severity: "low",
    findings: ["TLS 1.0 enabled"],
    asset: "aws/alb-prod",
    cves: [],
    affectedCount: 1,
    remediationEffort: "low",
    description: "Application Load Balancer fronting web services. TLS 1.0 support increases interception risk.",
  },
  {
    id: "n3",
    label: "API Gateway",
    kind: "service",
    x: 260, y: 390,
    severity: "medium",
    findings: ["No auth on /admin"],
    asset: "aws/apigw-prod",
    cves: [],
    affectedCount: 3,
    remediationEffort: "low",
    description: "REST API Gateway exposing backend Lambda. /admin endpoint lacks any authentication.",
  },
  {
    id: "n4",
    label: "EC2 Web Server",
    kind: "compute",
    x: 450, y: 130,
    severity: "high",
    findings: ["CVE-2024-21412", "SSH exposed to 0.0.0.0/0"],
    asset: "aws/ec2-i-0abc",
    cves: ["CVE-2024-21412", "CVE-2023-38545"],
    affectedCount: 2,
    remediationEffort: "medium",
    description: "Public-facing EC2 instance running NGINX. Exposes SSH to the entire internet and carries an unpatched kernel CVE.",
  },
  {
    id: "n5",
    label: "Lambda Function",
    kind: "compute",
    x: 450, y: 300,
    severity: "critical",
    findings: ["Env var: DB_PASSWORD plaintext", "Overpermissive role"],
    asset: "aws/lambda-auth",
    cves: [],
    affectedCount: 5,
    remediationEffort: "medium",
    description: "Auth Lambda stores DB credentials as plaintext environment variables and executes under an over-permissive IAM role.",
  },
  {
    id: "n6",
    label: "RDS PostgreSQL",
    kind: "database",
    x: 450, y: 460,
    severity: "critical",
    findings: ["Publicly accessible", "No encryption at rest"],
    asset: "aws/rds-prod-db",
    cves: [],
    affectedCount: 12,
    remediationEffort: "high",
    description: "Production RDS instance accessible from the public internet. No encryption at rest puts PII data at risk.",
  },
  {
    id: "n7",
    label: "IAM Role: LambdaExec",
    kind: "iam",
    x: 640, y: 200,
    severity: "critical",
    findings: ["AdministratorAccess attached"],
    asset: "aws/iam/role/lambda-exec",
    cves: [],
    affectedCount: 8,
    remediationEffort: "medium",
    description: "Lambda execution role granted AdministratorAccess — effectively full AWS account takeover if assumed.",
  },
  {
    id: "n8",
    label: "S3 Bucket: backups",
    kind: "storage",
    x: 640, y: 370,
    severity: "high",
    findings: ["Public ACL", "No versioning"],
    asset: "aws/s3/prod-backups",
    cves: [],
    affectedCount: 7,
    remediationEffort: "low",
    description: "Backup S3 bucket with a public ACL allows unauthenticated read access to all backup files.",
  },
  {
    id: "n9",
    label: "Secrets Manager",
    kind: "secret",
    x: 640, y: 520,
    severity: "medium",
    findings: ["Unused secret rotation"],
    asset: "aws/secretsmanager/db-creds",
    cves: [],
    affectedCount: 2,
    remediationEffort: "low",
    description: "Secrets Manager entry for DB credentials. Automatic rotation is disabled, increasing staleness risk.",
  },
  {
    id: "n10",
    label: "Data Exfiltration",
    kind: "internet",
    x: 820, y: 300,
    findings: [],
    asset: "external",
    description: "Potential exfiltration endpoint representing external attacker-controlled infrastructure.",
  },
];

const EDGES: GraphEdge[] = [
  { id: "e1",  from: "n1",  to: "n2",  label: "HTTPS",           severity: "low" },
  { id: "e2",  from: "n1",  to: "n3",  label: "HTTP",            severity: "medium" },
  { id: "e3",  from: "n2",  to: "n4",  label: "Proxy",           severity: "high" },
  { id: "e4",  from: "n3",  to: "n5",  label: "Invoke",          severity: "critical" },
  { id: "e5",  from: "n4",  to: "n7",  label: "AssumeRole",      severity: "critical" },
  { id: "e6",  from: "n5",  to: "n6",  label: "SQL query",       severity: "critical" },
  { id: "e7",  from: "n5",  to: "n7",  label: "AssumeRole",      severity: "critical" },
  { id: "e8",  from: "n7",  to: "n8",  label: "s3:*",            severity: "high" },
  { id: "e9",  from: "n7",  to: "n9",  label: "GetSecretValue",  severity: "medium" },
  { id: "e10", from: "n8",  to: "n10", label: "Public read",     severity: "high" },
  { id: "e11", from: "n6",  to: "n10", label: "Direct exposure", severity: "critical" },
];

const PATHS: AttackPath[] = [
  {
    id: "p1",
    title: "Internet → Lambda → AdminRole → S3 Exfil",
    description:
      "Unauthenticated API Gateway endpoint invokes an over-permissive Lambda that carries AdministratorAccess. Attacker pivots to S3 public bucket and exfiltrates backup data.",
    severity: "critical",
    nodeIds: ["n1", "n3", "n5", "n7", "n8", "n10"],
    mitre: ["T1190", "T1078", "T1537"],
    blast_radius: 95,
    firstDetected: "2024-11-03",
    lastSeen: "2025-05-21",
    riskAfterFix: 12,
    timeline: [
      { date: "2024-11-03", label: "Path first detected during automated scan", type: "detected" },
      { date: "2024-12-14", label: "Blast radius escalated from 78% to 95%", type: "escalated" },
      { date: "2025-01-22", label: "Lambda role permissions widened by deploy pipeline", type: "changed" },
      { date: "2025-03-08", label: "S3 bucket ACL changed to public — severity remains critical", type: "changed" },
      { date: "2025-05-21", label: "Path still active — no remediation applied", type: "changed" },
    ],
    remediation: [
      { step: 1, title: "Add auth to API Gateway /admin", detail: "Attach a Cognito User Pool or Lambda Authorizer to the /admin route in API Gateway. Estimated fix time: 1 hour.", effort: "low" },
      { step: 2, title: "Replace AdministratorAccess on Lambda role", detail: "Scope IAM role to only required actions (e.g., s3:GetObject on specific prefix, secretsmanager:GetSecretValue on one ARN). Use IAM Access Analyzer to generate a least-privilege policy.", effort: "medium" },
      { step: 3, title: "Remove public ACL from S3 bucket", detail: "Enable Block Public Access settings at account and bucket level. Move bucket to private, use pre-signed URLs for access.", effort: "low" },
      { step: 4, title: "Enable S3 versioning + MFA Delete", detail: "Enable versioning to prevent silent data destruction. Enable MFA Delete to require multi-factor confirmation for permanent deletes.", effort: "low" },
    ],
  },
  {
    id: "p2",
    title: "Internet → EC2 → IAM → AdminRole Takeover",
    description:
      "CVE-2024-21412 on EC2 allows RCE. From there attacker calls AssumeRole on the Lambda execution role granting full admin to the AWS account.",
    severity: "critical",
    nodeIds: ["n1", "n2", "n4", "n7"],
    mitre: ["T1190", "T1548", "T1078.004"],
    blast_radius: 88,
    firstDetected: "2025-01-09",
    lastSeen: "2025-05-20",
    riskAfterFix: 8,
    timeline: [
      { date: "2025-01-09", label: "CVE-2024-21412 published — EC2 instance identified as vulnerable", type: "detected" },
      { date: "2025-01-15", label: "Attack path correlated with IAM role escalation vector", type: "escalated" },
      { date: "2025-02-28", label: "Patch window scheduled but missed due to change freeze", type: "changed" },
      { date: "2025-05-20", label: "Still unpatched — active exploitation reported in wild", type: "changed" },
    ],
    remediation: [
      { step: 1, title: "Patch EC2 instance kernel", detail: "Apply kernel patch for CVE-2024-21412. Use AWS Systems Manager Patch Manager to automate across all instances. Reboot required.", effort: "medium" },
      { step: 2, title: "Restrict SSH access", detail: "Remove 0.0.0.0/0 SSH inbound rule. Use AWS SSM Session Manager instead of direct SSH. No public port needed.", effort: "low" },
      { step: 3, title: "Restrict Lambda execution role trust policy", detail: "Remove EC2 instance profile from the trust relationships of the Lambda execution role to prevent AssumeRole lateral movement.", effort: "medium" },
    ],
  },
  {
    id: "p3",
    title: "Lambda plaintext creds → RDS public exposure",
    description:
      "DB_PASSWORD stored as plaintext env var in Lambda. RDS is also publicly accessible with no VPC restriction, enabling direct DB compromise.",
    severity: "high",
    nodeIds: ["n1", "n3", "n5", "n6", "n10"],
    mitre: ["T1552", "T1530"],
    blast_radius: 72,
    firstDetected: "2024-09-17",
    lastSeen: "2025-05-19",
    riskAfterFix: 18,
    timeline: [
      { date: "2024-09-17", label: "Plaintext DB_PASSWORD found in Lambda environment", type: "detected" },
      { date: "2024-10-05", label: "RDS public accessibility confirmed as additional vector", type: "escalated" },
      { date: "2025-02-12", label: "Temporary VPC rule added — later reverted", type: "changed" },
      { date: "2025-05-19", label: "Both issues still present", type: "changed" },
    ],
    remediation: [
      { step: 1, title: "Migrate secrets to AWS Secrets Manager", detail: "Remove DB_PASSWORD from Lambda env vars. Use boto3/SDK to fetch at runtime from Secrets Manager. Rotate immediately after migration.", effort: "medium" },
      { step: 2, title: "Disable public accessibility on RDS", detail: "Set PubliclyAccessible=false on the RDS instance. Move to private subnet with a NAT gateway for outbound access.", effort: "high" },
      { step: 3, title: "Configure RDS security group", detail: "Restrict inbound port 5432 to Lambda and EC2 security group IDs only. Remove 0.0.0.0/0 rule entirely.", effort: "low" },
      { step: 4, title: "Enable RDS encryption at rest", detail: "Encrypt RDS instance using AWS KMS. Requires snapshot + restore for existing unencrypted instances.", effort: "high" },
    ],
  },
  {
    id: "p4",
    title: "Secrets Manager over-read via IAM",
    description:
      "Lambda execution role can call GetSecretValue on all secrets, leaking additional credentials stored in Secrets Manager.",
    severity: "medium",
    nodeIds: ["n5", "n7", "n9"],
    mitre: ["T1552.001"],
    blast_radius: 45,
    firstDetected: "2025-02-04",
    lastSeen: "2025-05-21",
    riskAfterFix: 5,
    timeline: [
      { date: "2025-02-04", label: "IAM policy wildcard on secretsmanager:* detected", type: "detected" },
      { date: "2025-03-11", label: "Rotation disabled on db-creds secret — risk increased", type: "escalated" },
      { date: "2025-05-21", label: "No remediation applied", type: "changed" },
    ],
    remediation: [
      { step: 1, title: "Scope secretsmanager policy to specific ARN", detail: "Change Lambda IAM policy from secretsmanager:GetSecretValue on '*' to the specific secret ARN only.", effort: "low" },
      { step: 2, title: "Enable automatic secret rotation", detail: "Configure rotation for db-creds using a Lambda rotation function. Set rotation schedule to 30 days.", effort: "medium" },
    ],
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────

const SEV_COLOR: Record<Severity, string> = {
  critical: "#ef4444",
  high:     "#f97316",
  medium:   "#eab308",
  low:      "#3b82f6",
};

const SEV_BG: Record<Severity, string> = {
  critical: "rgba(239,68,68,0.15)",
  high:     "rgba(249,115,22,0.15)",
  medium:   "rgba(234,179,8,0.15)",
  low:      "rgba(59,130,246,0.15)",
};

const EFFORT_COLOR: Record<"low" | "medium" | "high", string> = {
  low:    "#22c55e",
  medium: "#eab308",
  high:   "#ef4444",
};

const KIND_ICON: Record<NodeKind, typeof Shield> = {
  internet: Globe,
  service:  Cloud,
  iam:      Key,
  database: Database,
  storage:  Server,
  compute:  Cpu,
  secret:   Lock,
};

const TIMELINE_TYPE_COLOR: Record<TimelineEvent["type"], string> = {
  detected:  "#3b82f6",
  changed:   "#eab308",
  escalated: "#ef4444",
  resolved:  "#22c55e",
};

const TIMELINE_TYPE_ICON: Record<TimelineEvent["type"], typeof Shield> = {
  detected:  Activity,
  changed:   Clock,
  escalated: AlertTriangle,
  resolved:  CheckCircle2,
};

function NodeIcon({ kind, size = 16 }: { kind: NodeKind; size?: number }) {
  const Icon = KIND_ICON[kind];
  return <Icon size={size} />;
}

function midpoint(x1: number, y1: number, x2: number, y2: number) {
  return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
}

function getEdgePoints(from: GraphNode, to: GraphNode) {
  const R = 34;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  return {
    x1: from.x + ux * R,
    y1: from.y + uy * R,
    x2: to.x - ux * R,
    y2: to.y - uy * R,
  };
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function daysBetween(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

// ── Sub-components ──────────────────────────────────────────────────────────

function RemediationPanel({ path }: { path: AttackPath }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const reduction = path.blast_radius - path.riskAfterFix;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="surface-card p-4 mt-2"
      style={{ borderColor: SEV_COLOR[path.severity], borderWidth: 1.5 }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Wrench className="w-4 h-4" style={{ color: SEV_COLOR[path.severity] }} />
        <span className="font-semibold text-sm">Remediation Plan</span>
        <span className="ml-auto text-[10px] font-mono text-muted-foreground">{path.remediation.length} steps</span>
      </div>

      {/* Risk reduction bar */}
      <div className="mb-4 p-3 rounded-xl border border-border bg-secondary/30">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-mono uppercase text-muted-foreground">Risk reduction after fix</span>
          <span className="text-[10px] font-mono font-bold" style={{ color: "#22c55e" }}>
            −{reduction}%
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${path.blast_radius}%`, background: SEV_COLOR[path.severity] }}
            />
          </div>
          <span className="text-[9px] font-mono text-muted-foreground">{path.blast_radius}%</span>
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${path.riskAfterFix}%`, background: "#22c55e" }}
            />
          </div>
          <span className="text-[9px] font-mono text-muted-foreground">{path.riskAfterFix}%</span>
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[9px] font-mono text-muted-foreground">Current</span>
          <span className="text-[9px] font-mono" style={{ color: "#22c55e" }}>After fix</span>
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-2">
        {path.remediation.map((step) => (
          <div
            key={step.step}
            className="border border-border rounded-xl overflow-hidden"
            style={{ background: "var(--gradient-card)" }}
          >
            <button
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-secondary/40 transition-colors"
              onClick={() => setExpanded(expanded === step.step ? null : step.step)}
            >
              <span
                className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                style={{ background: SEV_BG[path.severity], color: SEV_COLOR[path.severity] }}
              >
                {step.step}
              </span>
              <span className="text-xs font-medium flex-1">{step.title}</span>
              <span
                className="text-[9px] font-mono px-1.5 py-0.5 rounded-full shrink-0"
                style={{ background: `${EFFORT_COLOR[step.effort]}22`, color: EFFORT_COLOR[step.effort] }}
              >
                {step.effort} effort
              </span>
              {expanded === step.step ? (
                <ChevronUp className="w-3 h-3 text-muted-foreground shrink-0" />
              ) : (
                <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
              )}
            </button>
            <AnimatePresence>
              {expanded === step.step && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-3 pb-3 pt-0 text-xs text-muted-foreground leading-relaxed border-t border-border">
                    <div className="mt-2">{step.detail}</div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function TimelinePanel({ path }: { path: AttackPath }) {
  const age = daysBetween(path.firstDetected, path.lastSeen);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="surface-card p-4 mt-2"
      style={{ borderColor: SEV_COLOR[path.severity], borderWidth: 1.5 }}
    >
      <div className="flex items-center gap-2 mb-3">
        <CalendarDays className="w-4 h-4" style={{ color: SEV_COLOR[path.severity] }} />
        <span className="font-semibold text-sm">Timeline & History</span>
      </div>

      {/* Summary pills */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="rounded-xl border border-border p-2.5 bg-secondary/30">
          <div className="text-[9px] font-mono uppercase text-muted-foreground mb-0.5">First detected</div>
          <div className="text-xs font-semibold">{formatDate(path.firstDetected)}</div>
        </div>
        <div className="rounded-xl border border-border p-2.5 bg-secondary/30">
          <div className="text-[9px] font-mono uppercase text-muted-foreground mb-0.5">Active for</div>
          <div className="text-xs font-semibold" style={{ color: SEV_COLOR[path.severity] }}>{age} days</div>
        </div>
        <div className="rounded-xl border border-border p-2.5 bg-secondary/30">
          <div className="text-[9px] font-mono uppercase text-muted-foreground mb-0.5">Last seen</div>
          <div className="text-xs font-semibold">{formatDate(path.lastSeen)}</div>
        </div>
        <div className="rounded-xl border border-border p-2.5 bg-secondary/30">
          <div className="text-[9px] font-mono uppercase text-muted-foreground mb-0.5">Events</div>
          <div className="text-xs font-semibold">{path.timeline.length}</div>
        </div>
      </div>

      {/* Timeline events */}
      <div className="relative pl-5">
        {/* Vertical line */}
        <div className="absolute left-2 top-0 bottom-0 w-px bg-border" />

        <div className="space-y-4">
          {path.timeline.map((ev, i) => {
            const Icon = TIMELINE_TYPE_ICON[ev.type];
            const col  = TIMELINE_TYPE_COLOR[ev.type];
            return (
              <div key={i} className="relative">
                {/* Dot */}
                <div
                  className="absolute -left-5 top-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center border-2"
                  style={{ background: `${col}22`, borderColor: col }}
                >
                  <Icon size={6} style={{ color: col }} />
                </div>
                <div className="text-[9px] font-mono text-muted-foreground mb-0.5">{formatDate(ev.date)}</div>
                <div className="text-[10px] text-foreground leading-snug">{ev.label}</div>
                {/* Type badge */}
                <span
                  className="text-[8px] font-mono uppercase px-1 py-0.5 rounded mt-1 inline-block"
                  style={{ background: `${col}22`, color: col }}
                >
                  {ev.type}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

function NodeDrilldown({ node, onClose }: { node: GraphNode; onClose: () => void }) {
  const col = node.severity ? SEV_COLOR[node.severity] : "#6b7280";
  const bg  = node.severity ? SEV_BG[node.severity]   : "rgba(107,114,128,0.12)";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="surface-card p-4"
      style={{ borderColor: col, borderWidth: 1.5 }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span style={{ color: col }}>
            <NodeIcon kind={node.kind} size={16} />
          </span>
          <div>
            <div className="font-semibold text-sm">{node.label}</div>
            <div className="text-[10px] font-mono text-muted-foreground">{node.asset}</div>
          </div>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Description */}
      {node.description && (
        <p className="text-xs text-muted-foreground mb-3 leading-relaxed border-b border-border pb-3">
          {node.description}
        </p>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {node.affectedCount !== undefined && (
          <div className="rounded-xl border border-border p-2.5" style={{ background: bg }}>
            <div className="text-[9px] font-mono uppercase text-muted-foreground mb-0.5">Affected resources</div>
            <div className="text-lg font-bold" style={{ color: col }}>{node.affectedCount}</div>
          </div>
        )}
        {node.remediationEffort && (
          <div className="rounded-xl border border-border p-2.5 bg-secondary/30">
            <div className="text-[9px] font-mono uppercase text-muted-foreground mb-0.5">Fix effort</div>
            <div
              className="text-xs font-bold capitalize"
              style={{ color: EFFORT_COLOR[node.remediationEffort] }}
            >
              {node.remediationEffort}
            </div>
          </div>
        )}
      </div>

      {/* Findings */}
      {node.findings.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1.5">Findings</div>
          <ul className="space-y-1">
            {node.findings.map((f) => (
              <li key={f} className="flex items-start gap-1.5 text-xs">
                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" style={{ color: col }} />
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* CVEs */}
      {node.cves && node.cves.length > 0 && (
        <div>
          <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1.5">Linked CVEs</div>
          <div className="flex flex-wrap gap-1">
            {node.cves.map((cve) => (
              <a
                key={cve}
                href={`https://nvd.nist.gov/vuln/detail/${cve}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border hover:opacity-80 transition-opacity"
                style={{ borderColor: col, color: col, background: bg }}
              >
                {cve}
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function AttackPaths() {
  const [nodes, setNodes]                 = useState<GraphNode[]>(NODES);
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const nodeDragStart                     = useRef({ x: 0, y: 0, nx: 0, ny: 0, hasMoved: false });
  const [selectedPath, setSelectedPath]   = useState<AttackPath | null>(null);
  const [selectedNode, setSelectedNode]   = useState<GraphNode | null>(null);
  const [hoveredEdge, setHoveredEdge]     = useState<string | null>(null);
  const [sevFilter, setSevFilter]         = useState<"all" | Severity>("all");
  const [rightTab, setRightTab]           = useState<RightTab>("paths");
  const [zoom, setZoom]                   = useState(1);
  const [pan, setPan]                     = useState({ x: 0, y: 0 });
  const [dragging, setDragging]           = useState(false);
  const dragStart                         = useRef({ x: 0, y: 0, px: 0, py: 0 });
  const svgRef                            = useRef<SVGSVGElement>(null);

  // ── Search & Filter state ─────────────────────────────────────────────
  const [searchQuery, setSearchQuery]     = useState("");
  const [showFilters, setShowFilters]     = useState(false);
  const [assetFilter, setAssetFilter]     = useState<NodeKind | "all">("all");
  const [mitreFilter, setMitreFilter]     = useState("");
  const [blastMin, setBlastMin]           = useState(0);
  const [blastMax, setBlastMax]           = useState(100);

  useEffect(() => { document.title = "Attack Paths — SentinelCSPM"; }, []);

  // ── Derived data ──────────────────────────────────────────────────────

  const nodeMap = useMemo(() => Object.fromEntries(nodes.map(n => [n.id, n])), [nodes]);

  const allMitreIds = useMemo(() =>
    Array.from(new Set(PATHS.flatMap(p => p.mitre))).sort(),
    []
  );

  const filteredPaths = useMemo(() => {
    return PATHS.filter(p => {
      if (sevFilter !== "all" && p.severity !== sevFilter) return false;
      if (blastMin > 0 && p.blast_radius < blastMin) return false;
      if (blastMax < 100 && p.blast_radius > blastMax) return false;
      if (mitreFilter && !p.mitre.some(m => m.toLowerCase().includes(mitreFilter.toLowerCase()))) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesPath = p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q);
        const matchesNode = p.nodeIds.some(nid => nodeMap[nid]?.label.toLowerCase().includes(q));
        if (!matchesPath && !matchesNode) return false;
      }
      if (assetFilter !== "all") {
        const hasKind = p.nodeIds.some(nid => nodeMap[nid]?.kind === assetFilter);
        if (!hasKind) return false;
      }
      return true;
    });
  }, [sevFilter, searchQuery, assetFilter, mitreFilter, blastMin, blastMax, nodeMap]);

  const highlightedIds = selectedPath ? new Set(selectedPath.nodeIds) : null;

  const pathEdgeIds = useMemo(() =>
    selectedPath
      ? new Set(
          EDGES
            .filter(e => selectedPath.nodeIds.includes(e.from) && selectedPath.nodeIds.includes(e.to))
            .map(e => e.id)
        )
      : null,
    [selectedPath]
  );

  // ── Node Dragging ──────────────────────────────────────────────────────

  const onNodeMouseDown = useCallback((e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    setDraggedNodeId(nodeId);
    nodeDragStart.current = {
      x: e.clientX,
      y: e.clientY,
      nx: node.x,
      ny: node.y,
      hasMoved: false,
    };
  }, [nodes]);

  // ── Pan / Zoom ────────────────────────────────────────────────────────

  const onMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if ((e.target as SVGElement).closest(".graph-node")) return;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
  }, [pan]);

  const onMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (draggedNodeId) {
      const dx = (e.clientX - nodeDragStart.current.x) / zoom;
      const dy = (e.clientY - nodeDragStart.current.y) / zoom;
      if (Math.abs(e.clientX - nodeDragStart.current.x) > 3 || Math.abs(e.clientY - nodeDragStart.current.y) > 3) {
        nodeDragStart.current.hasMoved = true;
      }
      setNodes(prevNodes =>
        prevNodes.map(n =>
          n.id === draggedNodeId
            ? { ...n, x: nodeDragStart.current.nx + dx, y: nodeDragStart.current.ny + dy }
            : n
        )
      );
      return;
    }
    if (!dragging) return;
    setPan({
      x: dragStart.current.px + (e.clientX - dragStart.current.x),
      y: dragStart.current.py + (e.clientY - dragStart.current.y),
    });
  }, [dragging, draggedNodeId, zoom]);

  const onMouseUp = useCallback(() => {
    setDragging(false);
    setDraggedNodeId(null);
  }, []);

  const onWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    setZoom(z => Math.min(2, Math.max(0.4, z - e.deltaY * 0.001)));
  }, []);

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setNodes(NODES);
  };

  const clearFilters = () => {
    setSearchQuery("");
    setSevFilter("all");
    setAssetFilter("all");
    setMitreFilter("");
    setBlastMin(0);
    setBlastMax(100);
  };

  const hasActiveFilters = searchQuery || sevFilter !== "all" || assetFilter !== "all" || mitreFilter || blastMin > 0 || blastMax < 100;

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <AppShell>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-end justify-between mb-5 gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Shield className="w-7 h-7 text-[hsl(var(--sev-critical))]" />
            Attack Paths
          </h1>
          <p className="text-muted-foreground mt-1">
            Graph-based view of exploitable chains across your cloud infrastructure.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={resetView}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Reset view
          </Button>
        </div>
      </div>

      {/* ── Stats row ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {(["critical", "high", "medium", "low"] as Severity[]).map(s => (
          <button
            key={s}
            onClick={() => setSevFilter(f => f === s ? "all" : s)}
            className="surface-card p-3 text-left transition-all hover:scale-[1.02]"
            style={{
              borderColor: sevFilter === s ? SEV_COLOR[s] : undefined,
              borderWidth: sevFilter === s ? 2 : undefined,
            }}
          >
            <div className="text-xs font-mono uppercase tracking-wider" style={{ color: SEV_COLOR[s] }}>{s}</div>
            <div className="text-2xl font-bold mt-0.5">{PATHS.filter(p => p.severity === s).length}</div>
            <div className="text-xs text-muted-foreground">path{PATHS.filter(p => p.severity === s).length !== 1 ? "s" : ""}</div>
          </button>
        ))}
      </div>

      {/* ── Search & Filters bar ────────────────────────────────────── */}
      <div className="mb-4 space-y-2">
        <div className="flex items-center gap-2">
          {/* Search input */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search paths, nodes, descriptions…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs font-mono rounded-xl border border-border bg-card/60 backdrop-blur focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/10 placeholder:text-muted-foreground/60 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Filter toggle */}
          <button
            onClick={() => setShowFilters(f => !f)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-mono rounded-xl border border-border bg-card/60 hover:bg-secondary transition-colors"
            style={hasActiveFilters ? { borderColor: "#3b82f6", color: "#3b82f6" } : undefined}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Filters
            {hasActiveFilters && (
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />
            )}
          </button>

          {/* Clear */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 px-3 py-2 text-xs font-mono rounded-xl border border-border bg-card/60 hover:bg-secondary text-muted-foreground transition-colors"
            >
              <X className="w-3 h-3" /> Clear
            </button>
          )}
        </div>

        {/* Advanced filters panel */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="overflow-hidden"
            >
              <div className="surface-card p-4 grid grid-cols-3 gap-4">
                {/* Asset type filter */}
                <div>
                  <div className="text-[10px] font-mono uppercase text-muted-foreground mb-2">Asset Type</div>
                  <div className="flex flex-wrap gap-1">
                    {(["all", "internet", "service", "iam", "database", "storage", "compute", "secret"] as const).map(k => (
                      <button
                        key={k}
                        onClick={() => setAssetFilter(k)}
                        className="text-[9px] font-mono px-2 py-0.5 rounded-full border transition-all capitalize"
                        style={
                          assetFilter === k
                            ? { borderColor: "#3b82f6", background: "rgba(59,130,246,0.15)", color: "#3b82f6" }
                            : { borderColor: "var(--border)", color: "hsl(var(--muted-foreground))" }
                        }
                      >
                        {k}
                      </button>
                    ))}
                  </div>
                </div>

                {/* MITRE filter */}
                <div>
                  <div className="text-[10px] font-mono uppercase text-muted-foreground mb-2">MITRE Technique</div>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {allMitreIds.map(m => (
                      <button
                        key={m}
                        onClick={() => setMitreFilter(mitreFilter === m ? "" : m)}
                        className="text-[9px] font-mono px-1.5 py-0.5 rounded border transition-all"
                        style={
                          mitreFilter === m
                            ? { borderColor: "#ef4444", background: "rgba(239,68,68,0.12)", color: "#ef4444" }
                            : { borderColor: "var(--border)", color: "hsl(var(--muted-foreground))" }
                        }
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Blast radius range */}
                <div>
                  <div className="text-[10px] font-mono uppercase text-muted-foreground mb-2">
                    Blast Radius: {blastMin}% – {blastMax}%
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-mono text-muted-foreground w-6">Min</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={blastMin}
                        onChange={e => setBlastMin(Math.min(Number(e.target.value), blastMax))}
                        className="flex-1 accent-blue-500 h-1"
                      />
                      <span className="text-[9px] font-mono w-7 text-right">{blastMin}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-mono text-muted-foreground w-6">Max</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={blastMax}
                        onChange={e => setBlastMax(Math.max(Number(e.target.value), blastMin))}
                        className="flex-1 accent-blue-500 h-1"
                      />
                      <span className="text-[9px] font-mono w-7 text-right">{blastMax}%</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Main layout ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-[1fr_360px] gap-4 h-[580px]">

        {/* ── Graph canvas ─────────────────────────────────────────── */}
        <div className="surface-card overflow-hidden relative" style={{ cursor: (dragging || draggedNodeId) ? "grabbing" : "grab" }}>
          {/* Zoom controls */}
          <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
            <button onClick={() => setZoom(z => Math.min(2, z + 0.15))} className="w-8 h-8 rounded-lg border border-border bg-card/80 backdrop-blur flex items-center justify-center hover:bg-secondary transition-colors">
              <ZoomIn className="w-4 h-4" />
            </button>
            <button onClick={() => setZoom(z => Math.max(0.4, z - 0.15))} className="w-8 h-8 rounded-lg border border-border bg-card/80 backdrop-blur flex items-center justify-center hover:bg-secondary transition-colors">
              <ZoomOut className="w-4 h-4" />
            </button>
            <button onClick={resetView} className="w-8 h-8 rounded-lg border border-border bg-card/80 backdrop-blur flex items-center justify-center hover:bg-secondary transition-colors">
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>

          {/* Legend */}
          <div className="absolute bottom-3 left-3 z-10 flex items-center gap-3 text-[10px] font-mono bg-card/80 backdrop-blur border border-border rounded-lg px-3 py-2">
            {(["critical", "high", "medium", "low"] as Severity[]).map(s => (
              <span key={s} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: SEV_COLOR[s] }} />
                {s}
              </span>
            ))}
          </div>

          {/* Results count overlay */}
          {hasActiveFilters && (
            <div className="absolute top-3 left-3 z-10 text-[10px] font-mono bg-card/80 backdrop-blur border border-border rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
              <Target className="w-3 h-3 text-blue-400" />
              <span className="text-muted-foreground">{filteredPaths.length} of {PATHS.length} paths match</span>
            </div>
          )}

          <svg
            ref={svgRef}
            width="100%" height="100%"
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onWheel={onWheel}
            style={{ userSelect: "none" }}
          >
            <defs>
              {(["critical", "high", "medium", "low"] as Severity[]).map(s => (
                <marker key={s} id={`arrow-${s}`} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L8,3 z" fill={SEV_COLOR[s]} opacity="0.8" />
                </marker>
              ))}
              <filter id="node-glow">
                <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <pattern
                id="dot-grid"
                width="24"
                height="24"
                patternUnits="userSpaceOnUse"
                patternTransform={`translate(${pan.x},${pan.y}) scale(${zoom})`}
              >
                <circle cx="3" cy="3" r="1.2" fill="currentColor" className="text-muted-foreground/20" />
              </pattern>
            </defs>

            {/* Dotted grid background */}
            <rect width="100%" height="100%" fill="url(#dot-grid)" pointerEvents="none" />

            <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
              {/* Edges */}
              {EDGES.map(edge => {
                const from = nodeMap[edge.from];
                const to   = nodeMap[edge.to];
                if (!from || !to) return null;
                const { x1, y1, x2, y2 } = getEdgePoints(from, to);
                const mid = midpoint(x1, y1, x2, y2);
                const isHighlighted = pathEdgeIds ? pathEdgeIds.has(edge.id) : true;
                const isHovered = hoveredEdge === edge.id;
                const col = SEV_COLOR[edge.severity];
                const opacity = highlightedIds ? (isHighlighted ? 0.9 : 0.12) : 0.5;

                return (
                  <g key={edge.id} onMouseEnter={() => setHoveredEdge(edge.id)} onMouseLeave={() => setHoveredEdge(null)}>
                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={14} style={{ cursor: "pointer" }} />
                    <line
                      x1={x1} y1={y1} x2={x2} y2={y2}
                      stroke={col}
                      strokeWidth={isHovered ? 2.5 : (isHighlighted && highlightedIds ? 2 : 1.2)}
                      strokeOpacity={isHovered ? 1 : opacity}
                      strokeDasharray={edge.severity === "low" ? "5 3" : undefined}
                      markerEnd={`url(#arrow-${edge.severity})`}
                      style={{ transition: "stroke-opacity 0.2s, stroke-width 0.2s" }}
                    />
                    {(isHovered || (isHighlighted && highlightedIds)) && edge.label && (
                      <text x={mid.x} y={mid.y - 6} textAnchor="middle" fill={col} fontSize={9} fontFamily="JetBrains Mono, monospace" opacity={0.9}>
                        {edge.label}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Nodes */}
              {nodes.map(node => {
                const isHighlighted = highlightedIds ? highlightedIds.has(node.id) : true;
                const isSelected    = selectedNode?.id === node.id;
                const col = node.severity ? SEV_COLOR[node.severity] : "#6b7280";
                const bg  = node.severity ? SEV_BG[node.severity]   : "rgba(107,114,128,0.12)";
                const R   = 34;

                return (
                  <g
                    key={node.id}
                    className="graph-node"
                    transform={`translate(${node.x},${node.y})`}
                    style={{
                      cursor: draggedNodeId === node.id ? "grabbing" : "grab",
                      opacity: isHighlighted ? 1 : 0.25,
                      transition: "opacity 0.25s",
                    }}
                    onMouseDown={(e) => onNodeMouseDown(e, node.id)}
                    onClick={(e) => {
                      if (nodeDragStart.current.hasMoved) {
                        e.preventDefault();
                        e.stopPropagation();
                        return;
                      }
                      setSelectedNode(n => n?.id === node.id ? null : node);
                    }}
                  >
                    {isHighlighted && node.severity && (
                      <circle r={R + 6} fill={col} opacity={0.12} filter="url(#node-glow)" />
                    )}
                    {isSelected && (
                      <circle r={R + 9} fill="none" stroke={col} strokeWidth={2} strokeDasharray="4 3" opacity={0.7}>
                        <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="6s" repeatCount="indefinite" />
                      </circle>
                    )}
                    <circle r={R} fill={bg} stroke={col} strokeWidth={isSelected ? 2.5 : 1.5} />
                    <foreignObject x={-10} y={-20} width={20} height={20}>
                      <div style={{ color: col, display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
                        <NodeIcon kind={node.kind} size={14} />
                      </div>
                    </foreignObject>
                    <text y={12} textAnchor="middle" fill="currentColor" fontSize={9} fontFamily="JetBrains Mono, monospace" opacity={0.85}>
                      {node.label.length > 14 ? node.label.slice(0, 13) + "…" : node.label}
                    </text>
                    {node.severity && (
                      <circle cx={R - 6} cy={-R + 6} r={5} fill={col} stroke="var(--background)" strokeWidth={1.5}>
                        {node.severity === "critical" && (
                          <animate attributeName="r" values="5;7;5" dur="1.5s" repeatCount="indefinite" />
                        )}
                      </circle>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
        </div>

        {/* ── Right panel ───────────────────────────────────────────── */}
        <div className="flex flex-col gap-0 overflow-hidden">
          {/* Tab bar */}
          <div className="flex items-center gap-0 mb-3 surface-card p-1 rounded-2xl relative">
            {([
              { key: "paths",       label: "Paths",       icon: Target },
              { key: "timeline",    label: "Timeline",    icon: CalendarDays },
              { key: "remediation", label: "Remediation", icon: Wrench },
            ] as const).map(tab => {
              const Icon = tab.icon;
              const isActive = rightTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setRightTab(tab.key)}
                  className="relative flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-[10px] font-mono uppercase tracking-wider transition-colors"
                  style={{
                    color: isActive
                      ? "hsl(var(--primary-foreground))"
                      : "hsl(var(--muted-foreground))",
                  }}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeTabBackground"
                      className="absolute inset-0 bg-primary rounded-xl"
                      style={{ zIndex: 0 }}
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                  <Icon className="w-3 h-3 z-10 relative" />
                  <span className="z-10 relative">{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto pr-0.5 space-y-3">

            {/* ── PATHS tab ──────────────────────────────────────── */}
            {rightTab === "paths" && (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <Filter className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Attack Paths</span>
                  <span className="text-xs font-mono text-muted-foreground ml-auto">{filteredPaths.length} shown</span>
                </div>

                {filteredPaths.length === 0 && (
                  <div className="surface-card p-6 text-center text-muted-foreground text-xs font-mono">
                    No paths match your filters.
                  </div>
                )}

                {filteredPaths.map(path => (
                  <button
                    key={path.id}
                    onClick={() => {
                      setSelectedPath(p => p?.id === path.id ? null : path);
                      setSelectedNode(null);
                    }}
                    className="surface-card p-3 text-left transition-all hover:scale-[1.01] w-full"
                    style={{
                      borderColor: selectedPath?.id === path.id ? SEV_COLOR[path.severity] : undefined,
                      borderWidth: selectedPath?.id === path.id ? 2 : undefined,
                    }}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded" style={{ background: SEV_BG[path.severity], color: SEV_COLOR[path.severity] }}>
                        {path.severity}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                          <BarChart3 className="w-2.5 h-2.5" />
                          {path.blast_radius}%
                        </span>
                        <span className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          {daysBetween(path.firstDetected, path.lastSeen)}d
                        </span>
                      </div>
                    </div>
                    <div className="font-semibold text-xs leading-tight mb-1">{path.title}</div>
                    <div className="flex items-center gap-1 flex-wrap mt-1.5">
                      {path.nodeIds.map((nid, i) => (
                        <span key={nid} className="flex items-center text-[9px] font-mono text-muted-foreground">
                          {i > 0 && <ChevronRight className="w-2.5 h-2.5 mx-0.5" />}
                          {nodeMap[nid]?.label.split(" ")[0]}
                        </span>
                      ))}
                    </div>
                  </button>
                ))}

                {/* Selected path detail */}
                <AnimatePresence>
                  {selectedPath && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      className="surface-card p-4 mt-1"
                      style={{ borderColor: SEV_COLOR[selectedPath.severity], borderWidth: 1.5 }}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="font-semibold text-sm">{selectedPath.title}</div>
                        <button onClick={() => setSelectedPath(null)} className="text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
                      </div>
                      <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{selectedPath.description}</p>
                      <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1">MITRE ATT&amp;CK</div>
                      <div className="flex flex-wrap gap-1 mb-3">
                        {selectedPath.mitre.map(t => (
                          <a key={t} href={`https://attack.mitre.org/techniques/${t.replace(".", "/")}`} target="_blank" rel="noreferrer"
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded border hover:opacity-80 flex items-center gap-1"
                            style={{ borderColor: SEV_COLOR[selectedPath.severity], color: SEV_COLOR[selectedPath.severity], background: SEV_BG[selectedPath.severity] }}>
                            {t} <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        ))}
                      </div>
                      <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1">Blast radius</div>
                      <div className="h-2 rounded-full bg-secondary overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${selectedPath.blast_radius}%`, background: SEV_COLOR[selectedPath.severity] }} />
                      </div>
                      <div className="text-[10px] font-mono text-right mt-0.5" style={{ color: SEV_COLOR[selectedPath.severity] }}>{selectedPath.blast_radius}%</div>

                      {/* Quick-jump buttons */}
                      <div className="flex gap-2 mt-3 pt-3 border-t border-border">
                        <button
                          onClick={() => setRightTab("timeline")}
                          className="flex-1 flex items-center justify-center gap-1 text-[10px] font-mono py-1.5 rounded-lg border border-border hover:bg-secondary transition-colors"
                        >
                          <CalendarDays className="w-3 h-3" /> Timeline
                        </button>
                        <button
                          onClick={() => setRightTab("remediation")}
                          className="flex-1 flex items-center justify-center gap-1 text-[10px] font-mono py-1.5 rounded-lg border border-border hover:bg-secondary transition-colors"
                        >
                          <Wrench className="w-3 h-3" /> Remediate
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Selected node detail */}
                <AnimatePresence>
                  {selectedNode && (
                    <NodeDrilldown node={selectedNode} onClose={() => setSelectedNode(null)} />
                  )}
                </AnimatePresence>
              </>
            )}

            {/* ── TIMELINE tab ───────────────────────────────────── */}
            {rightTab === "timeline" && (
              <>
                {!selectedPath ? (
                  <div className="surface-card p-6 text-center space-y-2">
                    <CalendarDays className="w-8 h-8 text-muted-foreground mx-auto" />
                    <div className="text-xs text-muted-foreground font-mono">Select an attack path to view its history</div>
                    <button
                      onClick={() => setRightTab("paths")}
                      className="text-[10px] font-mono text-blue-400 hover:underline"
                    >
                      Go to Paths →
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Path selector header */}
                    <div className="surface-card p-3 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-[9px] font-mono uppercase text-muted-foreground">Selected path</div>
                        <div className="text-xs font-semibold truncate max-w-[240px]">{selectedPath.title}</div>
                      </div>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: SEV_BG[selectedPath.severity], color: SEV_COLOR[selectedPath.severity] }}>
                        {selectedPath.severity}
                      </span>
                    </div>

                    <TimelinePanel path={selectedPath} />
                  </>
                )}
              </>
            )}

            {/* ── REMEDIATION tab ─────────────────────────────────── */}
            {rightTab === "remediation" && (
              <>
                {!selectedPath ? (
                  <div className="surface-card p-6 text-center space-y-2">
                    <Wrench className="w-8 h-8 text-muted-foreground mx-auto" />
                    <div className="text-xs text-muted-foreground font-mono">Select an attack path to view remediation steps</div>
                    <button
                      onClick={() => setRightTab("paths")}
                      className="text-[10px] font-mono text-blue-400 hover:underline"
                    >
                      Go to Paths →
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Path selector header */}
                    <div className="surface-card p-3 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-[9px] font-mono uppercase text-muted-foreground">Selected path</div>
                        <div className="text-xs font-semibold truncate max-w-[240px]">{selectedPath.title}</div>
                      </div>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: SEV_BG[selectedPath.severity], color: SEV_COLOR[selectedPath.severity] }}>
                        {selectedPath.severity}
                      </span>
                    </div>

                    <RemediationPanel path={selectedPath} />
                  </>
                )}
              </>
            )}

          </div>
        </div>
      </div>
    </AppShell>
  );
}
