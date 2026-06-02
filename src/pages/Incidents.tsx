import { useEffect, useState, useMemo } from "react";
import { AppShell } from "@/components/cspm/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  AlertTriangle, BookOpenCheck, Plus, Trash2, Sparkles, Loader2,
  MessageSquare, Search, Wrench, Megaphone, ShieldAlert, CheckSquare,
  Activity, Clock, CheckCircle2, XCircle, Copy, Save, Zap,
  Globe, Hash, User, Skull, Shield, Filter, BarChart3,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getSessionId } from "@/lib/session";
import { PLAYBOOKS, findPlaybook } from "@/lib/playbooks";
import { draftFromFinding, shouldAutoIncident } from "@/lib/autoIncident";
import { toast } from "sonner";
import { format, formatDistanceToNow, subDays } from "date-fns";

// ── Types ─────────────────────────────────────────────────────────────────────

type EventType = "note" | "investigation" | "remediation" | "comms" | "status_change" | "playbook_step" | "ioc_added" | "ioc_removed";

type TimelineEvent = {
  at: string;
  note: string;
  type?: EventType;
};

type IOC = {
  id: string;
  kind: "ip" | "domain" | "hash" | "account";
  value: string;
  description: string;
  addedAt: string;
};

type Incident = {
  id: string;
  title: string;
  severity: string;
  status: string;
  playbook: string | null;
  summary: string | null;
  timeline: TimelineEvent[];
  detected_at: string;
  resolved_at: string | null;
  iocs?: IOC[];
  playbook_checks?: Record<number, boolean>;
  postmortem?: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const SEV_COLORS: Record<string, string> = {
  critical: "text-destructive border-destructive/50 bg-destructive/10",
  high: "text-orange-500 border-orange-400/50 bg-orange-50 dark:bg-orange-950/20",
  medium: "text-yellow-600 border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20",
};

const STATUS_COLORS: Record<string, string> = {
  open: "text-destructive bg-destructive/10",
  contained: "text-yellow-600 bg-yellow-100 dark:bg-yellow-950/30",
  resolved: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20",
};

const STATUS_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  open: XCircle,
  contained: ShieldAlert,
  resolved: CheckCircle2,
};

const EVENT_META: Record<EventType, { icon: React.ComponentType<{ className?: string }>; color: string; label: string }> = {
  note:          { icon: MessageSquare,  color: "text-muted-foreground",  label: "Note" },
  investigation: { icon: Search,         color: "text-blue-500",           label: "Investigation" },
  remediation:   { icon: Wrench,         color: "text-orange-500",         label: "Remediation" },
  comms:         { icon: Megaphone,      color: "text-purple-500",         label: "Comms" },
  status_change: { icon: ShieldAlert,   color: "text-emerald-500",        label: "Status" },
  playbook_step: { icon: CheckSquare,   color: "text-teal-500",           label: "Playbook" },
  ioc_added:     { icon: Skull,          color: "text-red-500",            label: "IOC Added" },
  ioc_removed:   { icon: Activity,       color: "text-muted-foreground",   label: "IOC Removed" },
};

const IOC_KIND_META: Record<IOC["kind"], { icon: React.ComponentType<{ className?: string }>; label: string }> = {
  ip:      { icon: Globe, label: "IP Address" },
  domain:  { icon: Globe, label: "Domain" },
  hash:    { icon: Hash,  label: "File Hash" },
  account: { icon: User,  label: "Account" },
};

function sevColor(s: string) {
  return s === "critical" ? "text-destructive" : s === "high" ? "text-orange-500" : "text-yellow-600";
}

// ── Component ─────────────────────────────────────────────────────────────────

