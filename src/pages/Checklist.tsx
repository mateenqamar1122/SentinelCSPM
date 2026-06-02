import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/cspm/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import {
  CheckCircle2, ListChecks, Sparkles, Search, Plus, Trash2,
  Download, StickyNote, ChevronDown, ChevronUp, Filter,
  AlertTriangle, Clock, CheckSquare, Square, X, RefreshCw,
  Trophy, Flame, Shield, BarChart3, Users, Code2, Cloud,
  Database, ShoppingBag, UserCheck, Siren,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getSessionId } from "@/lib/session";
import { CHECKLIST_SEED } from "@/lib/checklistSeed";
import { toast } from "sonner";
import { format } from "date-fns";

// ── Types ─────────────────────────────────────────────────────────────────────

type Priority = "high" | "medium" | "low";

type Item = {
  id: string;
  category: string;
  title: string;
  description: string | null;
  priority: Priority;
  done: boolean;
  notes: string | null;
  framework: string;
};

type SortBy = "priority" | "title" | "status";
type FilterStatus = "all" | "done" | "todo";

// ── Helpers ───────────────────────────────────────────────────────────────────

const PRIORITY_META: Record<Priority, { label: string; color: string; icon: React.ComponentType<{ className?: string }>; order: number }> = {
  high:   { label: "High",   color: "text-red-500 border-red-400/50 bg-red-50 dark:bg-red-950/20",     icon: AlertTriangle, order: 0 },
  medium: { label: "Medium", color: "text-yellow-600 border-yellow-400/50 bg-yellow-50 dark:bg-yellow-950/20", icon: Clock, order: 1 },
  low:    { label: "Low",    color: "text-blue-500 border-blue-400/50 bg-blue-50 dark:bg-blue-950/20", icon: Shield, order: 2 },
};

const SORT_FN: Record<SortBy, (a: Item, b: Item) => number> = {
  priority: (a, b) => (PRIORITY_META[a.priority].order - PRIORITY_META[b.priority].order) || a.title.localeCompare(b.title),
  title:    (a, b) => a.title.localeCompare(b.title),
  status:   (a, b) => Number(a.done) - Number(b.done),
};

function scoreLabel(pct: number) {
  if (pct === 100) return { label: "Fully Compliant 🎉", color: "text-emerald-600" };
  if (pct >= 80)  return { label: "Almost There",       color: "text-emerald-600" };
  if (pct >= 60)  return { label: "Good Progress",      color: "text-yellow-600" };
  if (pct >= 40)  return { label: "Getting Started",    color: "text-orange-500" };
  return               { label: "Needs Attention",    color: "text-red-500" };
}

const ALL_CATEGORIES = ["Identity", "Code", "Cloud", "Data", "Vendor", "People", "Incident"];

const CAT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Identity: Users,
  Code:     Code2,
  Cloud:    Cloud,
  Data:     Database,
  Vendor:   ShoppingBag,
  People:   UserCheck,
  Incident: Siren,
};

// SVG circular ring gauge
const RingGauge = ({ pct, size = 72, stroke = 6, color }: { pct: number; size?: number; stroke?: number; color: string }) => {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor"
        className="text-secondary" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.6s ease" }} />
    </svg>
  );
};

// ── Component ─────────────────────────────────────────────────────────────────

