import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "@/components/cspm/AppShell";
import { SeverityBadge } from "@/components/cspm/SeverityBadge";
import { ProviderBadge } from "@/components/cspm/ProviderBadge";
import { AssetBadge } from "@/components/cspm/AssetBadge";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { ArrowRight } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type Scan = Database["public"]["Tables"]["scans"]["Row"];
type Conn = Database["public"]["Tables"]["cloud_connections"]["Row"];
type Asset = Database["public"]["Tables"]["assets"]["Row"];

const ScansList = () => {
  const [scans, setScans] = useState<Scan[]>([]);
  const [conns, setConns] = useState<Record<string, Conn>>({});
  const [assets, setAssets] = useState<Record<string, Asset>>({});

  useEffect(() => {
    document.title = "Scans — SentinelCSPM";
    (async () => {
      const [s, c, a] = await Promise.all([
        supabase.from("scans").select("*").order("started_at", { ascending: false }),
        supabase.from("cloud_connections").select("*"),
        supabase.from("assets").select("*"),
      ]);
      setScans(s.data ?? []);
      const cmap: Record<string, Conn> = {}; (c.data ?? []).forEach(x => { cmap[x.id] = x; }); setConns(cmap);
      const amap: Record<string, Asset> = {}; (a.data ?? []).forEach(x => { amap[x.id] = x; }); setAssets(amap);
    })();
  }, []);

  return (
    <AppShell>
      <h1 className="text-3xl font-bold tracking-tight mb-1">Scan History</h1>
      <p className="text-muted-foreground mb-6">All posture, code, container, K8s and AI security scans.</p>
      {scans.length === 0 ? (
        <div className="surface-card p-12 text-center text-sm text-muted-foreground">
          No scans yet. Start one from Cloud, Code & Containers, or AI Security.
        </div>
      ) : (
        <ul className="space-y-3">
          {scans.map(s => {
            const isCloud = s.scan_kind === "cloud";
            const c = isCloud ? conns[s.connection_id] : undefined;
            const a = !isCloud ? (assets[s.asset_id ?? ""] ?? assets[s.connection_id]) : undefined;
            const name = c?.name ?? a?.name ?? "Deleted target";
            return (
              <li key={s.id}>
                <Link to={`/scans/${s.id}`} className="surface-card p-4 flex items-center gap-4 hover:border-primary/40 transition-colors">
                  {c ? <ProviderBadge provider={c.provider} withLabel={false} /> :
                   a ? <AssetBadge type={a.asset_type} withLabel={false} /> : null}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{name}</div>
                    <div className="text-xs text-muted-foreground font-mono uppercase">
                      {s.scan_kind} · {formatDistanceToNow(new Date(s.started_at), { addSuffix: true })} · {s.resources_scanned} resources
                    </div>
                  </div>
                  <div className="hidden md:flex items-center gap-2">
                    {s.critical_count > 0 && <SeverityBadge severity="critical" />}
                    {s.high_count > 0 && <SeverityBadge severity="high" />}
                    {s.medium_count > 0 && <SeverityBadge severity="medium" />}
                    {s.low_count > 0 && <SeverityBadge severity="low" />}
                    {s.total_findings === 0 && <span className="text-xs text-muted-foreground">No findings</span>}
                  </div>
                  <span className="text-xs font-mono text-muted-foreground tabular-nums w-20 text-right">{s.total_findings} finding{s.total_findings === 1 ? "" : "s"}</span>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
};

export default ScansList;