const Incidents = () => {
  const [items, setItems]         = useState<Incident[]>([]);
  const [loading, setLoading]     = useState(true);
  const [open, setOpen]           = useState(false);
  const [active, setActive]       = useState<Incident | null>(null);
  const [newNote, setNewNote]     = useState("");
  const [noteType, setNoteType]   = useState<EventType>("note");
  const [detailTab, setDetailTab] = useState("timeline");
  const [form, setForm]           = useState({ title: "", severity: "high", playbook: "leaked-secret", summary: "" });
  const [autoCount, setAutoCount] = useState(0);
  const [autoBusy, setAutoBusy]   = useState(false);
  // Filters
  const [search, setSearch]       = useState("");
  const [filterSev, setFilterSev] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  // IOC form
  const [iocKind, setIocKind]     = useState<IOC["kind"]>("ip");
  const [iocValue, setIocValue]   = useState("");
  const [iocDesc, setIocDesc]     = useState("");
  // Post-mortem
  const [pmText, setPmText]       = useState("");
  const [pmGenerating, setPmGenerating] = useState(false);
  const [pmSaving, setPmSaving]   = useState(false);

  // ── Data loading ────────────────────────────────────────────────────────────

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("incidents").select("*").order("detected_at", { ascending: false });
    if (error) toast.error(error.message);
    setItems((data ?? []) as Incident[]);
    setLoading(false);
    await checkAutoEligible((data ?? []) as Incident[]);
  };

  const checkAutoEligible = async (existing: Incident[]) => {
    const since = subDays(new Date(), 30).toISOString();
    const { data } = await supabase.from("findings").select("*")
      .in("severity", ["critical", "high"]).gte("created_at", since);
    const findings = (data ?? []).filter(shouldAutoIncident);
    const existingTitles = new Set(existing.map((i) => i.title));
    setAutoCount(findings.filter((f) => !existingTitles.has(draftFromFinding(f).title)).length);
  };

  const runAutoSync = async () => {
    setAutoBusy(true);
    try {
      const since = subDays(new Date(), 30).toISOString();
      const { data: findings } = await supabase.from("findings").select("*")
        .in("severity", ["critical", "high"]).gte("created_at", since);
      const existingTitles = new Set(items.map((i) => i.title));
      const drafts = (findings ?? []).filter(shouldAutoIncident).map(draftFromFinding)
        .filter((d) => !existingTitles.has(d.title));
      if (!drafts.length) { toast.info("No new findings need an incident."); return; }
      const rows = drafts.map((d) => ({
        session_id: getSessionId(), title: d.title, severity: d.severity,
        playbook: d.playbook, summary: d.summary,
        timeline: [{ at: new Date().toISOString(), note: `Auto-opened from finding (${d.resource})`, type: "note" }],
      }));
      const { error } = await (supabase as any).from("incidents").insert(rows);
      if (error) throw error;
      toast.success(`Opened ${drafts.length} incident${drafts.length === 1 ? "" : "s"} from findings.`);
      load();
    } catch (e: any) { toast.error(e?.message ?? "Auto-sync failed"); }
    finally { setAutoBusy(false); }
  };

  useEffect(() => { load(); document.title = "Incident Response — SentinelCSPM"; }, []);

  // ── Mutations ───────────────────────────────────────────────────────────────

  const create = async () => {
    if (!form.title.trim()) return toast.error("Title required");
    const { error } = await (supabase as any).from("incidents").insert({
      session_id: getSessionId(), title: form.title.trim(),
      severity: form.severity, playbook: form.playbook,
      summary: form.summary || null,
      timeline: [{ at: new Date().toISOString(), note: "Incident opened", type: "note" }],
    });
    if (error) return toast.error(error.message);
    setOpen(false);
    setForm({ title: "", severity: "high", playbook: "leaked-secret", summary: "" });
    load();
  };

  const persistTimeline = async (inc: Incident, tl: TimelineEvent[]) => {
    const { error } = await (supabase as any).from("incidents")
      .update({ timeline: tl, updated_at: new Date().toISOString() }).eq("id", inc.id);
    if (error) { toast.error(error.message); return false; }
    return true;
  };

  const addNote = async () => {
    if (!active || !newNote.trim()) return;
    const entry: TimelineEvent = { at: new Date().toISOString(), note: newNote.trim(), type: noteType };
    const tl = [...active.timeline, entry];
    const ok = await persistTimeline(active, tl);
    if (!ok) return;
    setActive({ ...active, timeline: tl });
    setNewNote("");
    load();
  };

  const setStatus = async (status: string) => {
    if (!active) return;
    const patch: any = { status, updated_at: new Date().toISOString() };
    if (status === "resolved") patch.resolved_at = new Date().toISOString();
    const statusEntry: TimelineEvent = {
      at: new Date().toISOString(), note: `Status changed to ${status}`, type: "status_change",
    };
    const tl = [...active.timeline, statusEntry];
    patch.timeline = tl;
    const { error } = await (supabase as any).from("incidents").update(patch).eq("id", active.id);
    if (error) return toast.error(error.message);
    setActive({ ...active, status, timeline: tl, resolved_at: patch.resolved_at ?? active.resolved_at });
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this incident record?")) return;
    await (supabase as any).from("incidents").delete().eq("id", id);
    if (active?.id === id) setActive(null);
    load();
  };

  // ── Playbook checklist ──────────────────────────────────────────────────────

  const togglePlaybookStep = async (stepIdx: number, stepText: string, checked: boolean) => {
    if (!active) return;
    const checks = { ...(active.playbook_checks ?? {}), [stepIdx]: checked };
    const entry: TimelineEvent = {
      at: new Date().toISOString(),
      note: `Playbook step ${checked ? "✓ completed" : "unchecked"}: ${stepText.slice(0, 80)}`,
      type: "playbook_step",
    };
    const tl = [...active.timeline, entry];
    const { error } = await (supabase as any).from("incidents")
      .update({ timeline: tl, playbook_checks: checks, updated_at: new Date().toISOString() })
      .eq("id", active.id);
    if (error) return toast.error(error.message);
    setActive({ ...active, timeline: tl, playbook_checks: checks });
    load();
  };

  // ── IOC Tracker ─────────────────────────────────────────────────────────────

  const addIOC = async () => {
    if (!active || !iocValue.trim()) return;
    const ioc: IOC = {
      id: crypto.randomUUID(), kind: iocKind,
      value: iocValue.trim(), description: iocDesc.trim(),
      addedAt: new Date().toISOString(),
    };
    const iocs = [...(active.iocs ?? []), ioc];
    const entry: TimelineEvent = {
      at: new Date().toISOString(),
      note: `IOC added [${IOC_KIND_META[iocKind].label}]: ${iocValue.trim()}${iocDesc.trim() ? ` — ${iocDesc.trim()}` : ""}`,
      type: "ioc_added",
    };
    const tl = [...active.timeline, entry];
    const { error } = await (supabase as any).from("incidents")
      .update({ iocs, timeline: tl, updated_at: new Date().toISOString() }).eq("id", active.id);
    if (error) return toast.error(error.message);
    setActive({ ...active, iocs, timeline: tl });
    setIocValue(""); setIocDesc("");
    load();
  };

  const removeIOC = async (iocId: string, iocVal: string) => {
    if (!active) return;
    const iocs = (active.iocs ?? []).filter((i) => i.id !== iocId);
    const entry: TimelineEvent = {
      at: new Date().toISOString(), note: `IOC removed: ${iocVal}`, type: "ioc_removed",
    };
    const tl = [...active.timeline, entry];
    const { error } = await (supabase as any).from("incidents")
      .update({ iocs, timeline: tl, updated_at: new Date().toISOString() }).eq("id", active.id);
    if (error) return toast.error(error.message);
    setActive({ ...active, iocs, timeline: tl });
    load();
  };

  // ── Post-Mortem ─────────────────────────────────────────────────────────────

  const generatePostMortem = async () => {
    if (!active) return;
    setPmGenerating(true);
    await new Promise((r) => setTimeout(r, 1200)); // Simulate AI generation
    const pb = findPlaybook(active.playbook);
    const duration = active.resolved_at
      ? `${Math.round((new Date(active.resolved_at).getTime() - new Date(active.detected_at).getTime()) / 60000)} minutes`
      : "Ongoing";
    const iocList = (active.iocs ?? []).map((i) => `- **${IOC_KIND_META[i.kind].label}**: \`${i.value}\` — ${i.description || "No description"}`).join("\n") || "- None identified";
    const steps = pb?.steps.map((s, idx) => `${idx + 1}. ${s}`).join("\n") || "- N/A";
    const draft = `# Post-Mortem: ${active.title}

**Date:** ${format(new Date(active.detected_at), "MMMM d, yyyy")}
**Severity:** ${active.severity.toUpperCase()}
**Status:** ${active.status}
**Detection → Resolution:** ${duration}

---

## Executive Summary

${active.summary ?? "An incident was detected and managed through the standard response process."}

## Timeline of Events

${active.timeline
  .map((t) => `- **${format(new Date(t.at), "MMM d HH:mm")}** — ${t.note}`)
  .join("\n")}

## Indicators of Compromise (IOCs)

${iocList}

## Playbook Applied: ${pb?.title ?? "None"}

${steps}

## Root Cause Analysis

_[Analyst to complete: Describe the underlying technical and process failures that led to this incident.]_

## Impact

_[Analyst to complete: Describe customer impact, data exposure, downtime, or reputational risk.]_

## Corrective Actions

- [ ] _[Action 1: short-term fix]_
- [ ] _[Action 2: long-term prevention]_
- [ ] _[Action 3: monitoring / detection improvement]_

## Lessons Learned

_[Analyst to complete: What worked well? What should be improved?]_

---
*Report generated by SentinelCSPM Incident Response — ${format(new Date(), "PPpp")}*
`;
    setPmText(draft);
    setPmGenerating(false);
  };

  const savePostMortem = async () => {
    if (!active || !pmText.trim()) return;
    setPmSaving(true);
    const { error } = await (supabase as any).from("incidents")
      .update({ summary: pmText, updated_at: new Date().toISOString() }).eq("id", active.id);
    setPmSaving(false);
    if (error) return toast.error(error.message);
    setActive({ ...active, summary: pmText });
    toast.success("Post-mortem saved to incident.");
    load();
  };

  // ── Derived ─────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => items.filter((i) => {
    const matchSearch = !search || i.title.toLowerCase().includes(search.toLowerCase()) ||
      (i.summary ?? "").toLowerCase().includes(search.toLowerCase());
    const matchSev = filterSev === "all" || i.severity === filterSev;
    const matchStatus = filterStatus === "all" || i.status === filterStatus;
    return matchSearch && matchSev && matchStatus;
  }), [items, search, filterSev, filterStatus]);

  const stats = useMemo(() => ({
    open:      items.filter((i) => i.status === "open").length,
    contained: items.filter((i) => i.status === "contained").length,
    resolved:  items.filter((i) => i.status === "resolved").length,
    critical:  items.filter((i) => i.severity === "critical").length,
  }), [items]);

  const pb = active?.playbook ? findPlaybook(active.playbook) : null;
  const playbookChecks = active?.playbook_checks ?? {};
  const totalSteps = pb?.steps.length ?? 0;
  const completedSteps = Object.values(playbookChecks).filter(Boolean).length;
  const playbookProgress = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  // When we switch active incident, sync postmortem text
  useEffect(() => {
    if (active?.summary && active.summary.startsWith("# Post-Mortem:")) {
      setPmText(active.summary);
    } else {
      setPmText("");
    }
  }, [active?.id]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <AppShell>
      {/* Header */}
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Incident Response</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Pre-built playbooks, IOC tracking, timeline auditing, and post-mortem generation for security analysts.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" />Open incident</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Open a new incident</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <div>
                <Label>Title</Label>
                <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. AWS access key leaked on GitHub" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Severity</Label>
                  <Select value={form.severity} onValueChange={v => setForm({ ...form, severity: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="critical">critical</SelectItem>
                      <SelectItem value="high">high</SelectItem>
                      <SelectItem value="medium">medium</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Playbook</Label>
                  <Select value={form.playbook} onValueChange={v => setForm({ ...form, playbook: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{PLAYBOOKS.map(p => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Initial summary</Label><Textarea rows={3} value={form.summary} onChange={e => setForm({ ...form, summary: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={create}>Open incident</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: "Open", value: stats.open, icon: XCircle, color: "text-destructive" },
          { label: "Contained", value: stats.contained, icon: ShieldAlert, color: "text-yellow-600" },
          { label: "Resolved", value: stats.resolved, icon: CheckCircle2, color: "text-emerald-600" },
          { label: "Critical", value: stats.critical, icon: AlertTriangle, color: "text-destructive" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="surface-card p-4 flex items-center gap-3">
            <div className={`w-9 h-9 grid place-items-center rounded-md bg-secondary ${color}`}>
              <Icon className="w-4 h-4" />
            </div>
            <div>
              <div className="text-2xl font-bold">{value}</div>
              <div className="text-[11px] text-muted-foreground font-mono uppercase">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Auto-sync banner */}
      {autoCount > 0 && (
        <div className="surface-card p-4 mb-6 flex items-center justify-between gap-4 border-primary/40">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 grid place-items-center rounded-md bg-primary/10 text-primary shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium">
                {autoCount} critical / high finding{autoCount === 1 ? "" : "s"} without an incident
              </div>
              <div className="text-xs text-muted-foreground">
                Auto-open them with the right playbook attached — one click, audit-ready timeline.
              </div>
            </div>
          </div>
          <Button onClick={runAutoSync} disabled={autoBusy} size="sm">
            {autoBusy ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Opening…</> : <><Sparkles className="w-4 h-4 mr-2" />Auto-open {autoCount}</>}
          </Button>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* ── Left panel ─────────────────────────────────────────────────── */}
        <div className="lg:col-span-1 space-y-3">

          {/* Search + filter */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-8 h-8 text-sm" placeholder="Search incidents…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={filterSev} onValueChange={setFilterSev}>
              <SelectTrigger className="h-8 w-28 text-xs"><Filter className="w-3 h-3 mr-1" /><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severity</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-8 w-28 text-xs"><BarChart3 className="w-3 h-3 mr-1" /><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="contained">Contained</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Incident list */}
          <div className="text-xs font-mono uppercase text-muted-foreground tracking-wider">
            Incidents ({filtered.length}{filtered.length !== items.length ? ` / ${items.length}` : ""})
          </div>
          {loading ? (
            <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="surface-card p-6 text-center text-sm text-muted-foreground">
              <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
              {items.length === 0 ? "No incidents logged. Open one or use it for tabletop drills." : "No incidents match your filters."}
            </div>
          ) : filtered.map(i => {
            const StatusIcon = STATUS_ICONS[i.status] ?? Shield;
            return (
              <button key={i.id} onClick={() => { setActive(i); setDetailTab("timeline"); }}
                className={`w-full text-left surface-card p-4 hover:border-primary/40 transition-colors ${active?.id === i.id ? "border-primary/60" : ""}`}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-medium truncate text-sm">{i.title}</span>
                  <Badge variant="outline" className={`text-[10px] shrink-0 ${SEV_COLORS[i.severity] ?? ""}`}>{i.severity}</Badge>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono">
                  <StatusIcon className={`w-3 h-3 ${STATUS_COLORS[i.status]?.split(" ")[0] ?? ""}`} />
                  <span>{i.status}</span>
                  <span>·</span>
                  <Clock className="w-3 h-3" />
                  <span>{formatDistanceToNow(new Date(i.detected_at), { addSuffix: true })}</span>
                </div>
                {i.iocs && i.iocs.length > 0 && (
                  <div className="mt-1.5 flex items-center gap-1 text-[10px] text-red-500">
                    <Skull className="w-2.5 h-2.5" />{i.iocs.length} IOC{i.iocs.length !== 1 ? "s" : ""} tracked
                  </div>
                )}
              </button>
            );
          })}

          {/* Playbook library */}
          <div className="text-xs font-mono uppercase text-muted-foreground tracking-wider pt-2">Playbook Library</div>
          {PLAYBOOKS.map(p => (
            <div key={p.id} className="surface-card p-3">
              <div className="flex items-center gap-2 mb-1">
                <BookOpenCheck className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">{p.title}</span>
                <Badge variant="outline" className={`ml-auto text-[10px] ${SEV_COLORS[p.severity] ?? ""}`}>{p.severity}</Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">{p.description}</p>
            </div>
          ))}
        </div>

        {/* ── Right panel ─────────────────────────────────────────────────── */}
        <div className="lg:col-span-2">
          {!active ? (
            <div className="surface-card p-12 text-center text-sm text-muted-foreground">
              <Shield className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
              Select an incident to see its playbook, timeline, IOC tracker and post-mortem tools.
            </div>
          ) : (
            <div className="surface-card p-6 space-y-5">
              {/* Incident header */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-xl font-semibold">{active.title}</h2>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground font-mono mt-1">
                    <span>Detected {format(new Date(active.detected_at), "MMM d, yyyy HH:mm")}</span>
                    <span>·</span>
                    <span className={sevColor(active.severity)}>severity: {active.severity}</span>
                    {active.resolved_at && (
                      <><span>·</span><span className="text-emerald-600">resolved {formatDistanceToNow(new Date(active.resolved_at), { addSuffix: true })}</span></>
                    )}
                  </div>
                </div>
                <Button size="icon" variant="ghost" onClick={() => remove(active.id)}>
                  <Trash2 className="w-4 h-4 text-muted-foreground" />
                </Button>
              </div>

              {/* Status buttons */}
              <div className="flex gap-2">
                {(["open", "contained", "resolved"] as const).map(s => {
                  const Icon = STATUS_ICONS[s];
                  return (
                    <Button key={s} size="sm"
                      variant={active.status === s ? "default" : "outline"}
                      onClick={() => setStatus(s)}
                      className="gap-1.5 capitalize">
                      <Icon className="w-3.5 h-3.5" />{s}
                    </Button>
                  );
                })}
              </div>

              {/* Tabbed content */}
              <Tabs value={detailTab} onValueChange={setDetailTab}>
                <TabsList className="grid grid-cols-3 w-full">
                  <TabsTrigger value="timeline">Timeline & Playbook</TabsTrigger>
                  <TabsTrigger value="ioc" className="flex items-center gap-1.5">
                    IOC Tracker
                    {(active.iocs ?? []).length > 0 && (
                      <Badge className="h-4 px-1 text-[9px] bg-red-500 text-white border-0">{(active.iocs ?? []).length}</Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="postmortem">Post-Mortem</TabsTrigger>
                </TabsList>

                {/* ── Timeline & Playbook ──────────────────────────────── */}
                <TabsContent value="timeline" className="space-y-5 mt-4">
                  {/* Playbook checklist */}
                  {pb && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-mono uppercase text-muted-foreground tracking-wider">
                          Playbook · {pb.title}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {completedSteps}/{totalSteps} steps
                        </span>
                      </div>
                      <Progress value={playbookProgress} className="h-1.5 mb-3" />
                      <ol className="space-y-2">
                        {pb.steps.map((step, idx) => {
                          const done = !!playbookChecks[idx];
                          return (
                            <li key={idx} className="flex items-start gap-3">
                              <button
                                onClick={() => togglePlaybookStep(idx, step, !done)}
                                className={`mt-0.5 w-4 h-4 shrink-0 rounded border-2 transition-colors flex items-center justify-center
                                  ${done ? "bg-teal-500 border-teal-500" : "border-muted-foreground/40 hover:border-teal-400"}`}
                              >
                                {done && <CheckSquare className="w-3 h-3 text-white" />}
                              </button>
                              <span className={`text-sm leading-snug ${done ? "line-through text-muted-foreground" : ""}`}>{step}</span>
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  )}

                  {/* Timeline */}
                  <div>
                    <div className="text-xs font-mono uppercase text-muted-foreground tracking-wider mb-3">Timeline</div>
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {[...active.timeline].reverse().map((t, i) => {
                        const etype = (t.type ?? "note") as EventType;
                        const meta = EVENT_META[etype] ?? EVENT_META.note;
                        const Icon = meta.icon;
                        return (
                          <div key={i} className="flex gap-2.5 text-sm group">
                            <div className={`mt-0.5 w-5 h-5 shrink-0 flex items-center justify-center rounded-full bg-secondary ${meta.color}`}>
                              <Icon className="w-3 h-3" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-[10px] text-muted-foreground font-mono">
                                {format(new Date(t.at), "MMM d HH:mm")}
                                {etype !== "note" && <span className={`ml-1.5 uppercase tracking-wider text-[9px] px-1 py-0.5 rounded ${meta.color} bg-secondary`}>{meta.label}</span>}
                              </div>
                              <div className="text-sm mt-0.5">{t.note}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Add note */}
                    <div className="flex gap-2 mt-3">
                      <Select value={noteType} onValueChange={(v) => setNoteType(v as EventType)}>
                        <SelectTrigger className="h-9 w-40 text-xs shrink-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(["note", "investigation", "remediation", "comms"] as const).map(t => (
                            <SelectItem key={t} value={t} className="text-xs capitalize">{EVENT_META[t].label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input value={newNote} onChange={e => setNewNote(e.target.value)}
                        placeholder="Add a timeline entry…"
                        className="h-9 text-sm"
                        onKeyDown={e => e.key === "Enter" && addNote()} />
                      <Button onClick={addNote} disabled={!newNote.trim()} size="sm">Add</Button>
                    </div>
                  </div>
                </TabsContent>

                {/* ── IOC Tracker ─────────────────────────────────────── */}
                <TabsContent value="ioc" className="mt-4 space-y-4">
                  <div className="text-xs text-muted-foreground">
                    Track Indicators of Compromise associated with this incident. All additions/removals are logged to the timeline.
                  </div>

                  {/* IOC add form */}
                  <div className="flex gap-2 items-end">
                    <div>
                      <Label className="text-xs mb-1 block">Type</Label>
                      <Select value={iocKind} onValueChange={(v) => setIocKind(v as IOC["kind"])}>
                        <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(["ip", "domain", "hash", "account"] as const).map(k => (
                            <SelectItem key={k} value={k} className="text-xs">{IOC_KIND_META[k].label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1">
                      <Label className="text-xs mb-1 block">Value</Label>
                      <Input className="h-8 text-sm font-mono" placeholder={iocKind === "ip" ? "198.51.100.42" : iocKind === "domain" ? "evil.example.com" : iocKind === "hash" ? "sha256:abc123…" : "user@domain.com"} value={iocValue} onChange={e => setIocValue(e.target.value)} />
                    </div>
                    <div className="flex-1">
                      <Label className="text-xs mb-1 block">Description (optional)</Label>
                      <Input className="h-8 text-sm" placeholder="e.g. C2 server, attacker account…" value={iocDesc} onChange={e => setIocDesc(e.target.value)} />
                    </div>
                    <Button size="sm" className="h-8" onClick={addIOC} disabled={!iocValue.trim()}>
                      <Plus className="w-3.5 h-3.5 mr-1" />Add
                    </Button>
                  </div>

                  {/* IOC table */}
                  {(active.iocs ?? []).length === 0 ? (
                    <div className="text-sm text-muted-foreground text-center py-8 border border-dashed border-border rounded-lg">
                      <Skull className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                      No IOCs tracked yet. Add IP addresses, domains, file hashes, or compromised accounts.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {(active.iocs ?? []).map(ioc => {
                        const KindIcon = IOC_KIND_META[ioc.kind].icon;
                        return (
                          <div key={ioc.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 border border-border/60 group">
                            <div className="w-7 h-7 shrink-0 flex items-center justify-center rounded-full bg-red-500/10 text-red-500">
                              <KindIcon className="w-3.5 h-3.5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-mono text-sm text-red-600 dark:text-red-400 truncate">{ioc.value}</div>
                              <div className="text-[11px] text-muted-foreground">
                                {IOC_KIND_META[ioc.kind].label}
                                {ioc.description && <> · {ioc.description}</>}
                                <span className="ml-1 opacity-60">· added {formatDistanceToNow(new Date(ioc.addedAt), { addSuffix: true })}</span>
                              </div>
                            </div>
                            <Button size="icon" variant="ghost" className="w-7 h-7 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => removeIOC(ioc.id, ioc.value)}>
                              <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>

                {/* ── Post-Mortem ─────────────────────────────────────── */}
                <TabsContent value="postmortem" className="mt-4 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs text-muted-foreground">
                      Generate a structured Root Cause Analysis / Post-Mortem report from this incident's data. Edit and save it back to the incident.
                    </div>
                    <Button size="sm" onClick={generatePostMortem} disabled={pmGenerating} className="shrink-0">
                      {pmGenerating
                        ? <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />Generating…</>
                        : <><Zap className="w-3.5 h-3.5 mr-2" />Generate Report</>}
                    </Button>
                  </div>

                  {pmText ? (
                    <>
                      <Textarea
                        className="font-mono text-xs min-h-[360px] resize-y"
                        value={pmText}
                        onChange={e => setPmText(e.target.value)}
                        placeholder="Post-mortem will appear here…"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(pmText); toast.success("Copied to clipboard"); }}>
                          <Copy className="w-3.5 h-3.5 mr-1.5" />Copy
                        </Button>
                        <Button size="sm" onClick={savePostMortem} disabled={pmSaving}>
                          {pmSaving ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Saving…</> : <><Save className="w-3.5 h-3.5 mr-1.5" />Save to Incident</>}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-muted-foreground text-center py-12 border border-dashed border-border rounded-lg">
                      <Activity className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                      Click <strong>Generate Report</strong> to draft a post-mortem from this incident's timeline, playbook, and IOC data.
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
};

export default Incidents;
