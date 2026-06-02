import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "@/components/cspm/AppShell";
import { StatCard } from "@/components/cspm/StatCard";
import { AddConnectionDialog } from "@/components/cspm/AddConnectionDialog";
import { DashboardCharts } from "@/components/cspm/DashboardCharts";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck, AlertTriangle, Activity, FileWarning, Cloud, Boxes, Brain, Radar, FileBadge2, ArrowRight, FileText,
  ListChecks, Building2, Siren, FileQuestion, BrainCircuit,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { scoreFramework, type FindingLite } from "@/lib/compliance";
import type { Database } from "@/integrations/supabase/types";

type Conn = Database["public"]["Tables"]["cloud_connections"]["Row"];
type Asset = Database["public"]["Tables"]["assets"]["Row"];
type Finding = Database["public"]["Tables"]["findings"]["Row"];

const PILLARS = [
  { to: "/ai-soc", icon: BrainCircuit, title: "AI SOC", desc: "Agentic AI that triages and investigates SIEM alerts with full reasoning trails and guardrails." },
  { to: "/connections", icon: Cloud, title: "Cloud Posture", desc: "AWS / GCP / Azure misconfigurations, IAM and network risks." },
  { to: "/assets", icon: Boxes, title: "Code & Containers", desc: "Repos, images, K8s scanned for CVEs, secrets, IaC issues." },
  { to: "/ai-security", icon: Brain, title: "AI Workflow Security", desc: "Prompt injection, PII leakage to LLMs, shadow AI usage." },
  { to: "/threat-intel", icon: Radar, title: "Threat Intelligence", desc: "CISA KEV + NVD CVEs filtered to your tech stack." },
  { to: "/compliance", icon: FileBadge2, title: "Compliance", desc: "SOC 2, ISO 27001, GDPR, HIPAA — auto-mapped from findings." },
  { to: "/checklist", icon: ListChecks, title: "Security Checklist", desc: "Starter SOC 2 / ISO 27001 hygiene tasks every startup needs." },
  { to: "/vendors", icon: Building2, title: "Vendor Risk", desc: "Track every SaaS that touches your data — ready for enterprise reviews." },
  { to: "/incidents", icon: Siren, title: "Incident Response", desc: "Pre-built playbooks plus a timeline log for when things break." },
  { to: "/questionnaire", icon: FileQuestion, title: "Questionnaire AI", desc: "Auto-draft answers to enterprise security questionnaires." },
  { to: "/report", icon: FileText, title: "Board Report", desc: "One-page printable PDF for investors, your board, or enterprise prospects." },
];

const Index = () => {
  const [connections, setConnections] = useState<Conn[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [threatCount, setThreatCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [c, a, f, t] = await Promise.all([
      supabase.from("cloud_connections").select("*"),
      supabase.from("assets").select("*"),
      supabase.from("findings").select("*"),
      supabase.from("threat_intel_alerts").select("id", { count: "exact", head: true }),
    ]);
    setConnections(c.data ?? []);
    setAssets(a.data ?? []);
    setFindings(f.data ?? []);
    setThreatCount(t.count ?? 0);
    setLoading(false);
  };

  useEffect(() => {
    load();
    document.title = "SentinelCSPM — Unified Security Posture";
    const m = document.querySelector('meta[name="description"]');
    if (m) m.setAttribute("content", "Cloud + code + container + AI workflow security in one place. Map findings to SOC 2, ISO 27001, GDPR and HIPAA, with live CISA KEV threat intel.");
  }, []);

  const counts = {
    critical: findings.filter(f => f.severity === "critical").length,
    high: findings.filter(f => f.severity === "high").length,
    medium: findings.filter(f => f.severity === "medium").length,
    low: findings.filter(f => f.severity === "low").length,
  };
  const score = Math.max(0, 100 - counts.critical * 8 - counts.high * 4 - counts.medium * 1.5 - counts.low * 0.4);
  const lite: FindingLite[] = findings.map(f => ({ rule_id: f.rule_id, compliance: f.compliance, severity: f.severity }));
  const soc2 = scoreFramework("SOC2", lite);

  return (
    <AppShell>
      {/* Hero */}
      <section data-tour="hero" className="relative overflow-hidden surface-card p-8 md:p-12 mb-8">
        <div className="absolute inset-0 grid-bg opacity-40 pointer-events-none" />
        <div className="absolute inset-0" style={{ background: "var(--gradient-hero)" }} />
        <div className="relative">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-secondary/50 text-xs font-mono text-muted-foreground">
            <span className="pulse-dot" /> Cloud · Code · Containers · AI · Threat Intel
          </div>
          <h1 className="mt-4 text-4xl md:text-5xl font-bold tracking-tight">
            One platform for <span className="text-gradient">every security signal.</span>
          </h1>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            Connect your clouds, repos, and AI workflows. We surface CVEs, secrets, misconfigurations
            and prompt-injection risks — and map every finding to SOC 2, ISO 27001, GDPR and HIPAA controls.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <AddConnectionDialog onCreated={load} />
            <Button asChild variant="outline">
              <Link to="/assets"><Boxes className="w-4 h-4 mr-2" />Add code or container</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section data-tour="posture" className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-8">
        <StatCard label="Posture Score" value={loading ? "—" : Math.round(score)} icon={ShieldCheck} accent="primary" hint="0–100, higher is better" />
        <StatCard label="Critical" value={counts.critical} icon={AlertTriangle} accent="critical" />
        <StatCard label="High" value={counts.high} icon={FileWarning} accent="high" />
        <StatCard label="Medium" value={counts.medium} icon={Activity} accent="medium" />
        <StatCard label="SOC 2" value={`${soc2.score}/100`} icon={FileBadge2} accent="info" hint={`${soc2.passing}/${soc2.total} controls`} />
        <StatCard label="KEV alerts" value={threatCount} icon={Radar} accent="info" />
      </section>

      {/* Charts */}
      <DashboardCharts findings={findings} assets={assets} connections={connections} />

      {/* Pillars */}
      <section data-tour="pillars" className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {PILLARS.map(p => (
          <Link key={p.to} to={p.to} className="surface-card p-5 group hover:border-primary/40 transition-colors">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 grid place-items-center rounded-md bg-secondary border border-border text-primary">
                <p.icon className="w-4 h-4" />
              </div>
              <h3 className="font-semibold">{p.title}</h3>
              <ArrowRight className="w-4 h-4 ml-auto text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <p className="text-sm text-muted-foreground">{p.desc}</p>
          </Link>
        ))}
      </section>

      {/* Inventory summary */}
      <section className="grid md:grid-cols-2 gap-6">
        <div className="surface-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground font-mono">Cloud Connections</h2>
            <Button asChild size="sm" variant="ghost"><Link to="/connections">Manage</Link></Button>
          </div>
          <div className="text-3xl font-bold">{connections.length}</div>
          <p className="text-xs text-muted-foreground mt-1">AWS / GCP / Azure / Demo accounts ready to scan.</p>
        </div>
        <div className="surface-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground font-mono">Code & Container Assets</h2>
            <Button asChild size="sm" variant="ghost"><Link to="/assets">Manage</Link></Button>
          </div>
          <div className="text-3xl font-bold">{assets.filter(a => a.asset_type !== "ai_workflow").length}</div>
          <p className="text-xs text-muted-foreground mt-1">Repositories, container images, and Kubernetes clusters tracked.</p>
        </div>
      </section>
    </AppShell>
  );
};

export default Index;