const Checklist = () => {
  const [items, setItems]       = useState<Item[]>([]);
  const [loading, setLoading]   = useState(true);
  const [seeding, setSeeding]   = useState(false);
  // Filters & sort
  const [search, setSearch]     = useState("");
  const [filterPriority, setFilterPriority] = useState<Priority | "all">("all");
  const [filterStatus, setFilterStatus]     = useState<FilterStatus>("all");
  const [filterCat, setFilterCat]           = useState("all");
  const [sortBy, setSortBy]     = useState<SortBy>("priority");
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());
  // Note editing
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteText, setNoteText]       = useState("");
  // Custom item dialog
  const [addOpen, setAddOpen]   = useState(false);
  const [newItem, setNewItem]   = useState({ title: "", description: "", category: "Identity", priority: "high" as Priority });
  const [saving, setSaving]     = useState(false);
  // Celebration
  const [justCompleted, setJustCompleted] = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────────

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("checklist_items").select("*").order("category").order("priority");
    if (error) toast.error(error.message);
    setItems((data ?? []) as Item[]);
    setLoading(false);
  };

  useEffect(() => { load(); document.title = "Security Checklist — SentinelCSPM"; }, []);

  // ── Seed ─────────────────────────────────────────────────────────────────────

  const seed = async () => {
    setSeeding(true);
    const sid = getSessionId();
    const rows = CHECKLIST_SEED.map(s => ({ ...s, session_id: sid, framework: "starter" }));
    const { error } = await (supabase as any).from("checklist_items").insert(rows);
    setSeeding(false);
    if (error) return toast.error(error.message);
    toast.success(`Loaded ${rows.length} starter tasks`);
    load();
  };

  // ── Toggle ────────────────────────────────────────────────────────────────────

  const toggle = async (it: Item) => {
    const newDone = !it.done;
    const { error } = await (supabase as any)
      .from("checklist_items")
      .update({ done: newDone, updated_at: new Date().toISOString() })
      .eq("id", it.id);
    if (error) return toast.error(error.message);
    const updated = items.map(i => i.id === it.id ? { ...i, done: newDone } : i);
    setItems(updated);
    const doneNow = updated.filter(i => i.done).length;
    if (newDone && doneNow === updated.length && updated.length > 0) {
      setJustCompleted(true);
      setTimeout(() => setJustCompleted(false), 4000);
    }
  };

  // ── Bulk actions ──────────────────────────────────────────────────────────────

  const markAllInCategory = async (cat: string, done: boolean) => {
    const targets = items.filter(i => i.category === cat && i.done !== done);
    if (!targets.length) return;
    await Promise.all(targets.map(i =>
      (supabase as any).from("checklist_items").update({ done, updated_at: new Date().toISOString() }).eq("id", i.id)
    ));
    setItems(items.map(i => i.category === cat ? { ...i, done } : i));
    toast.success(`Marked ${targets.length} items as ${done ? "done" : "todo"}`);
  };

  const markAllVisible = async (done: boolean) => {
    const targets = filtered.filter(i => i.done !== done);
    if (!targets.length) return;
    await Promise.all(targets.map(i =>
      (supabase as any).from("checklist_items").update({ done, updated_at: new Date().toISOString() }).eq("id", i.id)
    ));
    setItems(items.map(i => targets.find(t => t.id === i.id) ? { ...i, done } : i));
    toast.success(`Marked ${targets.length} items as ${done ? "done" : "todo"}`);
  };

  // ── Notes ─────────────────────────────────────────────────────────────────────

  const saveNote = async (id: string) => {
    const { error } = await (supabase as any)
      .from("checklist_items")
      .update({ notes: noteText.trim() || null, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    setItems(items.map(i => i.id === id ? { ...i, notes: noteText.trim() || null } : i));
    setEditingNote(null);
    toast.success("Note saved.");
  };

  // ── Delete item ───────────────────────────────────────────────────────────────

  const deleteItem = async (id: string) => {
    if (!confirm("Delete this checklist item?")) return;
    await (supabase as any).from("checklist_items").delete().eq("id", id);
    setItems(items.filter(i => i.id !== id));
    toast.success("Item removed.");
  };

  // ── Add custom item ───────────────────────────────────────────────────────────

  const addItem = async () => {
    if (!newItem.title.trim()) return toast.error("Title required");
    setSaving(true);
    const { error } = await (supabase as any).from("checklist_items").insert({
      session_id: getSessionId(),
      category: newItem.category,
      title: newItem.title.trim(),
      description: newItem.description.trim() || null,
      priority: newItem.priority,
      done: false,
      framework: "custom",
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    setAddOpen(false);
    setNewItem({ title: "", description: "", category: "Identity", priority: "high" });
    toast.success("Item added to checklist.");
    load();
  };

  // ── Export ────────────────────────────────────────────────────────────────────

  const exportCSV = () => {
    const rows = [["Category", "Priority", "Title", "Status", "Description", "Notes"]];
    items.forEach(i => rows.push([
      i.category, i.priority, i.title,
      i.done ? "Done" : "Todo",
      (i.description ?? "").replace(/,/g, ";"),
      (i.notes ?? "").replace(/,/g, ";"),
    ]));
    const csv = rows.map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `security-checklist-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    toast.success("Checklist exported as CSV.");
  };

  // ── Derived ───────────────────────────────────────────────────────────────────

  const categories = useMemo(() => [...new Set(items.map(i => i.category))], [items]);

  const filtered = useMemo(() => {
    let list = [...items];
    if (search)           list = list.filter(i => i.title.toLowerCase().includes(search.toLowerCase()) || (i.description ?? "").toLowerCase().includes(search.toLowerCase()));
    if (filterPriority !== "all") list = list.filter(i => i.priority === filterPriority);
    if (filterStatus === "done")  list = list.filter(i => i.done);
    if (filterStatus === "todo")  list = list.filter(i => !i.done);
    if (filterCat !== "all")      list = list.filter(i => i.category === filterCat);
    return list.sort(SORT_FN[sortBy]);
  }, [items, search, filterPriority, filterStatus, filterCat, sortBy]);

  const grouped = useMemo(() => {
    const g: Record<string, Item[]> = {};
    for (const i of filtered) (g[i.category] ??= []).push(i);
    return g;
  }, [filtered]);

  const done  = items.filter(i => i.done).length;
  const total = items.length;
  const pct   = total ? Math.round((done / total) * 100) : 0;
  const tier  = scoreLabel(pct);

  const highRemaining = items.filter(i => !i.done && i.priority === "high").length;
  const activeFilters = (search ? 1 : 0) + (filterPriority !== "all" ? 1 : 0) + (filterStatus !== "all" ? 1 : 0) + (filterCat !== "all" ? 1 : 0);

  const toggleCat = (cat: string) => {
    setCollapsedCats(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <AppShell>
      {/* Celebration banner */}
      {justCompleted && (
        <div className="fixed inset-x-0 top-16 z-50 flex justify-center pointer-events-none">
          <div className="bg-emerald-500 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-2 text-sm font-semibold animate-bounce">
            <Trophy className="w-5 h-5" />All items complete — excellent security posture! 🎉
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Security Checklist</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Starter security hygiene tasks mapped to SOC 2 / ISO 27001. Track, annotate, and export your compliance posture.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {items.length === 0 && (
            <Button onClick={seed} disabled={seeding}>
              <Sparkles className="w-4 h-4 mr-2" />{seeding ? "Loading…" : "Load starter checklist"}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={!items.length}>
            <Download className="w-3.5 h-3.5 mr-1.5" />Export CSV
          </Button>
          {items.length > 0 && (
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="w-3.5 h-3.5 mr-1.5" />Add item</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add custom checklist item</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Title</Label>
                    <Input value={newItem.title} onChange={e => setNewItem({ ...newItem, title: e.target.value })} placeholder="e.g. Enable SIEM alerting" />
                  </div>
                  <div>
                    <Label>Description (optional)</Label>
                    <Textarea rows={2} value={newItem.description} onChange={e => setNewItem({ ...newItem, description: e.target.value })} placeholder="Why is this important?" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Category</Label>
                      <Select value={newItem.category} onValueChange={v => setNewItem({ ...newItem, category: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{ALL_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Priority</Label>
                      <Select value={newItem.priority} onValueChange={v => setNewItem({ ...newItem, priority: v as Priority })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="low">Low</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
                  <Button onClick={addItem} disabled={saving}>{saving ? "Saving…" : "Add item"}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Progress card */}
      {total > 0 && (
        <div className="surface-card p-5 mb-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            <div className="text-center">
              <div className={`text-3xl font-bold tabular-nums ${tier.color}`}>{pct}%</div>
              <div className="text-[10px] font-mono uppercase text-muted-foreground mt-0.5">{tier.label}</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-emerald-600">{done}</div>
              <div className="text-[10px] font-mono uppercase text-muted-foreground mt-0.5">Completed</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-muted-foreground">{total - done}</div>
              <div className="text-[10px] font-mono uppercase text-muted-foreground mt-0.5">Remaining</div>
            </div>
            <div className="text-center">
              <div className={`text-3xl font-bold ${highRemaining > 0 ? "text-red-500" : "text-emerald-600"}`}>{highRemaining}</div>
              <div className="text-[10px] font-mono uppercase text-muted-foreground mt-0.5">High Priority Left</div>
            </div>
          </div>
          <Progress value={pct} className="h-2.5" />
          {highRemaining > 0 && (
            <p className="text-xs text-red-500 mt-2 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />{highRemaining} high-priority item{highRemaining > 1 ? "s" : ""} still incomplete — address these first.
            </p>
          )}
        </div>
      )}

      {/* Per-category progress — ring cards */}
      {total > 0 && categories.length > 1 && (
        <div className="mb-6">
          <div className="text-xs font-mono uppercase text-muted-foreground tracking-wider mb-3 flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5" />Security Posture by Domain
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            {categories.map(cat => {
              const catItems  = items.filter(i => i.category === cat);
              const catDone   = catItems.filter(i => i.done).length;
              const catHigh   = catItems.filter(i => !i.done && i.priority === "high").length;
              const catPct    = catItems.length ? Math.round((catDone / catItems.length) * 100) : 0;
              const complete  = catPct === 100;
              const ringColor = complete ? "#10b981" : catHigh > 0 ? "#ef4444" : catPct >= 60 ? "#f59e0b" : "#6366f1";
              const CatIcon   = CAT_ICONS[cat] ?? Shield;
              return (
                <button
                  key={cat}
                  onClick={() => setFilterCat(filterCat === cat ? "all" : cat)}
                  className={`surface-card p-4 flex flex-col items-center gap-2 transition-all hover:border-primary/50 hover:-translate-y-0.5 hover:shadow-md ${
                    filterCat === cat ? "border-primary/60 bg-primary/5" : ""
                  }`}
                >
                  {/* Ring */}
                  <div className="relative">
                    <RingGauge pct={catPct} size={68} stroke={5} color={ringColor} />
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <CatIcon className="w-4 h-4" style={{ color: ringColor }} />
                      <span className="text-[11px] font-bold tabular-nums leading-none mt-0.5" style={{ color: ringColor }}>
                        {catPct}%
                      </span>
                    </div>
                  </div>
                  {/* Label */}
                  <div className="text-center">
                    <div className="text-xs font-semibold truncate max-w-[80px]">{cat}</div>
                    <div className="text-[10px] font-mono text-muted-foreground">{catDone}/{catItems.length}</div>
                  </div>
                  {/* Status pip */}
                  {complete ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  ) : catHigh > 0 ? (
                    <span className="text-[9px] font-mono text-red-500 bg-red-50 dark:bg-red-950/20 px-1.5 py-0.5 rounded-full border border-red-300/40">
                      {catHigh} critical
                    </span>
                  ) : (
                    <span className="h-3.5" />
                  )}
                </button>
              );
            })}
          </div>
          {filterCat !== "all" && (
            <button onClick={() => setFilterCat("all")} className="mt-2 text-[10px] text-muted-foreground hover:text-primary font-mono flex items-center gap-1">
              <X className="w-3 h-3" />Clear category filter
            </button>
          )}
        </div>
      )}

      {/* Search + filters */}
      {total > 0 && (
        <div className="flex gap-2 mb-4 flex-wrap items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8 h-8 text-sm" placeholder="Search tasks…" value={search} onChange={e => setSearch(e.target.value)} />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <Select value={filterCat} onValueChange={setFilterCat}>
            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filterPriority} onValueChange={v => setFilterPriority(v as Priority | "all")}>
            <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="Priority" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priority</SelectItem>
              <SelectItem value="high">🔴 High</SelectItem>
              <SelectItem value="medium">🟡 Medium</SelectItem>
              <SelectItem value="low">🔵 Low</SelectItem>
            </SelectContent>
          </Select>

          {(["all", "todo", "done"] as const).map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`h-8 px-3 text-xs rounded-md border font-mono tracking-wider transition-colors ${filterStatus === s ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:text-foreground"}`}>
              {s === "all" ? "All" : s === "todo" ? "☐ Todo" : "✓ Done"}
            </button>
          ))}

          <Select value={sortBy} onValueChange={v => setSortBy(v as SortBy)}>
            <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="priority">Sort: Priority</SelectItem>
              <SelectItem value="title">Sort: Title</SelectItem>
              <SelectItem value="status">Sort: Status</SelectItem>
            </SelectContent>
          </Select>

          {activeFilters > 0 && (
            <button onClick={() => { setSearch(""); setFilterPriority("all"); setFilterStatus("all"); setFilterCat("all"); }}
              className="h-8 px-3 text-xs rounded-md border border-dashed border-muted-foreground/40 text-muted-foreground hover:text-foreground flex items-center gap-1.5">
              <X className="w-3 h-3" />Clear {activeFilters}
            </button>
          )}

          <div className="flex gap-1.5 ml-auto">
            <button onClick={() => markAllVisible(true)}
              className="h-8 px-3 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-emerald-400 flex items-center gap-1.5 transition-colors">
              <CheckSquare className="w-3.5 h-3.5" />Check all
            </button>
            <button onClick={() => markAllVisible(false)}
              className="h-8 px-3 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors">
              <Square className="w-3.5 h-3.5" />Uncheck all
            </button>
          </div>

          <span className="text-xs text-muted-foreground font-mono">
            {filtered.length} / {total} tasks
          </span>
        </div>
      )}

      {/* Empty state */}
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : total === 0 ? (
        <div className="surface-card p-12 text-center">
          <ListChecks className="w-8 h-8 mx-auto text-primary mb-3" />
          <h2 className="text-lg font-semibold">No checklist yet</h2>
          <p className="text-sm text-muted-foreground mb-4">Load our starter checklist mapped to SOC 2 / ISO 27001 basics.</p>
          <Button onClick={seed} disabled={seeding}><Sparkles className="w-4 h-4 mr-2" />Load starter checklist</Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="surface-card p-10 text-center">
          <Filter className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">No tasks match your filters. <button className="text-primary hover:underline" onClick={() => { setSearch(""); setFilterPriority("all"); setFilterStatus("all"); setFilterCat("all"); }}>Clear filters</button></p>
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(grouped).map(([cat, list]) => {
            const catDone  = items.filter(i => i.category === cat && i.done).length;
            const catTotal = items.filter(i => i.category === cat).length;
            const catPct   = catTotal ? Math.round((catDone / catTotal) * 100) : 0;
            const isCollapsed = collapsedCats.has(cat);
            return (
              <div key={cat} className="surface-card overflow-hidden">
                {/* Category header */}
                <div className="flex items-center gap-3 p-4 border-b border-border/60 bg-secondary/20">
                  <button onClick={() => toggleCat(cat)} className="flex items-center gap-2 flex-1 text-left group">
                    {isCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
                    <h2 className="font-semibold group-hover:text-primary transition-colors">{cat}</h2>
                    <span className="text-xs text-muted-foreground font-mono">{catDone}/{catTotal}</span>
                    {catPct === 100 && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-24 hidden sm:block">
                      <Progress value={catPct} className="h-1.5" />
                    </div>
                    <button onClick={() => markAllInCategory(cat, true)}
                      className="text-[10px] px-2 py-1 rounded border border-border text-muted-foreground hover:border-emerald-400 hover:text-emerald-600 transition-colors font-mono">
                      All done
                    </button>
                    <button onClick={() => markAllInCategory(cat, false)}
                      className="text-[10px] px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground transition-colors font-mono">
                      Reset
                    </button>
                  </div>
                </div>

                {/* Items */}
                {!isCollapsed && (
                  <div className="divide-y divide-border/40">
                    {list.map(i => {
                      const PriorityIcon = PRIORITY_META[i.priority].icon;
                      const isEditingThis = editingNote === i.id;
                      return (
                        <div key={i.id} className={`p-4 transition-colors ${i.done ? "bg-secondary/10" : "hover:bg-secondary/20"}`}>
                          <div className="flex items-start gap-3">
                            <Checkbox
                              checked={i.done}
                              onCheckedChange={() => toggle(i)}
                              className="mt-0.5 shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              {/* Title row */}
                              <div className="flex items-start gap-2 flex-wrap">
                                <span className={`font-medium leading-snug ${i.done ? "line-through text-muted-foreground" : ""}`}>
                                  {i.title}
                                </span>
                                <Badge variant="outline" className={`text-[10px] shrink-0 ${PRIORITY_META[i.priority].color} flex items-center gap-1`}>
                                  <PriorityIcon className="w-2.5 h-2.5" />
                                  {PRIORITY_META[i.priority].label}
                                </Badge>
                                {i.notes && (
                                  <span title="Has note" className="text-[10px] text-primary">📎</span>
                                )}
                                {i.done && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
                              </div>
                              {/* Description */}
                              {i.description && (
                                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{i.description}</p>
                              )}
                              {/* Notes section */}
                              {isEditingThis ? (
                                <div className="mt-2 space-y-2">
                                  <Textarea
                                    autoFocus
                                    rows={2}
                                    value={noteText}
                                    onChange={e => setNoteText(e.target.value)}
                                    placeholder="Add an implementation note, owner, or evidence link…"
                                    className="text-xs font-mono resize-none"
                                  />
                                  <div className="flex gap-2">
                                    <Button size="sm" className="h-7 text-xs" onClick={() => saveNote(i.id)}>Save</Button>
                                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingNote(null)}>Cancel</Button>
                                  </div>
                                </div>
                              ) : i.notes ? (
                                <div
                                  onClick={() => { setEditingNote(i.id); setNoteText(i.notes ?? ""); }}
                                  className="mt-1.5 text-xs text-muted-foreground bg-secondary/50 rounded-md px-2.5 py-1.5 border border-border/60 cursor-pointer hover:border-primary/40 flex items-start gap-1.5"
                                >
                                  <StickyNote className="w-3 h-3 shrink-0 mt-0.5 text-primary" />
                                  <span className="leading-relaxed">{i.notes}</span>
                                </div>
                              ) : null}
                            </div>

                            {/* Action buttons */}
                            <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity [.group:hover_&]:opacity-100">
                              <button
                                onClick={() => { setEditingNote(i.id); setNoteText(i.notes ?? ""); }}
                                className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-primary hover:bg-secondary transition-colors"
                                title="Add note"
                              >
                                <StickyNote className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => deleteItem(i.id)}
                                className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          {/* Note CTA if no note and not editing */}
                          {!isEditingThis && !i.notes && (
                            <button
                              onClick={() => { setEditingNote(i.id); setNoteText(""); }}
                              className="mt-1.5 ml-8 text-[10px] text-muted-foreground/50 hover:text-primary transition-colors flex items-center gap-1"
                            >
                              <Plus className="w-2.5 h-2.5" />Add note
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
};

export default Checklist;
