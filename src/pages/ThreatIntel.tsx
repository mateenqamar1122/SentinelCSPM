import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/cspm/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Loader2, RefreshCw, ExternalLink, ShieldAlert, Flame,
  Search, Star, StarOff, ChevronDown, ChevronUp, Copy,
  Activity, BookOpen, Filter, X, AlertTriangle, TrendingUp,
  Crosshair, Globe, Hash, Calendar, Tag,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getSessionId } from "@/lib/session";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { SeverityBadge, type Severity } from "@/components/cspm/SeverityBadge";
import type { Database } from "@/integrations/supabase/types";

type Alert = Database["public"]["Tables"]["threat_intel_alerts"]["Row"];

// ── Constants ──────────────────────────────────────────────────────────────────

const DEFAULT_STACK = "aws,s3,ec2,nodejs,express,axios,lodash,docker,runc,kubernetes,openssl,openssh,postgres";

const SEV_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

// CVSS score ranges → labels / colors
const cvssLabel = (score: number) => {
  if (score >= 9.0) return { label: "Critical", color: "text-red-500", bg: "bg-red-500" };
  if (score >= 7.0) return { label: "High", color: "text-orange-500", bg: "bg-orange-500" };
  if (score >= 4.0) return { label: "Medium", color: "text-yellow-600", bg: "bg-yellow-500" };
  return { label: "Low", color: "text-blue-500", bg: "bg-blue-500" };
};

// Rough CVSS heuristic from severity (since DB doesn't store raw score)
const heuristicCVSS = (sev: string, kev: boolean): number => {
  const base = sev === "critical" ? 9.5 : sev === "high" ? 7.8 : sev === "medium" ? 5.3 : 3.1;
  return kev ? Math.min(10, base + 0.5) : base;
};

// Map tech keywords → MITRE ATT&CK tactics (simplified)
const MITRE_MAP: Record<string, string[]> = {
  openssl:    ["T1573 – Encrypted Channel", "T1190 – Exploit Public-Facing App"],
  openssh:    ["T1021.004 – SSH", "T1078 – Valid Accounts"],
  kubernetes: ["T1610 – Deploy Container", "T1613 – Container Enumeration"],
  docker:     ["T1610 – Deploy Container", "T1611 – Escape to Host"],
  runc:       ["T1611 – Escape to Host"],
  aws:        ["T1078.004 – Cloud Accounts", "T1530 – Data from Cloud Storage"],
  ec2:        ["T1078.004 – Cloud Accounts"],
  s3:         ["T1530 – Data from Cloud Storage"],
  nodejs:     ["T1059.007 – JavaScript", "T1203 – Client Execution"],
  express:    ["T1190 – Exploit Public-Facing App"],
  postgres:   ["T1190 – Exploit Public-Facing App", "T1005 – Data from Local System"],
  lodash:     ["T1059.007 – JavaScript"],
  axios:      ["T1071.001 – Web Protocols"],
};

function getMitreTactics(techs: string[]): string[] {
  const set = new Set<string>();
  techs.forEach(t => (MITRE_MAP[t.toLowerCase()] ?? []).forEach(m => set.add(m)));
  return [...set];
}

// ── Component ─────────────────────────────────────────────────────────────────

