import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { AppShell } from "@/components/cspm/AppShell";
import { SeverityBadge, type Severity } from "@/components/cspm/SeverityBadge";
import { ProviderBadge } from "@/components/cspm/ProviderBadge";
import { AssetBadge } from "@/components/cspm/AssetBadge";
import { StatCard } from "@/components/cspm/StatCard";
import { ExplainFixDialog } from "@/components/cspm/ExplainFixDialog";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ChevronLeft, ShieldCheck, AlertTriangle, FileWarning, Activity, Cpu } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import type { Database } from "@/integrations/supabase/types";

type Scan = Database["public"]["Tables"]["scans"]["Row"];
type Finding = Database["public"]["Tables"]["findings"]["Row"];
type Conn = Database["public"]["Tables"]["cloud_connections"]["Row"];
type Asset = Database["public"]["Tables"]["assets"]["Row"];

const SEVERITIES: Severity[] = ["critical", "high", "medium", "low", "info"];

const ScanDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [scan, setScan] = useState<Scan | null>(null);
  const [conn, setConn] = useState<Conn | null>(null);
  const [asset, setAsset] = useState<Asset | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [filter, setFilter] = useState<Severity | "all">("all");

  useEffect(() => {
    if (!id) return;
    document.title = "Scan Results — SentinelCSPM";
    (async () => {
      const { data: s } = await supabase.from("scans").select("*").eq("id", id).maybeSingle();
      if (!s) return;
      setScan(s);
      const isCloud = s.scan_kind === "cloud";
      const targetId = s.asset_id ?? s.connection_id;
      const [{ data: f }, { data: c }, { data: a }] = await Promise.all([
        supabase.from("findings").select("*").eq("scan_id", id).order("severity", { ascending: true }),
        isCloud
          ? supabase.from("cloud_connections").select("*").eq("id", s.connection_id).maybeSingle()
          : Promise.resolve({ data: null }) as never,
        !isCloud
          ? supabase.from("assets").select("*").eq("id", targetId).maybeSingle()
          : Promise.resolve({ data: null }) as never,
      ]);
      setFindings(f ?? []);
      setConn(c ?? null);
      setAsset(a ?? null);
    })();
  }, [id]);

  const sortedFindings = useMemo(() => {
    const order: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    return [...findings]
      .filter(f => filter === "all" || f.severity === filter)
      .sort((a, b) => order[a.severity] - order[b.severity]);
  }, [findings, filter]);

  if (!scan) {
    return <AppShell><div className="text-sm text-muted-foreground">Loading scan…</div></AppShell>;
  }

  return (
    <AppShell>
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
        <Link to="/scans"><ChevronLeft className="w-4 h-4 mr-1" />Back to scans</Link>
      </Button>

      <div className="surface-card p-6 mb-6 relative overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-30 pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {conn ? <ProviderBadge provider={conn.provider} withLabel={false} /> :
             asset ? <AssetBadge type={asset.asset_type} withLabel={false} /> : null}
            <div>
              <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Scan Result · {scan.scan_kind}</div>
              <h1 className="text-2xl font-bold">{conn?.name ?? asset?.name ?? "Target"}</h1>
              <div className="text-xs text-muted-foreground font-mono mt-1">
                Started {formatDistanceToNow(new Date(scan.started_at), { addSuffix: true })} · status <span className="text-foreground">{scan.status}</span>
              </div>
            </div>
          </div>
          {scan.error_message && (
            <div className="text-xs px-3 py-2 rounded-md border border-severity-critical/40 bg-severity-critical-bg text-severity-critical max-w-md">
              {scan.error_message}
            </div>
          )}
        </div>
      </div>

      <section className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <StatCard label="Resources" value={scan.resources_scanned} icon={Cpu} accent="info" />
        <StatCard label="Critical" value={scan.critical_count} icon={AlertTriangle} accent="critical" />
        <StatCard label="High" value={scan.high_count} icon={FileWarning} accent="high" />
        <StatCard label="Medium" value={scan.medium_count} icon={Activity} accent="medium" />
        <StatCard label="Low" value={scan.low_count} icon={ShieldCheck} accent="low" />
      </section>

      {/* Filter chips */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button
          onClick={() => setFilter("all")}
          className={`px-3 py-1 text-xs rounded-md font-mono uppercase tracking-wider border transition-colors ${
            filter === "all" ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          All ({findings.length})
        </button>
        {SEVERITIES.map(sev => {
          const count = findings.filter(f => f.severity === sev).length;
          if (count === 0) return null;
          return (
            <button key={sev} onClick={() => setFilter(sev)} className={filter === sev ? "ring-1 ring-primary rounded-md" : ""}>
              <SeverityBadge severity={sev} className={filter === sev ? "" : "opacity-80 hover:opacity-100"} />
              <span className="sr-only">{count}</span>
            </button>
          );
        })}
      </div>

      {sortedFindings.length === 0 ? (
        <div className="surface-card p-12 text-center">
          <ShieldCheck className="w-8 h-8 mx-auto text-accent mb-3" />
          <h2 className="text-lg font-semibold">No findings 🎉</h2>
          <p className="text-sm text-muted-foreground">Either everything looks good, or there are no findings at this severity.</p>
        </div>
      ) : (
        <Accordion type="multiple" className="space-y-2">
          {sortedFindings.map(f => (
            <AccordionItem key={f.id} value={f.id} className="surface-card border-border">
              <AccordionTrigger className="px-4 py-3 hover:no-underline">
                <div className="flex items-start gap-3 text-left flex-1">
                  <SeverityBadge severity={f.severity} className="mt-1" />
                  <div className="min-w-0">
                    <div className="font-medium">{f.title}</div>
                    <div className="text-xs font-mono text-muted-foreground truncate">
                      {f.category} · {f.resource}{f.region ? ` · ${f.region}` : ""}
                    </div>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 space-y-4">
                <div className="flex justify-end">
                  <ExplainFixDialog finding={f} />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-mono text-muted-foreground mb-1">Description</div>
                  <p className="text-sm text-foreground/90">{f.description}</p>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-mono text-muted-foreground mb-1">Mitigation</div>
                  <p className="text-sm text-foreground/90 whitespace-pre-line">{f.mitigation}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
                  <span className="text-[10px] font-mono text-muted-foreground uppercase">Rule</span>
                  <code className="text-xs font-mono text-primary">{f.rule_id}</code>
                  {f.compliance && f.compliance.length > 0 && (
                    <>
                      <span className="text-[10px] font-mono text-muted-foreground uppercase ml-3">Compliance</span>
                      {f.compliance.map(tag => (
                        <span key={tag} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary text-foreground/80 border border-border">{tag}</span>
                      ))}
                    </>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </AppShell>
  );
};

export default ScanDetail;
