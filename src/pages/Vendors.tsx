import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/cspm/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Plus, Trash2, Building2, ShieldCheck, ShieldAlert, ShieldQuestion,
  CalendarClock, Search, Filter, Download, Edit2, X, AlertTriangle,
  CheckCircle2, Clock, FileText, Globe, Users, Lock, DollarSign,
  Cpu, Mail, BarChart3, Layers, ChevronRight, ExternalLink,
  RefreshCw, Copy, Save,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getSessionId } from "@/lib/session";
import { toast } from "sonner";
import { format, formatDistanceToNow, differenceInDays } from "date-fns";

// ── Types ─────────────────────────────────────────────────────────────────────

type Vendor = {
  id: string;
  session_id: string;
  name: string;
  category: string;
  data_access: string[];
  soc2_status: string;
  criticality: string;
  owner: string | null;
  renewal_date: string | null;
  notes: string | null;
  created_at: string;
  // Extra fields stored in notes as JSON suffix (backward compat)
  dpa_signed?: boolean;
  website?: string;
  risk_score?: number;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES = ["Infrastructure", "Payments", "Email", "Analytics", "AI / LLM", "CRM", "HR", "Security", "Other"];
const SOC2_STATUS = ["compliant", "in_progress", "none", "unknown"];
const CRITICALITY  = ["critical", "high", "medium", "low"];
const DATA_TAGS    = ["PII", "Financial", "Source code", "Customer data", "Employee data", "Auth tokens", "Health data", "Biometric"];

const CAT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Infrastructure: Cpu,
  Payments:       DollarSign,
  Email:          Mail,
  Analytics:      BarChart3,
  "AI / LLM":     Cpu,
  CRM:            Users,
  HR:             Users,
  Security:       Lock,
  Other:          Layers,
};

const CRIT_META: Record<string, { color: string; bg: string; border: string; order: number }> = {
  critical: { color: "text-red-600",    bg: "bg-red-50 dark:bg-red-950/20",      border: "border-red-300/50",    order: 0 },
  high:     { color: "text-orange-500", bg: "bg-orange-50 dark:bg-orange-950/20", border: "border-orange-300/50", order: 1 },
  medium:   { color: "text-yellow-600", bg: "bg-yellow-50 dark:bg-yellow-950/20", border: "border-yellow-300/50", order: 2 },
  low:      { color: "text-blue-500",   bg: "bg-blue-50 dark:bg-blue-950/20",     border: "border-blue-300/50",   order: 3 },
};

const SOC2_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  compliant:   { label: "SOC 2 Compliant",   color: "text-emerald-600", icon: <ShieldCheck  className="w-3.5 h-3.5 text-emerald-500" /> },
  in_progress: { label: "In Progress",       color: "text-yellow-600",  icon: <ShieldAlert  className="w-3.5 h-3.5 text-yellow-500" /> },
  none:        { label: "No SOC 2",           color: "text-red-500",     icon: <ShieldQuestion className="w-3.5 h-3.5 text-red-500" /> },
  unknown:     { label: "Unknown",            color: "text-muted-foreground", icon: <ShieldQuestion className="w-3.5 h-3.5 text-muted-foreground" /> },
};

// Risk score heuristic (0-100, higher = more risky)
function computeRisk(v: Vendor): number {
  let score = 0;
  if (v.criticality === "critical") score += 40;
  else if (v.criticality === "high")   score += 25;
  else if (v.criticality === "medium") score += 12;
  if (v.soc2_status === "none")        score += 30;
  else if (v.soc2_status === "unknown") score += 20;
  else if (v.soc2_status === "in_progress") score += 10;
  if (v.data_access.includes("PII"))        score += 10;
  if (v.data_access.includes("Financial"))  score += 10;
  if (v.data_access.includes("Health data")) score += 15;
  if (v.renewal_date && differenceInDays(new Date(v.renewal_date), new Date()) < 30) score += 10;
  return Math.min(100, score);
}

function riskLabel(score: number) {
  if (score >= 70) return { label: "High Risk",      color: "text-red-500",    bg: "bg-red-500" };
  if (score >= 40) return { label: "Medium Risk",    color: "text-orange-500", bg: "bg-orange-500" };
  if (score >= 20) return { label: "Low Risk",       color: "text-yellow-600", bg: "bg-yellow-400" };
  return               { label: "Minimal Risk",    color: "text-emerald-600", bg: "bg-emerald-500" };
}