const ThreatIntel = () => {
  const [alerts, setAlerts]         = useState<Alert[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stack, setStack]           = useState(() => localStorage.getItem("cspm_stack") ?? DEFAULT_STACK);
  const [search, setSearch]         = useState("");
  const [filterSev, setFilterSev]   = useState("all");
  const [filterKev, setFilterKev]   = useState(false);
  const [filterTech, setFilterTech] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [watchlist, setWatchlist]   = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("cspm_threat_watchlist") ?? "[]")); }
    catch { return new Set(); }
  });
  const [showWatchlistOnly, setShowWatchlistOnly] = useState(false);

  // ── Data ────────────────────────────────────────────────────────────────────

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("threat_intel_alerts").select("*")
      .order("kev_listed", { ascending: false })
      .order("published_at", { ascending: false });
    if (error) toast.error(error.message);
    setAlerts(data ?? []);
    setLoading(false);
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      const stackList = stack.split(",").map(s => s.trim()).filter(Boolean);
      localStorage.setItem("cspm_stack", stackList.join(","));
      const { data, error } = await supabase.functions.invoke("threat-intel-refresh", {
        body: { stack: stackList },
        headers: { "x-session-id": getSessionId() },
      });
      if (error) throw error;
      toast.success(`Found ${(data as { inserted?: number })?.inserted ?? 0} alerts matching your stack`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Refresh failed");
    } finally { setRefreshing(false); }
  };

  useEffect(() => { document.title = "Threat Intel — SentinelCSPM"; load(); }, []);

  // ── Watchlist ────────────────────────────────────────────────────────────────

  const toggleWatchlist = (id: string) => {
    setWatchlist(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      localStorage.setItem("cspm_threat_watchlist", JSON.stringify([...next]));
      return next;
    });
  };

  // ── Derived data ─────────────────────────────────────────────────────────────

  const allTechs = useMemo(() => {
    const set = new Set<string>();
    alerts.forEach(a => a.affected_tech.forEach(t => set.add(t)));
    return [...set].sort();
  }, [alerts]);

  const filtered = useMemo(() => {
    let list = [...alerts];
    if (showWatchlistOnly) list = list.filter(a => watchlist.has(a.id));
    if (filterKev) list = list.filter(a => a.kev_listed);
    if (filterSev !== "all") list = list.filter(a => a.severity === filterSev);
    if (filterTech) list = list.filter(a => a.affected_tech.some(t => t.toLowerCase().includes(filterTech.toLowerCase())));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(a =>
        a.title.toLowerCase().includes(q) ||
        a.cve_id.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.affected_tech.some(t => t.toLowerCase().includes(q))
      );
    }
    return list.sort((a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9));
  }, [alerts, search, filterSev, filterKev, filterTech, showWatchlistOnly, watchlist]);

  const stats = useMemo(() => ({
    total:    alerts.length,
    kev:      alerts.filter(a => a.kev_listed).length,
    critical: alerts.filter(a => a.severity === "critical").length,
    high:     alerts.filter(a => a.severity === "high").length,
    medium:   alerts.filter(a => a.severity === "medium").length,
    watched:  alerts.filter(a => watchlist.has(a.id)).length,
  }), [alerts, watchlist]);

  const activeFilters = (filterKev ? 1 : 0) + (filterSev !== "all" ? 1 : 0) + (filterTech ? 1 : 0) + (search ? 1 : 0) + (showWatchlistOnly ? 1 : 0);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <AppShell>
      {/* Header */}
      <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Threat Intelligence</h1>
          <p className="text-muted-foreground mt-1">
            Live CISA KEV + curated NVD CVEs filtered to your stack — with watchlist, MITRE mapping and risk scoring.
          </p>
        </div>
        <Button onClick={refresh} disabled={refreshing}>
          {refreshing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          {refreshing ? "Pulling feeds…" : "Refresh feeds"}
        </Button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-6">
        {[
          { label: "Total CVEs",  value: stats.total,    color: "text-foreground",          icon: Activity },
          { label: "KEV listed",  value: stats.kev,      color: "text-red-500",             icon: Flame },
          { label: "Critical",    value: stats.critical, color: "text-red-500",             icon: AlertTriangle },
          { label: "High",        value: stats.high,     color: "text-orange-500",          icon: TrendingUp },
          { label: "Medium",      value: stats.medium,   color: "text-yellow-600",          icon: ShieldAlert },
          { label: "Watchlist",   value: stats.watched,  color: "text-primary",             icon: Star },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} className="surface-card p-4 flex items-center gap-2.5">
            <Icon className={`w-4 h-4 shrink-0 ${color}`} />
            <div>
              <div className={`text-xl font-bold ${color}`}>{value}</div>
              <div className="text-[10px] font-mono uppercase text-muted-foreground">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Severity breakdown bar */}
      {stats.total > 0 && (
        <div className="surface-card p-4 mb-6">
          <div className="text-xs font-mono uppercase text-muted-foreground tracking-wider mb-3">Severity Distribution</div>
          <div className="flex h-3 rounded-full overflow-hidden gap-px">
            {[
              { key: "critical", color: "bg-red-500",    count: stats.critical },
              { key: "high",     color: "bg-orange-500", count: stats.high },
              { key: "medium",   color: "bg-yellow-500", count: stats.medium },
              { key: "low",      color: "bg-blue-400",   count: stats.total - stats.critical - stats.high - stats.medium },
            ].map(({ key, color, count }) => count > 0 && (
              <div
                key={key}
                title={`${key}: ${count}`}
                className={`${color} transition-all`}
                style={{ width: `${(count / stats.total) * 100}%` }}
              />
            ))}
          </div>
          <div className="flex gap-4 mt-2 text-[10px] font-mono text-muted-foreground">
            {[["Critical", "bg-red-500", stats.critical], ["High", "bg-orange-500", stats.high], ["Medium", "bg-yellow-500", stats.medium]].map(([l, c, v]) => (
              <span key={l as string} className="flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full ${c}`} />
                {l}: {v}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Stack editor */}
      <div className="surface-card p-4 mb-6">
        <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
          Your tech stack (comma-separated keywords for CVE filtering)
        </label>
        <textarea
          value={stack}
          onChange={(e) => setStack(e.target.value)}
          rows={2}
          className="mt-2 w-full bg-background/50 border border-border rounded-md p-2 text-xs font-mono outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/10 resize-none transition-colors duration-150"
        />
        <p className="text-[10px] text-muted-foreground mt-1">
          Tech tags are matched against CVE affected products. Click <strong>Refresh feeds</strong> to re-pull with the updated list.
        </p>
      </div>

      {/* Search + filters */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8 h-8 text-sm" placeholder="Search CVEs, titles, tech…" value={search} onChange={e => setSearch(e.target.value)} />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Severity filter */}
        <select
          value={filterSev}
          onChange={e => setFilterSev(e.target.value)}
          className="h-8 px-2 text-xs rounded-md border border-border bg-background font-mono focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/10 transition-colors duration-150"
        >
          <option value="all">All severity</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        {/* Tech filter */}
        <select
          value={filterTech}
          onChange={e => setFilterTech(e.target.value)}
          className="h-8 px-2 text-xs rounded-md border border-border bg-background font-mono focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/10 transition-colors duration-150"
        >
          <option value="">All technologies</option>
          {allTechs.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        {/* Toggle buttons */}
        <button
          onClick={() => setFilterKev(v => !v)}
          className={`h-8 px-3 text-xs rounded-md border font-mono uppercase tracking-wider transition-colors flex items-center gap-1.5
            ${filterKev ? "border-red-500 text-red-500 bg-red-50 dark:bg-red-950/30" : "border-border text-muted-foreground hover:text-foreground"}`}
        >
          <Flame className="w-3 h-3" />KEV only
        </button>

        <button
          onClick={() => setShowWatchlistOnly(v => !v)}
          className={`h-8 px-3 text-xs rounded-md border font-mono uppercase tracking-wider transition-colors flex items-center gap-1.5
            ${showWatchlistOnly ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:text-foreground"}`}
        >
          <Star className="w-3 h-3" />Watchlist
        </button>

        {activeFilters > 0 && (
          <button
            onClick={() => { setSearch(""); setFilterSev("all"); setFilterKev(false); setFilterTech(""); setShowWatchlistOnly(false); }}
            className="h-8 px-3 text-xs rounded-md border border-dashed border-muted-foreground/40 text-muted-foreground hover:text-foreground flex items-center gap-1.5"
          >
            <X className="w-3 h-3" />Clear {activeFilters} filter{activeFilters > 1 ? "s" : ""}
          </button>
        )}

        <span className="text-xs text-muted-foreground font-mono ml-auto">
          {filtered.length} / {stats.total} CVEs
        </span>
      </div>

      {/* CVE list */}
      {loading ? (
        <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="surface-card p-12 text-center">
          <ShieldAlert className="w-8 h-8 mx-auto text-primary mb-3" />
          <h2 className="text-lg font-semibold">No alerts found</h2>
          <p className="text-sm text-muted-foreground mb-4">
            {stats.total === 0 ? "Click \"Refresh feeds\" to pull the latest CISA KEV + NVD CVEs filtered to your stack." : "Try adjusting your search or filters."}
          </p>
          {stats.total === 0 && (
            <Button onClick={refresh} disabled={refreshing}>
              {refreshing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Refresh feeds
            </Button>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map(a => {
            const isExpanded  = expandedId === a.id;
            const isWatched   = watchlist.has(a.id);
            const cvssScore   = heuristicCVSS(a.severity, a.kev_listed);
            const cvss        = cvssLabel(cvssScore);
            const mitre       = getMitreTactics(a.affected_tech);

            return (
              <li key={a.id} className={`surface-card overflow-hidden transition-all ${isWatched ? "border-primary/40" : ""}`}>
                {/* Row header — always visible */}
                <div className="p-4 flex items-start gap-3">
                  {/* Watchlist star */}
                  <button
                    onClick={() => toggleWatchlist(a.id)}
                    className={`mt-0.5 shrink-0 transition-colors ${isWatched ? "text-yellow-500" : "text-muted-foreground/40 hover:text-yellow-400"}`}
                    title={isWatched ? "Remove from watchlist" : "Add to watchlist"}
                  >
                    {isWatched ? <Star className="w-4 h-4 fill-yellow-400" /> : <Star className="w-4 h-4" />}
                  </button>

                  <div className="flex-1 min-w-0">
                    {/* Badges row */}
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <SeverityBadge severity={a.severity as Severity} />
                      {a.kev_listed && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-300/50 dark:border-red-500/30 inline-flex items-center gap-1">
                          <Flame className="w-3 h-3" />KEV
                        </span>
                      )}
                      <code className="text-xs font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">{a.cve_id}</code>

                      {/* CVSS risk score */}
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border border-border bg-secondary ${cvss.color}`}>
                        CVSS {cvssScore.toFixed(1)} · {cvss.label}
                      </span>
                    </div>

                    <div className="font-medium leading-snug">{a.title}</div>

                    {/* Tech tags */}
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      {a.affected_tech.map(t => (
                        <button
                          key={t}
                          onClick={() => setFilterTech(filterTech === t ? "" : t)}
                          className={`text-[10px] font-mono px-1.5 py-0.5 rounded border transition-colors ${filterTech === t ? "border-primary text-primary bg-primary/10" : "border-border bg-secondary text-foreground/70 hover:border-primary/50"}`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Right: date + expand */}
                  <div className="text-right shrink-0 flex flex-col items-end gap-2">
                    <div className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {a.published_at ? formatDistanceToNow(new Date(a.published_at), { addSuffix: true }) : "—"}
                    </div>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : a.id)}
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                    >
                      {isExpanded ? <><ChevronUp className="w-3.5 h-3.5" />Collapse</> : <><ChevronDown className="w-3.5 h-3.5" />Expand</>}
                    </button>
                  </div>
                </div>

                {/* Expanded detail panel */}
                {isExpanded && (
                  <div className="border-t border-border/60 bg-secondary/30 p-4 space-y-5">

                    {/* Description */}
                    <div>
                      <div className="text-xs font-mono uppercase text-muted-foreground tracking-wider mb-1.5 flex items-center gap-1.5">
                        <BookOpen className="w-3.5 h-3.5" />Description
                      </div>
                      <p className="text-sm leading-relaxed whitespace-pre-line">{a.description}</p>
                    </div>

                    {/* CVSS risk gauge */}
                    <div>
                      <div className="text-xs font-mono uppercase text-muted-foreground tracking-wider mb-1.5 flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5" />Risk Score (CVSS estimate)
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <Progress value={(cvssScore / 10) * 100} className="h-2" />
                        </div>
                        <span className={`text-sm font-bold font-mono w-12 text-right ${cvss.color}`}>
                          {cvssScore.toFixed(1)}/10
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded font-mono ${cvss.color} bg-secondary`}>
                          {cvss.label}
                        </span>
                      </div>
                      {a.kev_listed && (
                        <p className="text-[11px] text-red-500 mt-1.5 flex items-center gap-1">
                          <Flame className="w-3 h-3" />
                          This CVE is actively exploited in the wild (CISA KEV). Treat as highest priority.
                        </p>
                      )}
                    </div>

                    {/* MITRE ATT&CK techniques */}
                    {mitre.length > 0 && (
                      <div>
                        <div className="text-xs font-mono uppercase text-muted-foreground tracking-wider mb-2 flex items-center gap-1.5">
                          <Crosshair className="w-3.5 h-3.5" />MITRE ATT&amp;CK Techniques
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {mitre.map(t => (
                            <a
                              key={t}
                              href={`https://attack.mitre.org/techniques/${t.split(" ")[0].replace(".", "/")}`}
                              target="_blank" rel="noreferrer"
                              className="text-xs font-mono px-2.5 py-1 rounded-md border border-purple-300/50 dark:border-purple-700/40 bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 hover:border-purple-400 transition-colors flex items-center gap-1.5"
                            >
                              <Crosshair className="w-3 h-3 shrink-0" />{t}
                              <ExternalLink className="w-3 h-3 opacity-60" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Published date */}
                    {a.published_at && (
                      <div className="text-[11px] text-muted-foreground font-mono flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        Published {format(new Date(a.published_at), "MMMM d, yyyy")}
                        {" · "}
                        {formatDistanceToNow(new Date(a.published_at), { addSuffix: true })}
                      </div>
                    )}

                    {/* References */}
                    {a.references_urls.length > 0 && (
                      <div>
                        <div className="text-xs font-mono uppercase text-muted-foreground tracking-wider mb-2 flex items-center gap-1.5">
                          <Globe className="w-3.5 h-3.5" />References
                        </div>
                        <div className="space-y-1">
                          {a.references_urls.slice(0, 6).map((url, i) => (
                            <a key={i} href={url} target="_blank" rel="noreferrer"
                              className="flex items-center gap-1.5 text-xs text-primary hover:underline font-mono truncate"
                            >
                              <ExternalLink className="w-3 h-3 shrink-0" />
                              <span className="truncate">{url}</span>
                            </a>
                          ))}
                          {a.references_urls.length > 6 && (
                            <p className="text-[10px] text-muted-foreground">+{a.references_urls.length - 6} more references</p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Action row */}
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => { navigator.clipboard.writeText(a.cve_id); toast.success(`Copied ${a.cve_id}`); }}
                        className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border hover:border-primary/50 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Copy className="w-3.5 h-3.5" />Copy CVE ID
                      </button>
                      <button
                        onClick={() => { navigator.clipboard.writeText(`${a.cve_id}: ${a.title}\nSeverity: ${a.severity.toUpperCase()}\nCVSS: ${cvssScore.toFixed(1)}\nKEV: ${a.kev_listed ? "Yes" : "No"}\nAffected: ${a.affected_tech.join(", ")}\n\n${a.description}`); toast.success("Summary copied"); }}
                        className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border hover:border-primary/50 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Hash className="w-3.5 h-3.5" />Copy Summary
                      </button>
                      <button
                        onClick={() => toggleWatchlist(a.id)}
                        className={`text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-md border transition-colors ${isWatched ? "border-yellow-400 text-yellow-600 bg-yellow-50 dark:bg-yellow-950/20" : "border-border text-muted-foreground hover:text-foreground hover:border-yellow-400/50"}`}
                      >
                        {isWatched ? <StarOff className="w-3.5 h-3.5" /> : <Star className="w-3.5 h-3.5" />}
                        {isWatched ? "Unwatch" : "Add to Watchlist"}
                      </button>
                      {a.references_urls[0] && (
                        <a href={a.references_urls[0]} target="_blank" rel="noreferrer"
                          className="ml-auto text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-primary/50 text-primary hover:bg-primary/10 transition-colors"
                        >
                          <Tag className="w-3.5 h-3.5" />View Advisory
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
};

export default ThreatIntel;
