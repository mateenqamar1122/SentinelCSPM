import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/cspm/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Printer, RefreshCw, TrendingDown, TrendingUp, Minus, AlertTriangle, ShieldCheck, ListChecks, Building2, Radar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { scoreFramework, type FindingLite } from "@/lib/compliance";
import { toast } from "sonner";
import { format, subDays } from "date-fns";
import type { Database } from "@/integrations/supabase/types";

type Finding = Database["public"]["Tables"]["findings"]["Row"];
type Vendor = Database["public"]["Tables"]["vendors"]["Row"];
type Checklist = Database["public"]["Tables"]["checklist_items"]["Row"];
type Threat = Database["public"]["Tables"]["threat_intel_alerts"]["Row"];

const calcScore = (counts: { critical: number; high: number; medium: number; low: number }) =>
  Math.max(0, 100 - counts.critical * 8 - counts.high * 4 - counts.medium * 1.5 - counts.low * 0.4);

const tally = (list: Finding[]) => ({
  critical: list.filter((f) => f.severity === "critical").length,
  high: list.filter((f) => f.severity === "high").length,
  medium: list.filter((f) => f.severity === "medium").length,
  low: list.filter((f) => f.severity === "low").length,
});

const Digest = () => {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [checklist, setChecklist] = useState<Checklist[]>([]);
  const [threats, setThreats] = useState<Threat[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [f, v, c, t] = await Promise.all([
      supabase.from("findings").select("*"),
      supabase.from("vendors").select("*"),
      supabase.from("checklist_items").select("*"),
      supabase.from("threat_intel_alerts").select("*").order("published_at", { ascending: false }).limit(50),
    ]);
    setFindings(f.data ?? []);
    setVendors(v.data ?? []);
    setChecklist(c.data ?? []);
    setThreats(t.data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    document.title = "Weekly Security Digest — SentinelCSPM";
  }, []);

  const sevenDaysAgo = useMemo(() => subDays(new Date(), 7), []);
  const fourteenDaysAgo = useMemo(() => subDays(new Date(), 14), []);

  const data = useMemo(() => {
    const allCounts = tally(findings);
    const currentScore = calcScore(allCounts);

    // Findings created in last 7 days
    const newThisWeek = findings.filter((f) => new Date(f.created_at) >= sevenDaysAgo);
    // Findings present 7 days ago (everything created before that)
    const lastWeekFindings = findings.filter((f) => new Date(f.created_at) < sevenDaysAgo);
    const lastWeekScore = calcScore(tally(lastWeekFindings));

    const scoreDelta = Math.round(currentScore - lastWeekScore);

    const newCritical = newThisWeek.filter((f) => f.severity === "critical");
    const newHigh = newThisWeek.filter((f) => f.severity === "high");

    // KEV in last 14 days = noteworthy
    const recentKev = threats.filter(
      (t) => t.kev_listed && t.published_at && new Date(t.published_at) >= fourteenDaysAgo,
    );

    // Checklist progress
    const checklistDone = checklist.filter((c) => c.done).length;
    const checklistTotal = checklist.length;
    const checklistPct = checklistTotal ? Math.round((checklistDone / checklistTotal) * 100) : 0;
    const checklistDoneLastWeek = checklist.filter(
      (c) => c.done && new Date(c.updated_at) < sevenDaysAgo,
    ).length;
    const checklistPctLastWeek = checklistTotal
      ? Math.round((checklistDoneLastWeek / checklistTotal) * 100)
      : 0;
    const checklistDelta = checklistPct - checklistPctLastWeek;

    // Vendors at risk = critical/high criticality without SOC2
    const vendorsAtRisk = vendors.filter(
      (v) =>
        (v.criticality === "critical" || v.criticality === "high") &&
        v.soc2_status !== "active" &&
        v.soc2_status !== "type_2",
    );

    // SOC2 score
    const lite: FindingLite[] = findings.map((f) => ({
      rule_id: f.rule_id,
      compliance: f.compliance,
      severity: f.severity,
    }));
    const soc2 = scoreFramework("SOC2", lite);

    // Top 3 actions: highest severity new findings + open checklist criticals
    const topFindings = [...newCritical, ...newHigh].slice(0, 3).map((f) => ({
      title: f.title,
      mitigation: f.mitigation,
      resource: f.resource,
    }));
    const topChecklist = checklist
      .filter((c) => !c.done && c.priority === "high")
      .slice(0, 3 - topFindings.length)
      .map((c) => ({ title: c.title, mitigation: c.description ?? "Complete this checklist item.", resource: c.category }));
    const topActions = [...topFindings, ...topChecklist].slice(0, 3);

    return {
      currentScore: Math.round(currentScore),
      scoreDelta,
      newCritical,
      newHigh,
      newThisWeek,
      recentKev,
      checklistDone,
      checklistTotal,
      checklistPct,
      checklistDelta,
      vendorsAtRisk,
      soc2,
      topActions,
    };
  }, [findings, vendors, checklist, threats, sevenDaysAgo, fourteenDaysAgo]);

  const weekRange = `${format(sevenDaysAgo, "MMM d")} – ${format(new Date(), "MMM d, yyyy")}`;

  const trendIcon = (delta: number) =>
    delta > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : delta < 0 ? <TrendingDown className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />;
  // For posture: positive delta = good (primary). For findings count: positive = bad (destructive).
  const trendColor = (delta: number, higherIsBetter = true) => {
    if (delta === 0) return "text-muted-foreground";
    const good = higherIsBetter ? delta > 0 : delta < 0;
    return good ? "text-primary" : "text-destructive";
  };

  const copyMarkdown = async () => {
    const md = `# Weekly Security Digest
**${weekRange}**

## Posture
- Score: **${data.currentScore}/100** (${data.scoreDelta >= 0 ? "+" : ""}${data.scoreDelta} vs last week)
- SOC 2: ${data.soc2.score}/100 (${data.soc2.passing}/${data.soc2.total} controls passing)

## What's new this week
- ${data.newCritical.length} new critical findings
- ${data.newHigh.length} new high findings
- ${data.recentKev.length} KEV alerts in the last 14 days

## Checklist
- ${data.checklistDone}/${data.checklistTotal} done (${data.checklistPct}%) — ${data.checklistDelta >= 0 ? "+" : ""}${data.checklistDelta}% this week

## Vendors at risk
${data.vendorsAtRisk.length === 0 ? "- None — all critical vendors have SOC 2." : data.vendorsAtRisk.map((v) => `- ${v.name} (${v.criticality}, SOC2: ${v.soc2_status})`).join("\n")}

## Top 3 actions for this week
${data.topActions.map((a, i) => `${i + 1}. **${a.title}** — ${a.mitigation}`).join("\n")}
`;
    await navigator.clipboard.writeText(md);
    toast.success("Digest copied as Markdown");
  };

  return (
    <AppShell>
      <div className="flex items-end justify-between mb-6 print:hidden">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Weekly Security Digest</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            One-page snapshot of what changed this week. Forward to your team, board, or enterprise prospects — no manual writing required.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={copyMarkdown}>
            <Copy className="w-4 h-4 mr-2" />Copy as Markdown
          </Button>
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="w-4 h-4 mr-2" />Print / PDF
          </Button>
        </div>
      </div>

      <div className="surface-card p-6 md:p-8 print:border-0 print:shadow-none">
        <div className="flex items-baseline justify-between border-b border-border pb-4 mb-6">
          <div>
            <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">SentinelCSPM · Weekly Digest</div>
            <h2 className="text-2xl font-bold mt-1">{weekRange}</h2>
          </div>
          <div className="text-right">
            <div className="text-xs font-mono uppercase text-muted-foreground">Posture Score</div>
            <div className="text-4xl font-bold">{data.currentScore}<span className="text-lg text-muted-foreground">/100</span></div>
            <div className={`flex items-center justify-end gap-1 text-xs font-mono mt-1 ${trendColor(data.scoreDelta, true)}`}>
              {trendIcon(data.scoreDelta)} {data.scoreDelta >= 0 ? "+" : ""}{data.scoreDelta} vs last week
            </div>
          </div>
        </div>

        {/* Headline metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <MetricBlock
            icon={AlertTriangle}
            label="New criticals"
            value={data.newCritical.length}
            tone={data.newCritical.length > 0 ? "destructive" : "success"}
            sub="this week"
          />
          <MetricBlock
            icon={AlertTriangle}
            label="New high"
            value={data.newHigh.length}
            tone={data.newHigh.length > 0 ? "warning" : "success"}
            sub="this week"
          />
          <MetricBlock
            icon={Radar}
            label="KEV alerts"
            value={data.recentKev.length}
            tone={data.recentKev.length > 0 ? "warning" : "muted"}
            sub="last 14 days"
          />
          <MetricBlock
            icon={ShieldCheck}
            label="SOC 2"
            value={`${data.soc2.score}`}
            tone="info"
            sub={`${data.soc2.passing}/${data.soc2.total} controls`}
          />
        </div>

        {/* Top actions */}
        <Section title="Top 3 actions this week" icon={AlertTriangle}>
          {data.topActions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing urgent. Great week — keep your checklist moving.</p>
          ) : (
            <ol className="space-y-3">
              {data.topActions.map((a, i) => (
                <li key={i} className="flex gap-3">
                  <span className="shrink-0 w-6 h-6 grid place-items-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="font-medium text-sm">{a.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{a.mitigation}</div>
                    <div className="text-[10px] font-mono text-muted-foreground mt-0.5 truncate">{a.resource}</div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Section>

        {/* Checklist + Vendors */}
        <div className="grid md:grid-cols-2 gap-6 mt-8">
          <Section title="Security checklist" icon={ListChecks}>
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-bold">{data.checklistPct}%</div>
              <div className="text-xs text-muted-foreground">{data.checklistDone}/{data.checklistTotal} done</div>
            </div>
            <div className={`flex items-center gap-1 text-xs font-mono mt-1 ${trendColor(data.checklistDelta, true)}`}>
              {trendIcon(data.checklistDelta)} {data.checklistDelta >= 0 ? "+" : ""}{data.checklistDelta}% this week
            </div>
            <div className="mt-3 h-1.5 bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-primary" style={{ width: `${data.checklistPct}%` }} />
            </div>
          </Section>

          <Section title="Vendors at risk" icon={Building2}>
            {data.vendorsAtRisk.length === 0 ? (
              <p className="text-sm text-muted-foreground">All critical vendors have SOC 2 attestation. ✅</p>
            ) : (
              <ul className="space-y-2">
                {data.vendorsAtRisk.slice(0, 5).map((v) => (
                  <li key={v.id} className="flex items-center justify-between text-sm">
                    <span className="truncate">{v.name}</span>
                    <Badge variant="outline" className="text-[10px] text-destructive border-destructive/40">
                      {v.criticality} · {v.soc2_status}
                    </Badge>
                  </li>
                ))}
                {data.vendorsAtRisk.length > 5 && (
                  <li className="text-xs text-muted-foreground">+{data.vendorsAtRisk.length - 5} more</li>
                )}
              </ul>
            )}
          </Section>
        </div>

        {/* KEV */}
        {data.recentKev.length > 0 && (
          <Section title="Recent KEV alerts (CISA)" icon={Radar} className="mt-8">
            <ul className="space-y-2">
              {data.recentKev.slice(0, 5).map((k) => (
                <li key={k.id} className="text-sm">
                  <span className="font-mono text-xs text-muted-foreground mr-2">{k.cve_id}</span>
                  {k.title}
                </li>
              ))}
            </ul>
          </Section>
        )}

        <div className="mt-8 pt-4 border-t border-border text-[11px] font-mono text-muted-foreground text-center">
          Generated {format(new Date(), "MMM d, yyyy 'at' HH:mm")} · SentinelCSPM
        </div>
      </div>
    </AppShell>
  );
};

const MetricBlock = ({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: any;
  label: string;
  value: number | string;
  sub: string;
  tone: "destructive" | "warning" | "success" | "info" | "muted";
}) => {
  const toneClass = {
    destructive: "text-destructive",
    warning: "text-destructive",
    success: "text-primary",
    info: "text-primary",
    muted: "text-muted-foreground",
  }[tone];
  return (
    <div className="surface-card p-4">
      <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-muted-foreground">
        <Icon className={`w-3.5 h-3.5 ${toneClass}`} />
        {label}
      </div>
      <div className={`text-2xl font-bold mt-1 ${toneClass}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>
    </div>
  );
};

const Section = ({
  title,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  icon: any;
  children: React.ReactNode;
  className?: string;
}) => (
  <div className={className}>
    <div className="flex items-center gap-2 mb-3">
      <Icon className="w-4 h-4 text-primary" />
      <h3 className="font-semibold text-sm uppercase tracking-wider font-mono">{title}</h3>
    </div>
    {children}
  </div>
);

export default Digest;
