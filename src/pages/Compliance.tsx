import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/cspm/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  CheckCircle2, AlertTriangle, XCircle, FileBadge2, Search,
  Download, Copy, Filter, Info, ShieldCheck, TrendingUp,
  ClipboardList, BarChart3, ChevronRight, Zap, BookOpen,
  CheckSquare, Square, RefreshCw,
} from "lucide-react";
import {
  CONTROLS, FRAMEWORK_META, type Framework,
  scoreFramework, type FindingLite, type ControlDef,
} from "@/lib/compliance";
import { SeverityBadge, type Severity } from "@/components/cspm/SeverityBadge";
import { toast } from "sonner";
import { format } from "date-fns";

// ── Types ──────────────────────────────────────────────────────────────────────

type ControlStatus = "pass" | "warn" | "fail";
type StatusFilter = "all" | ControlStatus;

// ── Constants ──────────────────────────────────────────────────────────────────

const FRAMEWORKS: Framework[] = ["SOC2", "ISO27001", "GDPR", "HIPAA"];

const STATUS_META: Record<ControlStatus, { label: string; color: string; bg: string; border: string }> = {
  pass: { label: "Passing",  color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/30", border: "border-emerald-300/50 dark:border-emerald-700/40" },
  warn: { label: "Warning",  color: "text-yellow-600 dark:text-yellow-400",   bg: "bg-yellow-50 dark:bg-yellow-950/30",   border: "border-yellow-300/50 dark:border-yellow-700/40" },
  fail: { label: "Failing",  color: "text-red-600 dark:text-red-400",         bg: "bg-red-50 dark:bg-red-950/30",         border: "border-red-300/50 dark:border-red-700/40" },
};

// Remediation guidance per control ID (analyst tips)
const REMEDIATION: Record<string, string> = {
  "CC6.1":              "Enable MFA on all IAM users/roles. Close port 22/3389 to the internet. Rotate or remove hardcoded secrets from code.",
  "CC6.3":              "Audit IAM policies for overly permissive roles. Implement just-in-time access. Remove stale or unused access keys older than 90 days.",
  "CC6.6":              "Enforce HTTPS/TLS on all public endpoints. Use WAF to block SQL injection. Disable insecure S3 bucket ACLs.",
  "CC7.1":              "Enable Dependabot or Renovate for dependency scanning. Integrate Trivy into CI/CD pipeline. Prioritize CVEs by CVSS score.",
  "A.9.4.3":            "Use a secrets manager (AWS Secrets Manager, HashiCorp Vault). Pre-commit hooks to detect secrets before push. Rotate all exposed credentials immediately.",
  "A.12.6.1":           "Automate vulnerability scanning on every pull request. Track CVEs in a risk register. Apply vendor patches within SLA (e.g. 30 days for high, 7 days for critical).",
  "A.13.1.1":           "Apply least-privilege network security groups. Implement Kubernetes NetworkPolicies. Review open ports quarterly.",
  "A.18.1.4":           "Classify PII data flows. Apply data masking before sending to LLMs. Review AI vendor DPA agreements.",
  "Art.5":              "Enforce minimum data collection. Review public storage bucket ACLs. Redact PII before logging.",
  "Art.28":             "Ensure Data Processing Agreements are signed with all sub-processors including LLM providers. Document data transfers.",
  "Art.32":             "Enable server-side encryption on all storage. Enforce TLS 1.2+. Pseudonymise personal data at rest.",
  "164.308":            "Conduct annual workforce security training. Implement role-based access control. Enable audit logging for ePHI access.",
  "164.312(a)(2)(iv)":  "Encrypt ePHI at rest with AES-256. Use TLS 1.2+ for ePHI in transit. Manage encryption keys in a KMS.",
  "164.502":            "Enforce minimum-necessary principle. AI systems handling PHI must have data use agreements. Log all PHI disclosures.",
};

// Score → risk tier
function riskTier(score: number) {
  if (score >= 80) return { label: "Low Risk",      color: "text-emerald-600", bar: "bg-emerald-500" };
  if (score >= 60) return { label: "Moderate Risk", color: "text-yellow-600",  bar: "bg-yellow-500" };
  if (score >= 40) return { label: "High Risk",     color: "text-orange-500",  bar: "bg-orange-500" };
  return                  { label: "Critical Risk", color: "text-red-600",     bar: "bg-red-500" };
}

const StatusIcon = ({ s }: { s: ControlStatus }) =>
  s === "pass" ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> :
  s === "warn" ? <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0" /> :
                 <XCircle className="w-4 h-4 text-red-500 shrink-0" />;

// ── Component ─────────────────────────────────────────────────────────────────

const Compliance = () => {
  const [findings, setFindings] = useState<FindingLite[]>([]);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState<Framework>("SOC2");
  const [mainTab, setMainTab]   = useState("overview");
  const [search, setSearch]     = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  // Evidence notes stored locally per control
  const [notes, setNotes] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem("cspm_compliance_notes") ?? "{}"); }
    catch { return {}; }
  });
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");

  // ── Load ─────────────────────────────────────────────────────────────────────

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("findings").select("rule_id, compliance, severity");
    if (error) toast.error(error.message);
    setFindings((data ?? []) as FindingLite[]);
    setLoading(false);
  };

  useEffect(() => { document.title = "Compliance — SentinelCSPM"; load(); }, []);

  // ── Derived ──────────────────────────────────────────────────────────────────

  const summary = useMemo(() => Object.fromEntries(
    FRAMEWORKS.map(f => [f, scoreFramework(f, findings)])
  ) as Record<Framework, ReturnType<typeof scoreFramework>>, [findings]);

  const activeFrameworkData = summary[tab];

  const filteredEvals = useMemo(() => {
    let list = activeFrameworkData.evals;
    if (statusFilter !== "all") list = list.filter(e => e.status === statusFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(e =>
        e.control.id.toLowerCase().includes(q) ||
        e.control.title.toLowerCase().includes(q) ||
        e.control.description.toLowerCase().includes(q)
      );
    }
    // Sort: fail first, then warn, then pass
    const order: Record<ControlStatus, number> = { fail: 0, warn: 1, pass: 2 };
    return [...list].sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3));
  }, [activeFrameworkData.evals, statusFilter, search]);

  // Gap analysis — failing + warning controls across all frameworks
  const gapAnalysis = useMemo(() => {
    const gaps: Array<{ control: ControlDef; status: ControlStatus; hitCount: number; framework: Framework }> = [];
    FRAMEWORKS.forEach(f => {
      summary[f].evals.forEach(e => {
        if (e.status !== "pass") {
          gaps.push({ control: e.control, status: e.status, hitCount: e.hits.length, framework: f });
        }
      });
    });
    return gaps.sort((a, b) => {
      const order: Record<ControlStatus, number> = { fail: 0, warn: 1, pass: 2 };
      return (order[a.status] ?? 3) - (order[b.status] ?? 3);
    });
  }, [summary]);

  const overallScore = useMemo(() => {
    const scores = FRAMEWORKS.map(f => summary[f].score);
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }, [summary]);

  // ── Evidence notes ────────────────────────────────────────────────────────────

  const saveNote = (controlId: string) => {
    const updated = { ...notes, [controlId]: noteText };
    setNotes(updated);
    localStorage.setItem("cspm_compliance_notes", JSON.stringify(updated));
    setEditingNote(null);
    toast.success("Evidence note saved locally.");
  };

  // ── Export ────────────────────────────────────────────────────────────────────

  const exportCSV = () => {
    const rows = [["Framework", "Control ID", "Title", "Status", "Findings", "Evidence Note"]];
    FRAMEWORKS.forEach(f => {
      summary[f].evals.forEach(e => {
        rows.push([
          FRAMEWORK_META[f].label,
          e.control.id,
          e.control.title,
          e.status,
          e.hits.map(h => h.rule_id).join("; "),
          (notes[e.control.id] ?? "").replace(/,/g, ";"),
        ]);
      });
    });
    const csv = rows.map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `compliance-report-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success("Compliance report exported as CSV.");
  };

  const exportJSON = () => {
    const payload = {
      generated: new Date().toISOString(),
      overallScore,
      frameworks: Object.fromEntries(
        FRAMEWORKS.map(f => [f, {
          score: summary[f].score,
          passing: summary[f].passing,
          total: summary[f].total,
          controls: summary[f].evals.map(e => ({
            id: e.control.id,
            title: e.control.title,
            status: e.status,
            hitCount: e.hits.length,
            evidenceNote: notes[e.control.id] ?? null,
          })),
        }])
      ),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `compliance-report-${format(new Date(), "yyyy-MM-dd")}.json`;
    a.click(); URL.revokeObjectURL(url);
    toast.success("Compliance data exported as JSON.");
  };

  const copyExecutiveSummary = () => {
    const lines = [
      `SentinelCSPM Compliance Summary — ${format(new Date(), "MMMM d, yyyy")}`,
      `Overall Score: ${overallScore}/100`,
      "",
      ...FRAMEWORKS.map(f => {
        const s = summary[f];
        const tier = riskTier(s.score);
        return `${FRAMEWORK_META[f].label}: ${s.score}/100 (${tier.label}) — ${s.passing}/${s.total} controls passing`;
      }),
      "",
      `Open Gaps: ${gapAnalysis.length} controls need attention`,
      `Critical gaps: ${gapAnalysis.filter(g => g.status === "fail").length}`,
    ];
    navigator.clipboard.writeText(lines.join("\n"));
    toast.success("Executive summary copied to clipboard.");
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <AppShell>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Compliance Center</h1>
          <p className="text-muted-foreground mt-1">
            Auto-mapped controls across SOC 2, ISO 27001, GDPR and HIPAA — with gap analysis, evidence tracking and export.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={copyExecutiveSummary}>
            <Copy className="w-3.5 h-3.5 mr-1.5" />Copy Summary
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="w-3.5 h-3.5 mr-1.5" />Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportJSON}>
            <Download className="w-3.5 h-3.5 mr-1.5" />Export JSON
          </Button>
        </div>
      </div>

      {/* Overall posture */}
      <div className="surface-card p-5 mb-6 flex items-center gap-6 flex-wrap">
        <div className="text-center shrink-0">
          <div className={`text-5xl font-bold tabular-nums ${riskTier(overallScore).color}`}>{overallScore}</div>
          <div className="text-xs font-mono uppercase text-muted-foreground mt-1">Overall / 100</div>
          <Badge variant="outline" className={`mt-1.5 text-[10px] ${riskTier(overallScore).color}`}>
            {riskTier(overallScore).label}
          </Badge>
        </div>
        <div className="flex-1 min-w-[200px] space-y-3">
          {FRAMEWORKS.map(f => {
            const s = summary[f]; const tier = riskTier(s.score);
            return (
              <div key={f} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">{FRAMEWORK_META[f].label}</span>
                  <span className={`font-mono ${tier.color}`}>{s.score}/100 · {s.passing}/{s.total} controls</span>
                </div>
                <Progress value={s.score} className="h-1.5" />
              </div>
            );
          })}
        </div>
        <div className="shrink-0 text-right">
          <div className="text-xs text-muted-foreground mb-1">Open Gaps</div>
          <div className="text-3xl font-bold text-red-500">{gapAnalysis.length}</div>
          <div className="text-[10px] font-mono text-muted-foreground">controls failing or at risk</div>
        </div>
      </div>

      {/* Framework score cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {FRAMEWORKS.map(f => {
          const s = summary[f]; const tier = riskTier(s.score);
          const failing = s.evals.filter(e => e.status === "fail").length;
          const warning = s.evals.filter(e => e.status === "warn").length;
          return (
            <button key={f} onClick={() => { setTab(f); setMainTab("controls"); }}
              className={`surface-card p-4 text-left transition-colors hover:border-primary/40 ${tab === f && mainTab === "controls" ? "border-primary/60" : ""}`}>
              <div className="flex items-center gap-2 mb-2">
                <FileBadge2 className="w-4 h-4 text-primary shrink-0" />
                <div className="text-xs font-mono uppercase text-muted-foreground truncate">{FRAMEWORK_META[f].label}</div>
              </div>
              <div className={`text-3xl font-bold ${tier.color}`}>{s.score}<span className="text-base text-muted-foreground font-normal">/100</span></div>
              <div className="mt-2 h-1.5 rounded-full bg-secondary overflow-hidden">
                <div className={`h-full transition-all ${tier.bar}`} style={{ width: `${s.score}%` }} />
              </div>
              <div className="flex items-center gap-2 mt-2 text-[10px] font-mono text-muted-foreground">
                {failing > 0 && <span className="text-red-500">✕ {failing} fail</span>}
                {warning > 0 && <span className="text-yellow-600">⚠ {warning} warn</span>}
                <span className="text-emerald-600">✓ {s.passing} pass</span>
              </div>
            </button>
          );
        })}
      </section>

      {/* Main tabs */}
      <Tabs value={mainTab} onValueChange={setMainTab}>
        <TabsList className="grid grid-cols-3 w-full max-w-lg mb-6">
          <TabsTrigger value="overview" className="flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5" />Overview
          </TabsTrigger>
          <TabsTrigger value="controls" className="flex items-center gap-1.5">
            <ClipboardList className="w-3.5 h-3.5" />Controls
          </TabsTrigger>
          <TabsTrigger value="gaps" className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5" />
            Gap Analysis
            {gapAnalysis.length > 0 && (
              <Badge className="h-4 px-1 text-[9px] bg-red-500 text-white border-0 ml-0.5">{gapAnalysis.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Overview Tab ──────────────────────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-6">

          {/* Framework ring gauges */}
          <div className="surface-card p-5">
            <div className="text-xs font-mono uppercase text-muted-foreground tracking-wider mb-5 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" />Framework Posture
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              {FRAMEWORKS.map(f => {
                const s   = summary[f];
                const tier = riskTier(s.score);
                const r    = 36; const circ = 2 * Math.PI * r; const dash = (s.score / 100) * circ;
                const failing = s.evals.filter(e => e.status === "fail").length;
                const warning = s.evals.filter(e => e.status === "warn").length;
                return (
                  <button key={f} onClick={() => { setTab(f); setMainTab("controls"); }}
                    className="flex flex-col items-center gap-3 group hover:opacity-90 transition-opacity">
                    {/* Ring */}
                    <div className="relative">
                      <svg width={88} height={88} className="-rotate-90">
                        <circle cx={44} cy={44} r={r} fill="none" strokeWidth={6}
                          stroke="currentColor" className="text-secondary" />
                        <circle cx={44} cy={44} r={r} fill="none" strokeWidth={6}
                          stroke={tier.bar.replace("bg-", "").includes("emerald") ? "#10b981" :
                                  tier.bar.includes("yellow") ? "#f59e0b" :
                                  tier.bar.includes("orange") ? "#f97316" : "#ef4444"}
                          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
                          style={{ transition: "stroke-dasharray 0.7s ease" }} />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className={`text-lg font-bold tabular-nums ${tier.color}`}>{s.score}</span>
                        <span className="text-[9px] text-muted-foreground font-mono">/100</span>
                      </div>
                    </div>
                    {/* Label */}
                    <div className="text-center">
                      <div className="font-semibold text-sm">{FRAMEWORK_META[f].label}</div>
                      <div className={`text-[10px] font-mono mt-0.5 ${tier.color}`}>{tier.label}</div>
                    </div>
                    {/* Mini pill row */}
                    <div className="flex items-center gap-1.5 text-[9px] font-mono">
                      {failing > 0 && <span className="px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-950/30 text-red-600 border border-red-200/50">✕ {failing}</span>}
                      {warning > 0 && <span className="px-1.5 py-0.5 rounded-full bg-yellow-100 dark:bg-yellow-950/30 text-yellow-700 border border-yellow-200/50">⚠ {warning}</span>}
                      <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 border border-emerald-200/50">✓ {s.passing}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Control status matrix */}
          <div className="surface-card p-5">
            <div className="text-xs font-mono uppercase text-muted-foreground tracking-wider mb-4 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" />Control Status Matrix
            </div>
            <div className="space-y-4">
              {FRAMEWORKS.map(f => {
                const s = summary[f];
                return (
                  <div key={f}>
                    <div className="flex items-center gap-2 mb-2">
                      <FileBadge2 className="w-3.5 h-3.5 text-primary" />
                      <span className="text-xs font-semibold">{FRAMEWORK_META[f].label}</span>
                      <div className="flex-1 h-px bg-border" />
                      <span className="text-[10px] font-mono text-muted-foreground">{s.passing}/{s.total} passing</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {s.evals.map(e => {
                        const meta = STATUS_META[e.status];
                        return (
                          <button
                            key={e.control.id}
                            onClick={() => { setTab(f); setMainTab("controls"); }}
                            title={`${e.control.title}\n${e.hits.length} finding${e.hits.length !== 1 ? "s" : ""}`}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-left transition-all hover:-translate-y-0.5 hover:shadow-sm ${meta.bg} ${meta.border}`}
                          >
                            {e.status === "pass"
                              ? <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                              : e.status === "warn"
                              ? <AlertTriangle className="w-3 h-3 text-yellow-500 shrink-0" />
                              : <XCircle className="w-3 h-3 text-red-500 shrink-0" />}
                            <span className={`text-[10px] font-mono font-bold ${meta.color}`}>{e.control.id}</span>
                            <span className="text-[9px] text-muted-foreground hidden sm:inline max-w-[100px] truncate">{e.control.title.split(" ").slice(0, 2).join(" ")}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-5 pt-4 border-t border-border text-[10px] font-mono text-muted-foreground">
              <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3 text-emerald-500" />Passing — no findings violate this control</span>
              <span className="flex items-center gap-1.5"><AlertTriangle className="w-3 h-3 text-yellow-500" />Warning — low-severity findings</span>
              <span className="flex items-center gap-1.5"><XCircle className="w-3 h-3 text-red-500" />Failing — high-impact findings</span>
            </div>
          </div>

          {/* Executive summary */}
          <div className="surface-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="text-xs font-mono uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5" />Executive Summary
              </div>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={copyExecutiveSummary}>
                <Copy className="w-3 h-3 mr-1.5" />Copy
              </Button>
            </div>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground leading-relaxed">
                As of <strong>{format(new Date(), "MMMM d, yyyy")}</strong>, the overall compliance posture score is{" "}
                <strong className={riskTier(overallScore).color}>{overallScore}/100</strong> ({riskTier(overallScore).label}).
                There are <strong className="text-red-500">{gapAnalysis.filter(g => g.status === "fail").length} critical gaps</strong> and{" "}
                <strong className="text-yellow-600">{gapAnalysis.filter(g => g.status === "warn").length} warnings</strong> requiring attention.
              </p>
              {FRAMEWORKS.map(f => {
                const s = summary[f]; const tier = riskTier(s.score);
                return (
                  <div key={f} className="flex items-center gap-3 text-sm">
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span><strong>{FRAMEWORK_META[f].label}</strong>: {s.score}/100 —{" "}
                      <span className={tier.color}>{tier.label}</span> ({s.passing}/{s.total} controls passing)
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </TabsContent>

        {/* ── Controls Tab ─────────────────────────────────────────────────── */}
        <TabsContent value="controls">
          {/* Framework sub-tabs */}
          <div className="flex gap-2 mb-4 flex-wrap">
            {FRAMEWORKS.map(f => (
              <button key={f} onClick={() => setTab(f)}
                className={`px-3 py-1.5 text-xs rounded-md border font-mono transition-colors ${tab === f ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:text-foreground"}`}>
                {FRAMEWORK_META[f].label}
                <span className={`ml-1.5 ${riskTier(summary[f].score).color}`}>{summary[f].score}</span>
              </button>
            ))}
          </div>

          <p className="text-sm text-muted-foreground mb-4">{FRAMEWORK_META[tab].blurb}</p>

          {/* Search + status filter */}
          <div className="flex gap-2 mb-4 flex-wrap items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-8 h-8 text-sm" placeholder="Search controls…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            {(["all", "fail", "warn", "pass"] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`h-8 px-3 text-xs rounded-md border font-mono uppercase tracking-wider transition-colors ${statusFilter === s ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:text-foreground"}`}>
                {s === "all" ? "All" : s === "fail" ? "✕ Failing" : s === "warn" ? "⚠ Warning" : "✓ Passing"}
              </button>
            ))}
            <span className="text-xs text-muted-foreground font-mono ml-auto">
              {filteredEvals.length} / {activeFrameworkData.total} controls
            </span>
          </div>

          {/* Control accordion */}
          <Accordion type="multiple" className="space-y-2">
            {filteredEvals.map(({ control, hits, status }) => {
              const meta = STATUS_META[status];
              const remediation = REMEDIATION[control.id];
              const note = notes[control.id] ?? "";
              const isEditingThis = editingNote === control.id;
              return (
                <AccordionItem key={control.id} value={control.id}
                  className={`surface-card border rounded-lg overflow-hidden ${status === "fail" ? "border-red-300/50 dark:border-red-800/40" : status === "warn" ? "border-yellow-300/50 dark:border-yellow-800/40" : "border-border"}`}>
                  <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-secondary/30">
                    <div className="flex items-center gap-3 text-left flex-1 min-w-0">
                      <StatusIcon s={status} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <code className="font-mono text-xs text-primary bg-primary/10 px-1.5 py-0.5 rounded shrink-0">{control.id}</code>
                          <span className="font-medium">{control.title}</span>
                          {note && <span title="Has evidence note" className="text-[10px] text-primary">📎</span>}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 truncate">{control.description}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <Badge variant="outline" className={`text-[10px] ${meta.color} ${meta.bg} ${meta.border}`}>
                          {meta.label}
                        </Badge>
                        <span className="text-xs font-mono text-muted-foreground tabular-nums">
                          {hits.length} {hits.length === 1 ? "hit" : "hits"}
                        </span>
                      </div>
                    </div>
                  </AccordionTrigger>

                  <AccordionContent className="px-4 pb-5 space-y-4 bg-secondary/20">
                    {/* Findings */}
                    <div>
                      <div className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider mb-2">Findings</div>
                      {hits.length === 0 ? (
                        <div className="flex items-center gap-2 text-sm text-emerald-600">
                          <CheckCircle2 className="w-4 h-4" />No findings violate this control.
                        </div>
                      ) : (
                        <ul className="space-y-1.5">
                          {hits.map((h, i) => (
                            <li key={i} className="flex items-center gap-2 text-sm">
                              <SeverityBadge severity={h.severity as Severity} />
                              <code className="font-mono text-xs text-foreground/80 bg-secondary px-1.5 py-0.5 rounded">{h.rule_id}</code>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* Remediation guidance */}
                    {remediation && (
                      <div className={`rounded-lg p-3 border ${status === "fail" ? "bg-red-50 dark:bg-red-950/20 border-red-200/50 dark:border-red-800/30" : status === "warn" ? "bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200/50 dark:border-yellow-800/30" : "bg-secondary/50 border-border"}`}>
                        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
                          <Zap className="w-3 h-3" />Remediation Guidance
                        </div>
                        <p className="text-sm leading-relaxed">{remediation}</p>
                      </div>
                    )}

                    {/* Evidence note */}
                    <div>
                      <div className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider mb-1.5 flex items-center gap-1.5">
                        <ClipboardList className="w-3 h-3" />Evidence / Analyst Notes
                      </div>
                      {isEditingThis ? (
                        <div className="space-y-2">
                          <textarea
                            autoFocus
                            value={noteText}
                            onChange={e => setNoteText(e.target.value)}
                            rows={3}
                            className="w-full text-sm bg-background border border-border rounded-md p-2 outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/10 resize-none font-mono transition-colors duration-150"
                            placeholder="Document evidence, compensating controls, or remediation status…"
                          />
                          <div className="flex gap-2">
                            <Button size="sm" className="h-7 text-xs" onClick={() => saveNote(control.id)}>Save Note</Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingNote(null)}>Cancel</Button>
                          </div>
                        </div>
                      ) : (
                        <div
                          onClick={() => { setEditingNote(control.id); setNoteText(note); }}
                          className="min-h-[44px] p-2.5 rounded-md border border-dashed border-border text-sm text-muted-foreground cursor-pointer hover:border-primary/50 hover:bg-secondary/40 transition-colors"
                        >
                          {note || <span className="italic text-muted-foreground/60">Click to add evidence note…</span>}
                        </div>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </TabsContent>

        {/* ── Gap Analysis Tab ──────────────────────────────────────────────── */}
        <TabsContent value="gaps" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {gapAnalysis.filter(g => g.status === "fail").length} critical gaps and{" "}
              {gapAnalysis.filter(g => g.status === "warn").length} warnings across all frameworks.
            </p>
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <Download className="w-3.5 h-3.5 mr-1.5" />Export All Gaps
            </Button>
          </div>

          {gapAnalysis.length === 0 ? (
            <div className="surface-card p-12 text-center">
              <ShieldCheck className="w-12 h-12 mx-auto text-emerald-500 mb-3" />
              <h2 className="text-lg font-semibold text-emerald-600">All controls passing!</h2>
              <p className="text-sm text-muted-foreground mt-1">No gaps detected across any compliance framework. Great posture.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {gapAnalysis.map(({ control, status, hitCount, framework }) => {
                const meta = STATUS_META[status];
                const remediation = REMEDIATION[control.id];
                return (
                  <div key={`${framework}-${control.id}`} className={`surface-card p-4 border-l-4 ${status === "fail" ? "border-l-red-500" : "border-l-yellow-500"}`}>
                    <div className="flex items-start gap-3">
                      <StatusIcon s={status} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <Badge variant="outline" className="text-[10px] font-mono">{FRAMEWORK_META[framework].label}</Badge>
                          <code className="font-mono text-xs text-primary bg-primary/10 px-1.5 py-0.5 rounded">{control.id}</code>
                          <Badge variant="outline" className={`text-[10px] ${meta.color} ${meta.bg} ${meta.border}`}>{meta.label}</Badge>
                          <span className="text-xs text-muted-foreground font-mono">{hitCount} {hitCount === 1 ? "finding" : "findings"}</span>
                        </div>
                        <div className="font-medium text-sm">{control.title}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{control.description}</div>
                        {remediation && (
                          <div className="mt-2.5 text-xs text-muted-foreground leading-relaxed bg-secondary/40 rounded-md p-2.5 border border-border/60">
                            <span className="font-medium text-foreground">Fix: </span>{remediation}
                          </div>
                        )}
                      </div>
                      <Button size="sm" variant="ghost" className="h-7 text-xs shrink-0"
                        onClick={() => { setTab(framework); setMainTab("controls"); }}>
                        View <ChevronRight className="w-3 h-3 ml-0.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </AppShell>
  );
};

export default Compliance;