function renewalUrgency(dateStr: string | null) {
  if (!dateStr) return null;
  const days = differenceInDays(new Date(dateStr), new Date());
  if (days < 0)  return { label: "Expired",    color: "text-red-500",    urgent: true };
  if (days <= 14) return { label: `${days}d left`, color: "text-red-500",    urgent: true };
  if (days <= 60) return { label: `${days}d left`, color: "text-yellow-600", urgent: false };
  return null;
}

const BLANK_FORM = {
  name: "", category: "Infrastructure", soc2_status: "unknown",
  criticality: "medium", owner: "", renewal_date: "", notes: "", website: "",
  data_access: [] as string[], dpa_signed: false,
};

// ── Component ─────────────────────────────────────────────────────────────────

const Vendors = () => {
  const [items, setItems]       = useState<Vendor[]>([]);
  const [loading, setLoading]   = useState(true);
  const [open, setOpen]         = useState(false);
  const [form, setForm]         = useState({ ...BLANK_FORM });
  const [selected, setSelected] = useState<Vendor | null>(null);
  const [editing, setEditing]   = useState(false);
  const [editForm, setEditForm] = useState({ ...BLANK_FORM });
  const [saving, setSaving]     = useState(false);
  // Filters
  const [search, setSearch]     = useState("");
  const [filterCrit, setFilterCrit] = useState("all");
  const [filterSoc2, setFilterSoc2] = useState("all");
  const [filterCat, setFilterCat]   = useState("all");
  const [sortBy, setSortBy]         = useState<"risk" | "name" | "renewal" | "added">("risk");
  const [mainTab, setMainTab]       = useState("list");

  // ── Load ──────────────────────────────────────────────────────────────────────

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).from("vendors").select("*").order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setItems((data ?? []) as Vendor[]);
    setLoading(false);
  };

  useEffect(() => { load(); document.title = "Vendor Risk — SentinelCSPM"; }, []);

  const toggleTag = (t: string) =>
    setForm(f => ({ ...f, data_access: f.data_access.includes(t) ? f.data_access.filter(x => x !== t) : [...f.data_access, t] }));

  const toggleEditTag = (t: string) =>
    setEditForm(f => ({ ...f, data_access: f.data_access.includes(t) ? f.data_access.filter(x => x !== t) : [...f.data_access, t] }));

  // ── Submit (add) ─────────────────────────────────────────────────────────────

  const submit = async () => {
    if (!form.name.trim()) return toast.error("Name required");
    const { error } = await (supabase as any).from("vendors").insert({
      session_id: getSessionId(),
      name: form.name.trim(),
      category: form.category,
      soc2_status: form.soc2_status,
      criticality: form.criticality,
      owner: form.owner || null,
      renewal_date: form.renewal_date || null,
      notes: form.notes || null,
      data_access: form.data_access,
    });
    if (error) return toast.error(error.message);
    toast.success("Vendor added");
    setOpen(false);
    setForm({ ...BLANK_FORM });
    load();
  };

  // ── Edit ─────────────────────────────────────────────────────────────────────

  const startEdit = (v: Vendor) => {
    setEditForm({
      name: v.name, category: v.category, soc2_status: v.soc2_status,
      criticality: v.criticality, owner: v.owner ?? "",
      renewal_date: v.renewal_date ?? "", notes: v.notes ?? "",
      website: "", data_access: [...v.data_access], dpa_signed: false,
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!selected) return;
    setSaving(true);
    const { error } = await (supabase as any).from("vendors").update({
      name: editForm.name.trim(),
      category: editForm.category,
      soc2_status: editForm.soc2_status,
      criticality: editForm.criticality,
      owner: editForm.owner || null,
      renewal_date: editForm.renewal_date || null,
      notes: editForm.notes || null,
      data_access: editForm.data_access,
      updated_at: new Date().toISOString(),
    }).eq("id", selected.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Vendor updated");
    setEditing(false);
    await load();
    // Re-select updated vendor
    setSelected(prev => prev ? { ...prev, ...editForm, name: editForm.name.trim(), owner: editForm.owner || null, renewal_date: editForm.renewal_date || null, notes: editForm.notes || null } : null);
  };

  // ── Delete ────────────────────────────────────────────────────────────────────

  const remove = async (id: string) => {
    if (!confirm("Remove this vendor?")) return;
    await (supabase as any).from("vendors").delete().eq("id", id);
    if (selected?.id === id) setSelected(null);
    load();
  };

  // ── Export ────────────────────────────────────────────────────────────────────

  const exportCSV = () => {
    const rows = [["Name", "Category", "Criticality", "SOC 2", "Data Access", "Owner", "Renewal Date", "Risk Score", "Notes"]];
    items.forEach(v => rows.push([
      v.name, v.category, v.criticality, v.soc2_status,
      v.data_access.join("; "),
      v.owner ?? "",
      v.renewal_date ? format(new Date(v.renewal_date), "yyyy-MM-dd") : "",
      String(computeRisk(v)),
      (v.notes ?? "").replace(/,/g, ";"),
    ]));
    const csv = rows.map(r => r.map(x => `"${x}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `vendor-risk-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    toast.success("Vendor list exported as CSV.");
  };

  // ── Derived ───────────────────────────────────────────────────────────────────

  const withRisk = useMemo(() => items.map(v => ({ ...v, _risk: computeRisk(v) })), [items]);

  const filtered = useMemo(() => {
    let list = [...withRisk];
    if (search)          list = list.filter(v => v.name.toLowerCase().includes(search.toLowerCase()) || v.category.toLowerCase().includes(search.toLowerCase()) || (v.owner ?? "").toLowerCase().includes(search.toLowerCase()));
    if (filterCrit !== "all") list = list.filter(v => v.criticality === filterCrit);
    if (filterSoc2 !== "all") list = list.filter(v => v.soc2_status === filterSoc2);
    if (filterCat  !== "all") list = list.filter(v => v.category === filterCat);
    return list.sort((a, b) => {
      if (sortBy === "risk")    return b._risk - a._risk;
      if (sortBy === "name")    return a.name.localeCompare(b.name);
      if (sortBy === "renewal") return (a.renewal_date ?? "9999").localeCompare(b.renewal_date ?? "9999");
      return 0; // added (already sorted by created_at from DB)
    });
  }, [withRisk, search, filterCrit, filterSoc2, filterCat, sortBy]);

  const stats = useMemo(() => ({
    total:       items.length,
    noSoc2:      items.filter(v => v.soc2_status === "none" || v.soc2_status === "unknown").length,
    renewSoon:   items.filter(v => v.renewal_date && differenceInDays(new Date(v.renewal_date), new Date()) <= 60).length,
    critical:    items.filter(v => v.criticality === "critical").length,
    highRisk:    withRisk.filter(v => v._risk >= 70).length,
    piiVendors:  items.filter(v => v.data_access.includes("PII")).length,
  }), [items, withRisk]);

  const categories = useMemo(() => [...new Set(items.map(v => v.category))].sort(), [items]);
  const activeFilters = (search ? 1 : 0) + (filterCrit !== "all" ? 1 : 0) + (filterSoc2 !== "all" ? 1 : 0) + (filterCat !== "all" ? 1 : 0);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <AppShell>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Vendor Risk Tracker</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Track every SaaS vendor with access to your data. Assess SOC 2 status, DPA compliance, renewal dates and risk scores.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={!items.length}>
            <Download className="w-3.5 h-3.5 mr-1.5" />Export CSV
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-2" />Add vendor</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Add a vendor</DialogTitle></DialogHeader>
              <div className="grid gap-3 max-h-[70vh] overflow-y-auto pr-1">
                <div><Label>Vendor name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Stripe, OpenAI, GitHub" /></div>
                <div><Label>Website (optional)</Label><Input value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} placeholder="https://stripe.com" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Category</Label>
                    <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Criticality</Label>
                    <Select value={form.criticality} onValueChange={v => setForm({ ...form, criticality: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{CRITICALITY.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>SOC 2 status</Label>
                    <Select value={form.soc2_status} onValueChange={v => setForm({ ...form, soc2_status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{SOC2_STATUS.map(c => <SelectItem key={c} value={c}>{c.replace("_", " ")}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Renewal date</Label><Input type="date" value={form.renewal_date} onChange={e => setForm({ ...form, renewal_date: e.target.value })} /></div>
                </div>
                <div><Label>Internal owner</Label><Input value={form.owner} onChange={e => setForm({ ...form, owner: e.target.value })} placeholder="e.g. CTO, Security Team" /></div>
                <div>
                  <Label>DPA signed?</Label>
                  <div className="flex gap-2 mt-1">
                    {[true, false].map(v => (
                      <button key={String(v)} type="button" onClick={() => setForm(f => ({ ...f, dpa_signed: v }))}
                        className={`flex-1 text-xs py-1.5 rounded-md border transition-colors ${form.dpa_signed === v ? "bg-primary text-primary-foreground border-primary" : "border-border bg-secondary/40 text-muted-foreground"}`}>
                        {v ? "✓ Yes — DPA signed" : "✕ No / Unknown"}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label>Data accessed</Label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {DATA_TAGS.map(t => (
                      <button key={t} type="button" onClick={() => toggleTag(t)}
                        className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${form.data_access.includes(t) ? "bg-primary text-primary-foreground border-primary" : "border-border bg-secondary/40 text-muted-foreground hover:border-primary/50"}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="DPA link, contract terms, security review notes…" /></div>
              </div>
              <DialogFooter><Button onClick={submit}>Save vendor</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-6">
        {[
          { label: "Total Vendors", value: stats.total,      color: "text-foreground",   icon: Building2 },
          { label: "No SOC 2",      value: stats.noSoc2,     color: "text-red-500",      icon: ShieldQuestion },
          { label: "High Risk",     value: stats.highRisk,   color: "text-red-500",      icon: AlertTriangle },
          { label: "Critical",      value: stats.critical,   color: "text-orange-500",   icon: Lock },
          { label: "Renewing <60d", value: stats.renewSoon,  color: "text-yellow-600",   icon: CalendarClock },
          { label: "Have PII",      value: stats.piiVendors, color: "text-purple-500",   icon: Users },
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

      {/* Renewal alerts */}
      {items.filter(v => v.renewal_date && differenceInDays(new Date(v.renewal_date), new Date()) <= 14).length > 0 && (
        <div className="surface-card p-4 mb-6 border-red-300/50 dark:border-red-700/40 bg-red-50/50 dark:bg-red-950/10">
          <div className="text-xs font-mono uppercase text-red-600 font-semibold mb-2 flex items-center gap-1.5">
            <CalendarClock className="w-3.5 h-3.5" />Urgent Renewals
          </div>
          <div className="flex flex-wrap gap-2">
            {items.filter(v => v.renewal_date && differenceInDays(new Date(v.renewal_date), new Date()) <= 14).map(v => (
              <button key={v.id} onClick={() => { setSelected(v); setMainTab("list"); }}
                className="text-xs px-3 py-1.5 rounded-md bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-400 border border-red-300/50 font-mono hover:bg-red-200 transition-colors">
                {v.name} — {renewalUrgency(v.renewal_date)?.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main tabs */}
      <Tabs value={mainTab} onValueChange={setMainTab}>
        <TabsList className="grid grid-cols-2 w-full max-w-xs mb-5">
          <TabsTrigger value="list">Vendor List</TabsTrigger>
          <TabsTrigger value="risk">Risk Matrix</TabsTrigger>
        </TabsList>

        {/* ── Vendor List Tab ───────────────────────────────────────────── */}
        <TabsContent value="list">
          {/* Filters */}
          {items.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4 items-center">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-8 h-8 text-sm" placeholder="Search vendors…" value={search} onChange={e => setSearch(e.target.value)} />
                {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>}
              </div>
              <Select value={filterCat} onValueChange={setFilterCat}>
                <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterCrit} onValueChange={setFilterCrit}>
                <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="Criticality" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All criticality</SelectItem>
                  {CRITICALITY.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterSoc2} onValueChange={setFilterSoc2}>
                <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="SOC 2" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All SOC 2</SelectItem>
                  {SOC2_STATUS.map(c => <SelectItem key={c} value={c}>{c.replace("_", " ")}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={v => setSortBy(v as any)}>
                <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="risk">Sort: Risk ↓</SelectItem>
                  <SelectItem value="name">Sort: Name A–Z</SelectItem>
                  <SelectItem value="renewal">Sort: Renewal</SelectItem>
                  <SelectItem value="added">Sort: Recently Added</SelectItem>
                </SelectContent>
              </Select>
              {activeFilters > 0 && (
                <button onClick={() => { setSearch(""); setFilterCrit("all"); setFilterSoc2("all"); setFilterCat("all"); }}
                  className="h-8 px-3 text-xs rounded-md border border-dashed border-muted-foreground/40 text-muted-foreground hover:text-foreground flex items-center gap-1.5">
                  <X className="w-3 h-3" />Clear {activeFilters}
                </button>
              )}
              <span className="text-xs font-mono text-muted-foreground ml-auto">{filtered.length} / {stats.total}</span>
            </div>
          )}

          {loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : items.length === 0 ? (
            <div className="surface-card p-12 text-center">
              <Building2 className="w-8 h-8 mx-auto text-primary mb-3" />
              <h2 className="text-lg font-semibold">No vendors yet</h2>
              <p className="text-sm text-muted-foreground">Start with Stripe, AWS, GitHub, OpenAI — anything with access to your data.</p>
            </div>
          ) : (
            <div className="grid lg:grid-cols-3 gap-4">
              {/* Left: vendor cards */}
              <div className={`${selected ? "lg:col-span-2" : "lg:col-span-3"} grid sm:grid-cols-2 ${selected ? "lg:grid-cols-2" : "lg:grid-cols-3"} gap-3 auto-rows-min`}>
                {filtered.map(v => {
                  const risk     = computeRisk(v);
                  const rl       = riskLabel(risk);
                  const urgency  = renewalUrgency(v.renewal_date);
                  const crit     = CRIT_META[v.criticality] ?? CRIT_META.medium;
                  const CatIcon  = CAT_ICONS[v.category] ?? Layers;
                  const isActive = selected?.id === v.id;
                  return (
                    <button key={v.id} onClick={() => setSelected(isActive ? null : v)}
                      className={`surface-card p-4 text-left transition-all hover:border-primary/40 hover:-translate-y-0.5 hover:shadow-md ${isActive ? "border-primary/60 bg-primary/5" : ""}`}>
                      {/* Top row */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-8 h-8 shrink-0 rounded-md bg-secondary flex items-center justify-center">
                            <CatIcon className="w-4 h-4 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-sm truncate">{v.name}</div>
                            <div className="text-[10px] text-muted-foreground font-mono">{v.category}</div>
                          </div>
                        </div>
                        {/* Risk score pill */}
                        <div className={`shrink-0 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${rl.color} bg-secondary`}>
                          {risk}
                        </div>
                      </div>

                      {/* Risk bar */}
                      <div className="mb-2">
                        <Progress value={risk} className="h-1" />
                      </div>

                      {/* Badges */}
                      <div className="flex flex-wrap gap-1.5">
                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full border ${crit.color} ${crit.bg} ${crit.border}`}>
                          {v.criticality}
                        </span>
                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full border flex items-center gap-1 ${SOC2_META[v.soc2_status]?.color ?? ""}`}>
                          {SOC2_META[v.soc2_status]?.icon}
                          {SOC2_META[v.soc2_status]?.label ?? v.soc2_status}
                        </span>
                        {urgency && (
                          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full border flex items-center gap-1 ${urgency.color} ${urgency.urgent ? "border-red-300/50 bg-red-50 dark:bg-red-950/20" : "border-yellow-300/50 bg-yellow-50 dark:bg-yellow-950/20"}`}>
                            <CalendarClock className="w-2.5 h-2.5" />{urgency.label}
                          </span>
                        )}
                      </div>

                      {/* Data tags */}
                      {v.data_access.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {v.data_access.slice(0, 3).map(t => (
                            <span key={t} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-secondary text-muted-foreground border border-border/60">{t}</span>
                          ))}
                          {v.data_access.length > 3 && (
                            <span className="text-[9px] font-mono px-1.5 py-0.5 text-muted-foreground">+{v.data_access.length - 3}</span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Right: detail panel */}
              {selected && (() => {
                const risk = computeRisk(selected);
                const rl   = riskLabel(risk);
                const CatIcon = CAT_ICONS[selected.category] ?? Layers;
                return (
                  <div className="lg:col-span-1">
                    <div className="surface-card p-5 sticky top-4">
                      {/* Detail header */}
                      <div className="flex items-start justify-between gap-2 mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                            <CatIcon className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <div className="font-bold">{selected.name}</div>
                            <div className="text-[11px] text-muted-foreground font-mono">{selected.category}</div>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" className="w-7 h-7" onClick={() => startEdit(selected)}><Edit2 className="w-3.5 h-3.5" /></Button>
                          <Button size="icon" variant="ghost" className="w-7 h-7" onClick={() => { setSelected(null); setEditing(false); }}><X className="w-3.5 h-3.5" /></Button>
                        </div>
                      </div>

                      {editing ? (
                        /* Edit form */
                        <div className="space-y-3">
                          <div><Label className="text-xs">Name</Label><Input className="h-8 text-sm" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} /></div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label className="text-xs">Criticality</Label>
                              <Select value={editForm.criticality} onValueChange={v => setEditForm({ ...editForm, criticality: v })}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>{CRITICALITY.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label className="text-xs">SOC 2</Label>
                              <Select value={editForm.soc2_status} onValueChange={v => setEditForm({ ...editForm, soc2_status: v })}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>{SOC2_STATUS.map(c => <SelectItem key={c} value={c}>{c.replace("_", " ")}</SelectItem>)}</SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div><Label className="text-xs">Owner</Label><Input className="h-8 text-sm" value={editForm.owner} onChange={e => setEditForm({ ...editForm, owner: e.target.value })} /></div>
                          <div><Label className="text-xs">Renewal date</Label><Input type="date" className="h-8 text-sm" value={editForm.renewal_date} onChange={e => setEditForm({ ...editForm, renewal_date: e.target.value })} /></div>
                          <div>
                            <Label className="text-xs">Data accessed</Label>
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              {DATA_TAGS.map(t => (
                                <button key={t} type="button" onClick={() => toggleEditTag(t)}
                                  className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${editForm.data_access.includes(t) ? "bg-primary text-primary-foreground border-primary" : "border-border bg-secondary/40 text-muted-foreground"}`}>
                                  {t}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div><Label className="text-xs">Notes</Label><Textarea rows={2} className="text-xs" value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} /></div>
                          <div className="flex gap-2">
                            <Button size="sm" className="flex-1" onClick={saveEdit} disabled={saving}>
                              {saving ? "Saving…" : <><Save className="w-3.5 h-3.5 mr-1.5" />Save</>}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                          </div>
                        </div>
                      ) : (
                        /* View mode */
                        <div className="space-y-4">
                          {/* Risk score */}
                          <div>
                            <div className="flex items-center justify-between text-xs mb-1.5">
                              <span className="text-muted-foreground font-mono uppercase tracking-wider">Risk Score</span>
                              <span className={`font-bold ${rl.color}`}>{risk}/100 · {rl.label}</span>
                            </div>
                            <Progress value={risk} className="h-2" />
                          </div>

                          {/* Key info */}
                          <div className="space-y-2 text-sm">
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground text-xs">SOC 2</span>
                              <span className={`text-xs font-mono flex items-center gap-1 ${SOC2_META[selected.soc2_status]?.color}`}>
                                {SOC2_META[selected.soc2_status]?.icon}
                                {SOC2_META[selected.soc2_status]?.label}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground text-xs">Criticality</span>
                              <span className={`text-xs font-mono ${CRIT_META[selected.criticality]?.color}`}>{selected.criticality}</span>
                            </div>
                            {selected.owner && (
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground text-xs">Owner</span>
                                <span className="text-xs font-mono">{selected.owner}</span>
                              </div>
                            )}
                            {selected.renewal_date && (
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground text-xs">Renewal</span>
                                <span className={`text-xs font-mono ${renewalUrgency(selected.renewal_date)?.color ?? ""}`}>
                                  {format(new Date(selected.renewal_date), "MMM d, yyyy")}
                                  {renewalUrgency(selected.renewal_date) && ` · ${renewalUrgency(selected.renewal_date)?.label}`}
                                </span>
                              </div>
                            )}
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground text-xs">Added</span>
                              <span className="text-xs font-mono">{formatDistanceToNow(new Date(selected.created_at), { addSuffix: true })}</span>
                            </div>
                          </div>

                          {/* Data access */}
                          {selected.data_access.length > 0 && (
                            <div>
                              <div className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-1.5">Data Accessed</div>
                              <div className="flex flex-wrap gap-1.5">
                                {selected.data_access.map(t => (
                                  <span key={t} className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${t === "PII" || t === "Health data" ? "bg-red-50 dark:bg-red-950/20 text-red-600 border-red-300/50" : t === "Financial" ? "bg-orange-50 dark:bg-orange-950/20 text-orange-600 border-orange-300/50" : "bg-secondary text-muted-foreground border-border"}`}>
                                    {t}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Notes */}
                          {selected.notes && (
                            <div>
                              <div className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-1">Notes</div>
                              <p className="text-xs text-muted-foreground leading-relaxed">{selected.notes}</p>
                            </div>
                          )}

                          {/* Actions */}
                          <div className="flex gap-2 pt-2 border-t border-border">
                            <Button size="sm" variant="outline" className="flex-1 text-xs h-8" onClick={() => startEdit(selected)}>
                              <Edit2 className="w-3 h-3 mr-1.5" />Edit
                            </Button>
                            <Button size="sm" variant="ghost" className="h-8 text-xs text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => remove(selected.id)}>
                              <Trash2 className="w-3 h-3 mr-1.5" />Delete
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </TabsContent>

        {/* ── Risk Matrix Tab ───────────────────────────────────────────────── */}
        <TabsContent value="risk">
          {items.length === 0 ? (
            <div className="surface-card p-12 text-center text-sm text-muted-foreground">Add vendors to see the risk matrix.</div>
          ) : (
            <div className="space-y-5">
              {/* Risk quadrant chart */}
              <div className="surface-card p-5">
                <div className="text-xs font-mono uppercase text-muted-foreground tracking-wider mb-4">
                  Risk Distribution by Criticality &amp; SOC 2 Status
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "High Risk",    items: withRisk.filter(v => v._risk >= 70),               color: "border-red-300/50 bg-red-50/50 dark:bg-red-950/10" },
                    { label: "Medium Risk",  items: withRisk.filter(v => v._risk >= 40 && v._risk < 70), color: "border-orange-300/50 bg-orange-50/50 dark:bg-orange-950/10" },
                    { label: "Low Risk",     items: withRisk.filter(v => v._risk >= 20 && v._risk < 40), color: "border-yellow-300/50 bg-yellow-50/50 dark:bg-yellow-950/10" },
                    { label: "Minimal Risk", items: withRisk.filter(v => v._risk < 20),                 color: "border-emerald-300/50 bg-emerald-50/50 dark:bg-emerald-950/10" },
                  ].map(({ label, items: grp, color }) => (
                    <div key={label} className={`rounded-lg border p-3 ${color}`}>
                      <div className="text-xs font-semibold mb-2">{label} <span className="text-muted-foreground font-mono">({grp.length})</span></div>
                      <div className="flex flex-wrap gap-1.5">
                        {grp.length === 0 ? (
                          <span className="text-[10px] text-muted-foreground italic">None</span>
                        ) : grp.map(v => (
                          <button key={v.id} onClick={() => { setSelected(v); setMainTab("list"); }}
                            className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-background border border-border hover:border-primary/50 transition-colors">
                            {v.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Full ranked table */}
              <div className="surface-card overflow-hidden">
                <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                  <div className="text-xs font-mono uppercase text-muted-foreground tracking-wider">All Vendors — Ranked by Risk</div>
                  <span className="text-xs text-muted-foreground">{withRisk.length} vendors</span>
                </div>
                <div className="divide-y divide-border/50">
                  {[...withRisk].sort((a, b) => b._risk - a._risk).map((v, idx) => {
                    const rl      = riskLabel(v._risk);
                    const urgency = renewalUrgency(v.renewal_date);
                    return (
                      <button key={v.id} onClick={() => { setSelected(v); setMainTab("list"); }}
                        className="w-full flex items-center gap-4 px-5 py-3 hover:bg-secondary/30 transition-colors text-left">
                        <span className="text-xs font-mono text-muted-foreground w-5 shrink-0">#{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm truncate">{v.name}</span>
                            <span className="text-[10px] font-mono text-muted-foreground">{v.category}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="w-24 h-1 rounded-full bg-secondary overflow-hidden">
                              <div className={`h-full rounded-full ${rl.bg}`} style={{ width: `${v._risk}%` }} />
                            </div>
                            <span className={`text-[10px] font-mono ${rl.color}`}>{v._risk}/100</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {urgency && <span className={`text-[10px] font-mono ${urgency.color}`}>{urgency.label}</span>}
                          <span className={`text-[10px] font-mono text-muted-foreground`}>{v.soc2_status.replace("_", " ")}</span>
                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </AppShell>
  );
};

export default Vendors;
