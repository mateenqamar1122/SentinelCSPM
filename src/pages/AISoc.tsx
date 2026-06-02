import { useEffect, useMemo, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "@/components/cspm/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { DEMO_ALERTS } from "@/lib/socDemo";
import { toast } from "sonner";
import {
  Brain, ShieldAlert, Loader2, Sparkles, Lock, Plus, Activity, AlertTriangle,
  ChevronRight, Server, Workflow, Search, X, CheckCircle2, Trash2, Radio,
} from "lucide-react";

type Alert = {
  id: string;
  title: string;
  severity: string;
  source: string;
  status: string;
  ai_verdict: string;
  ai_confidence: number | null;
  mitre_tactics: string[];
  received_at: string;
  raw: any;
};

const verdictColor: Record<string, string> = {
  true_positive: "bg-destructive/15 text-destructive border-destructive/30",
  false_positive: "bg-muted text-muted-foreground border-border",
  benign: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
  needs_human: "bg-amber-500/10 text-amber-500 border-amber-500/30",
  pending: "bg-secondary text-muted-foreground border-border",
};

const sevColor: Record<string, string> = {
  critical: "bg-destructive/15 text-destructive border-destructive/30",
  high: "bg-orange-500/10 text-orange-500 border-orange-500/30",
  medium: "bg-amber-500/10 text-amber-500 border-amber-500/30",
  low: "bg-muted text-muted-foreground border-border",
  info: "bg-muted text-muted-foreground border-border",
};

const SEV_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
const TIME_WINDOWS: Record<string, number | null> = {
  all: null, "1h": 1, "24h": 24, "7d": 24 * 7, "30d": 24 * 30,
};

export default function AISoc() {
  const { user } = useAuth();
  const { canAISoc, isPaid } = useSubscription();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [investigatingId, setInvestigatingId] = useState<string | null>(null);
  const [seeded, setSeeded] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [sev, setSev] = useState("all");
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const [timeWin, setTimeWin] = useState("all");

  // Selection + detail
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeInv, setActiveInv] = useState<any>(null);
  const [activeInvLoading, setActiveInvLoading] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [live, setLive] = useState(false);

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    const { data, error } = await (supabase as any)
      .from("soc_alerts").select("*").order("received_at", { ascending: false });
    if (error) { toast.error(error.message); setLoading(false); return; }
    setAlerts((data ?? []) as Alert[]);
    setLoading(false);
    if ((data?.length ?? 0) === 0 && !seeded) {
      setSeeded(true);
      const rows = DEMO_ALERTS.map((a) => ({ ...a, user_id: user.id }));
      await (supabase as any).from("soc_alerts").insert(rows);
      const { data: d2 } = await (supabase as any).from("soc_alerts").select("*").order("received_at", { ascending: false });
      setAlerts((d2 ?? []) as Alert[]);
    }
  }, [user, seeded]);

  async function seedDemo() {
    if (!user) return;
    const rows = DEMO_ALERTS.map((a) => ({ ...a, user_id: user.id }));
    const { error } = await (supabase as any).from("soc_alerts").insert(rows);
    if (error) return toast.error(error.message);
    toast.success(`Seeded ${rows.length} demo alerts`);
    load();
  }

  useEffect(() => { load(); }, [load]);

  // Realtime
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`soc-alerts-${user.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "soc_alerts", filter: `user_id=eq.${user.id}` },
        (payload: any) => {
          setLive(true);
          if (payload.eventType === "INSERT") {
            const row = payload.new as Alert;
            setAlerts((prev) => prev.some((a) => a.id === row.id) ? prev : [row, ...prev]);
            toast.message("New alert", { description: `${row.severity.toUpperCase()} · ${row.title}` });
          } else if (payload.eventType === "UPDATE") {
            const row = payload.new as Alert;
            setAlerts((prev) => prev.map((a) => a.id === row.id ? row : a));
          } else if (payload.eventType === "DELETE") {
            setAlerts((prev) => prev.filter((a) => a.id !== (payload.old as any).id));
          }
        })
      .subscribe((s) => { if (s === "SUBSCRIBED") setLive(true); });
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const sources = useMemo(() => Array.from(new Set(alerts.map((a) => a.source))).sort(), [alerts]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const winHours = TIME_WINDOWS[timeWin];
    const cutoff = winHours == null ? 0 : Date.now() - winHours * 3600_000;
    return alerts.filter((a) => {
      if (sev !== "all" && a.severity !== sev) return false;
      if (status !== "all" && a.status !== status) return false;
      if (source !== "all" && a.source !== source) return false;
      if (winHours != null && new Date(a.received_at).getTime() < cutoff) return false;
      if (q && !(a.title.toLowerCase().includes(q) || a.source.toLowerCase().includes(q) ||
        a.mitre_tactics.some((t) => t.toLowerCase().includes(q)))) return false;
      return true;
    });
  }, [alerts, search, sev, status, source, timeWin]);

  const stats = useMemo(() => {
    const byVerdict: Record<string, number> = {};
    const bySev: Record<string, number> = {};
    const tactics: Record<string, number> = {};
    let openCount = 0;
    for (const a of filtered) {
      byVerdict[a.ai_verdict] = (byVerdict[a.ai_verdict] ?? 0) + 1;
      bySev[a.severity] = (bySev[a.severity] ?? 0) + 1;
      if (a.status === "new" || a.status === "triaging") openCount++;
      for (const t of a.mitre_tactics ?? []) tactics[t] = (tactics[t] ?? 0) + 1;
    }
    const topTactics = Object.entries(tactics).sort((a, b) => b[1] - a[1]).slice(0, 4);
    return {
      total: filtered.length,
      open: openCount,
      tp: byVerdict.true_positive ?? 0,
      needs: byVerdict.needs_human ?? 0,
      byVerdict, bySev, topTactics,
    };
  }, [filtered]);

  // Detail pane
  useEffect(() => {
    if (!activeId) { setActiveInv(null); return; }
    setActiveInvLoading(true);
    (supabase as any).from("soc_investigations")
      .select("*").eq("alert_id", activeId)
      .order("created_at", { ascending: false }).limit(1)
      .then(({ data }: any) => { setActiveInv(data?.[0] ?? null); setActiveInvLoading(false); });
  }, [activeId]);

  const activeAlert = useMemo(() => filtered.find((a) => a.id === activeId) ?? alerts.find((a) => a.id === activeId), [filtered, alerts, activeId]);

  async function investigate(alertId: string) {
    setInvestigatingId(alertId);
    try {
      const { data, error } = await supabase.functions.invoke("soc-investigate-alert", { body: { alert_id: alertId } });
      if (error) throw error;
      toast.success(`Verdict: ${data?.verdict ?? "complete"}`);
      await load();
      if (activeId === alertId) setActiveId(alertId); // re-fetch inv
    } catch (e: any) {
      toast.error(e.message ?? "Investigation failed");
    } finally { setInvestigatingId(null); }
  }

  // Bulk
  function toggleSel(id: string) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function selectAllVisible(checked: boolean) {
    setSelected(checked ? new Set(filtered.map((a) => a.id)) : new Set());
  }
  async function bulkUpdate(patch: Partial<Alert>) {
    if (selected.size === 0) return;
    setBulkBusy(true);
    const ids = Array.from(selected);
    const { error } = await (supabase as any).from("soc_alerts").update(patch).in("id", ids);
    setBulkBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Updated ${ids.length} alerts`);
    setSelected(new Set());
    load();
  }
  async function bulkDelete() {
    if (selected.size === 0) return;
    setBulkBusy(true);
    const ids = Array.from(selected);
    const { error } = await (supabase as any).from("soc_alerts").delete().in("id", ids);
    setBulkBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Deleted ${ids.length} alerts`);
    setSelected(new Set());
    if (activeId && ids.includes(activeId)) setActiveId(null);
    load();
  }

  function clearFilters() {
    setSearch(""); setSev("all"); setStatus("all"); setSource("all"); setTimeWin("all");
  }
  const filtersActive = search || sev !== "all" || status !== "all" || source !== "all" || timeWin !== "all";

  if (!user) {
    return (
      <AppShell>
        <Card className="p-10 text-center">
          <Brain className="w-10 h-10 mx-auto mb-3 text-primary" />
          <h2 className="text-2xl font-semibold mb-2">Sign in to use AI SOC</h2>
          <p className="text-muted-foreground mb-5">Connect your SIEM and let the agent triage your alerts.</p>
          <Button asChild><Link to="/auth">Sign in</Link></Button>
        </Card>
      </AppShell>
    );
  }

  const locked = !canAISoc;
  const allSelected = filtered.length > 0 && filtered.every((a) => selected.has(a.id));

  return (
    <AppShell>
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground font-mono mb-1">
            <Sparkles className="w-3 h-3" /> Agentic AI · SIEM Brain
            <span className={`inline-flex items-center gap-1 ml-2 px-1.5 py-0.5 rounded border ${live ? "border-emerald-500/30 text-emerald-500" : "border-border text-muted-foreground"}`}>
              <Radio className={`w-3 h-3 ${live ? "animate-pulse" : ""}`} /> {live ? "live" : "offline"}
            </span>
          </div>
          <h1 className="text-3xl font-serif">AI SOC</h1>
          <p className="text-muted-foreground max-w-2xl">
            Connect your SIEM and let the agent triage, enrich, and investigate alerts end-to-end —
            with reasoning trails, MITRE mapping, and analyst-in-the-loop guardrails.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild><Link to="/ai-soc/connections"><Server className="w-4 h-4 mr-1" /> SIEM Connections</Link></Button>
          {!isPaid && (
            <Button variant="cta" asChild><Link to="/pricing"><Sparkles className="w-4 h-4 mr-1" /> Upgrade</Link></Button>
          )}
        </div>
      </div>

      {/* Stats dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Stat icon={Activity} label="Total" value={stats.total} />
        <Stat icon={AlertTriangle} label="Open" value={stats.open} accent="text-amber-500" />
        <Stat icon={ShieldAlert} label="Confirmed TP" value={stats.tp} accent="text-destructive" />
        <Stat icon={Brain} label="Needs human" value={stats.needs} accent="text-primary" />
      </div>

      <div className="grid md:grid-cols-2 gap-3 mb-4">
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-mono mb-3">Verdict breakdown</div>
          <VerdictBars data={stats.byVerdict} total={stats.total} />
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-mono mb-3">Top MITRE tactics</div>
          {stats.topTactics.length === 0 ? (
            <div className="text-xs text-muted-foreground">No tactics detected yet.</div>
          ) : (
            <div className="space-y-1.5">
              {stats.topTactics.map(([t, n]) => (
                <div key={t} className="flex items-center gap-2 text-xs">
                  <span className="font-mono w-40 truncate">{t}</span>
                  <div className="flex-1 h-1.5 bg-muted rounded">
                    <div className="h-full bg-[image:var(--gradient-cta)] rounded" style={{ width: `${(n / stats.topTactics[0][1]) * 100}%` }} />
                  </div>
                  <span className="text-muted-foreground w-6 text-right">{n}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Filter toolbar */}
      <Card className="p-3 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, source, tactic…" className="pl-8 h-9" />
          </div>
          <FilterSelect value={sev} onChange={setSev} placeholder="Severity"
            options={[["all","All sev"],["critical","Critical"],["high","High"],["medium","Medium"],["low","Low"],["info","Info"]]} />
          <FilterSelect value={status} onChange={setStatus} placeholder="Status"
            options={[["all","All status"],["new","New"],["triaging","Triaging"],["investigated","Investigated"],["closed","Closed"]]} />
          <FilterSelect value={source} onChange={setSource} placeholder="Source"
            options={[["all","All sources"], ...sources.map((s) => [s, s] as [string,string])]} />
          <FilterSelect value={timeWin} onChange={setTimeWin} placeholder="Time"
            options={[["all","Any time"],["1h","Last hour"],["24h","Last 24h"],["7d","Last 7d"],["30d","Last 30d"]]} />
          {filtersActive && (
            <Button variant="ghost" size="sm" onClick={clearFilters}><X className="w-3.5 h-3.5 mr-1" /> Clear</Button>
          )}
        </div>
        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t">
            <Badge variant="secondary">{selected.size} selected</Badge>
            <Button size="sm" variant="outline" disabled={bulkBusy} onClick={() => bulkUpdate({ status: "closed" } as any)}>
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Close
            </Button>
            <Button size="sm" variant="outline" disabled={bulkBusy} onClick={() => bulkUpdate({ ai_verdict: "false_positive", status: "closed" } as any)}>
              Mark FP
            </Button>
            <Button size="sm" variant="outline" disabled={bulkBusy} onClick={() => bulkUpdate({ status: "triaging" } as any)}>
              Triage
            </Button>
            <Button size="sm" variant="outline" disabled={bulkBusy} onClick={bulkDelete}>
              <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        )}
      </Card>

      {/* Split view: list + detail pane */}
      <div className="grid lg:grid-cols-5 gap-4">
        <Card className="overflow-hidden lg:col-span-3">
          <div className="px-4 py-3 border-b flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <Checkbox checked={allSelected} onCheckedChange={(c) => selectAllVisible(!!c)} />
              <div className="font-semibold flex items-center gap-2"><Workflow className="w-4 h-4" /> Inbox <span className="text-xs text-muted-foreground">({filtered.length})</span></div>
            </div>
            <Button size="sm" variant="ghost" onClick={seedDemo}><Plus className="w-3.5 h-3.5 mr-1" /> Demo</Button>
          </div>
          {loading ? (
            <div className="p-10 text-center text-muted-foreground"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground">
              {alerts.length === 0 ? "No alerts yet. Connect a SIEM or seed demo data." : "No alerts match your filters."}
            </div>
          ) : (
            <ScrollArea className="max-h-[640px]">
              <div className="divide-y">
                {filtered.sort((a, b) => (SEV_RANK[b.severity] ?? 0) - (SEV_RANK[a.severity] ?? 0)).map((a) => {
                  const investigated = a.status === "investigated";
                  const isActive = a.id === activeId;
                  return (
                    <div key={a.id}
                      className={`p-3 flex items-center gap-3 cursor-pointer transition-colors ${isActive ? "bg-primary/5 border-l-2 border-l-primary" : "hover:bg-muted/30"}`}
                      onClick={() => setActiveId(a.id)}>
                      <div onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={selected.has(a.id)} onCheckedChange={() => toggleSel(a.id)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border font-mono ${sevColor[a.severity] ?? sevColor.low}`}>{a.severity}</span>
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">{a.source}</span>
                          <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border font-mono ${verdictColor[a.ai_verdict] ?? verdictColor.pending}`}>
                            {a.ai_verdict.replace("_", " ")}
                            {a.ai_confidence != null && ` · ${Math.round(Number(a.ai_confidence) * 100)}%`}
                          </span>
                          <span className="text-[10px] text-muted-foreground font-mono ml-auto">{relTime(a.received_at)}</span>
                        </div>
                        <div className="text-sm mt-1 truncate">{a.title}</div>
                      </div>
                      {!locked && !investigated && (
                        <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); investigate(a.id); }} disabled={investigatingId === a.id}>
                          {investigatingId === a.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Brain className="w-3.5 h-3.5" />}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </Card>

        {/* Detail pane */}
        <Card className="lg:col-span-2 p-4 min-h-[300px]">
          {!activeAlert ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground py-10">
              <Brain className="w-8 h-8 mb-2 opacity-50" />
              <div className="text-sm">Select an alert to preview</div>
              <div className="text-xs">Reasoning, entities & actions appear here</div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-mono text-muted-foreground">{activeAlert.source} · {relTime(activeAlert.received_at)}</div>
                  <div className="font-semibold text-sm leading-snug">{activeAlert.title}</div>
                </div>
                <Button size="icon" variant="ghost" onClick={() => setActiveId(null)}><X className="w-4 h-4" /></Button>
              </div>
              <div className="flex flex-wrap gap-1">
                <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border font-mono ${sevColor[activeAlert.severity] ?? sevColor.low}`}>{activeAlert.severity}</span>
                <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border font-mono ${verdictColor[activeAlert.ai_verdict] ?? verdictColor.pending}`}>
                  {activeAlert.ai_verdict.replace("_", " ")}
                  {activeAlert.ai_confidence != null && ` · ${Math.round(Number(activeAlert.ai_confidence) * 100)}%`}
                </span>
                {activeAlert.mitre_tactics?.map((t) => <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>)}
              </div>

              {activeInvLoading ? (
                <div className="py-6 text-center"><Loader2 className="w-4 h-4 mx-auto animate-spin text-muted-foreground" /></div>
              ) : activeInv ? (
                <>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-1">Summary</div>
                    <p className="text-xs leading-relaxed">{activeInv.summary}</p>
                  </div>
                  {Array.isArray(activeInv.reasoning_steps) && activeInv.reasoning_steps.length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-1">Reasoning ({activeInv.reasoning_steps.length} steps)</div>
                      <ol className="space-y-1.5">
                        {activeInv.reasoning_steps.slice(0, 3).map((s: any, i: number) => (
                          <li key={i} className="text-xs border-l-2 border-primary/40 pl-2">
                            <div className="font-medium">{i + 1}. {s.step}</div>
                            <div className="text-muted-foreground line-clamp-2">{s.evidence}</div>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                  {Array.isArray(activeInv.recommended_actions) && activeInv.recommended_actions.length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-1">Top recommendation</div>
                      <div className="text-xs p-2 rounded border bg-muted/30 flex gap-2">
                        <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                        <span>{activeInv.recommended_actions[0].title}</span>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="py-3 text-xs text-muted-foreground">No investigation yet.</div>
              )}

              <div className="flex gap-2 pt-2 border-t">
                {!locked && activeAlert.status !== "investigated" && (
                  <Button size="sm" onClick={() => investigate(activeAlert.id)} disabled={investigatingId === activeAlert.id} className="flex-1">
                    {investigatingId === activeAlert.id
                      ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Investigating…</>
                      : <><Brain className="w-3.5 h-3.5 mr-1" /> Investigate</>}
                  </Button>
                )}
                <Button size="sm" variant="outline" asChild className="flex-1">
                  <Link to={`/ai-soc/${activeAlert.id}`}>Open <ChevronRight className="w-3.5 h-3.5 ml-1" /></Link>
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}

function Stat({ icon: Icon, label, value, accent }: { icon: any; label: string; value: number; accent?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono uppercase tracking-wider"><Icon className={`w-3.5 h-3.5 ${accent ?? ""}`} /> {label}</div>
      <div className={`text-2xl font-semibold mt-1 ${accent ?? ""}`}>{value}</div>
    </Card>
  );
}

function FilterSelect({ value, onChange, options, placeholder }:
  { value: string; onChange: (v: string) => void; options: [string, string][]; placeholder: string }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-auto min-w-[120px]"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

const VERDICT_COLORS: Record<string, string> = {
  true_positive: "bg-destructive",
  false_positive: "bg-muted-foreground",
  benign: "bg-emerald-500",
  needs_human: "bg-amber-500",
  pending: "bg-secondary-foreground/30",
};
function VerdictBars({ data, total }: { data: Record<string, number>; total: number }) {
  const order = ["true_positive", "needs_human", "benign", "false_positive", "pending"];
  if (total === 0) return <div className="text-xs text-muted-foreground">No alerts in view.</div>;
  return (
    <div className="space-y-2">
      <div className="flex h-2 rounded overflow-hidden bg-muted">
        {order.map((k) => {
          const n = data[k] ?? 0;
          if (!n) return null;
          return <div key={k} className={VERDICT_COLORS[k] ?? "bg-muted"} style={{ width: `${(n / total) * 100}%` }} />;
        })}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        {order.map((k) => (
          <div key={k} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${VERDICT_COLORS[k]}`} />
            <span className="text-muted-foreground capitalize">{k.replace("_", " ")}</span>
            <span className="ml-auto font-mono">{data[k] ?? 0}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function relTime(iso: string) {
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}
