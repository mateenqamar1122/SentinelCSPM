import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PentesterCard, PentesterCardData } from "@/components/marketplace/PentesterCard";
import {
  Shield, Search, UserPlus, LogOut, Star, BarChart3,
  X, ChevronDown, ChevronUp, ShieldCheck, Award, Users,
  MapPin, SlidersHorizontal, ArrowUpDown, AlertCircle,
} from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────

const SPECIALTY_FILTERS = ["All", "Web App", "Cloud", "API", "Mobile", "Network", "AI/ML", "Smart Contract", "IoT", "Red Team"];
const SORT_OPTIONS = [
  { value: "verified",    label: "Verified first" },
  { value: "rate_asc",   label: "Rate: Low to High" },
  { value: "rate_desc",  label: "Rate: High to Low" },
  { value: "experience", label: "Most experienced" },
  { value: "newest",     label: "Recently joined" },
];

const SAVED_KEY = "cspm_saved_pentesters";

function getSaved(): string[] {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY) ?? "[]"); } catch { return []; }
}
function setSaved(ids: string[]) { localStorage.setItem(SAVED_KEY, JSON.stringify(ids)); }

// ── Component ─────────────────────────────────────────────────────────────────

export default function Marketplace() {
  const { user, signOut } = useAuth();
  const [pentesters, setPentesters] = useState<PentesterCardData[]>([]);
  const [loading, setLoading]       = useState(true);
  // Filters
  const [query, setQuery]           = useState("");
  const [filter, setFilter]         = useState("All");
  const [availability, setAvailability] = useState<"all" | "available" | "limited">("all");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [minRate, setMinRate]       = useState("");
  const [maxRate, setMaxRate]       = useState("");
  const [sortBy, setSortBy]         = useState("verified");
  const [showFilters, setShowFilters] = useState(false);
  // Save & compare
  const [savedIds, setSavedIds]     = useState<string[]>(getSaved());
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [activeTab, setActiveTab]   = useState<"all" | "saved">("all");

  useEffect(() => {
    document.title = "Pentester Marketplace — SentinelCSPM";
    (async () => {
      const { data: rows } = await supabase
        .from("pentester_profiles").select("*").eq("published", true)
        .order("verified", { ascending: false }).order("created_at", { ascending: false });
      const ids = (rows ?? []).map((r) => r.user_id);
      const { data: profs } = ids.length
        ? await supabase.from("profiles").select("user_id, display_name, avatar_url").in("user_id", ids)
        : { data: [] as any[] };
      const profMap = new Map((profs ?? []).map((p) => [p.user_id, p]));
      setPentesters((rows ?? []).map((r) => ({ ...r, profile: profMap.get(r.user_id) ?? null })) as PentesterCardData[]);
      setLoading(false);
    })();
  }, []);

  // ── Save/compare helpers ──────────────────────────────────────────────────────

  const toggleSave = (id: string) => {
    setSavedIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      setSaved(next);
      return next;
    });
  };

  const toggleCompare = (id: string) => {
    setCompareIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id)
        : prev.length < 3 ? [...prev, id]
        : prev // max 3
    );
  };

  // ── Filtering + sorting ───────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = [...pentesters];

    // Tab
    if (activeTab === "saved") list = list.filter(p => savedIds.includes(p.id));

    // Search
    if (query) list = list.filter(p =>
      [p.headline, p.bio, p.location ?? "", ...p.skills, ...p.specialties, p.profile?.display_name ?? ""]
        .join(" ").toLowerCase().includes(query.toLowerCase())
    );

    // Specialty filter
    if (filter !== "All") list = list.filter(p =>
      [...p.skills, ...p.specialties].some(s => s.toLowerCase().includes(filter.toLowerCase()))
    );

    // Availability
    if (availability !== "all") list = list.filter(p => p.availability === availability);

    // Verified
    if (verifiedOnly) list = list.filter(p => p.verified);

    // Rate
    if (minRate) list = list.filter(p => p.hourly_rate != null && p.hourly_rate >= Number(minRate));
    if (maxRate) list = list.filter(p => p.hourly_rate != null && p.hourly_rate <= Number(maxRate));

    // Sort
    list.sort((a, b) => {
      if (sortBy === "rate_asc")    return (a.hourly_rate ?? 9999) - (b.hourly_rate ?? 9999);
      if (sortBy === "rate_desc")   return (b.hourly_rate ?? 0) - (a.hourly_rate ?? 0);
      if (sortBy === "experience")  return b.years_experience - a.years_experience;
      if (sortBy === "verified")    return Number(b.verified) - Number(a.verified);
      return 0;
    });

    return list;
  }, [pentesters, query, filter, availability, verifiedOnly, minRate, maxRate, sortBy, activeTab, savedIds]);

  // ── Stats ─────────────────────────────────────────────────────────────────────

  const stats = useMemo(() => ({
    total:      pentesters.length,
    available:  pentesters.filter(p => p.availability === "available").length,
    verified:   pentesters.filter(p => p.verified).length,
    avgRate:    (() => {
      const withRate = pentesters.filter(p => p.hourly_rate);
      return withRate.length ? Math.round(withRate.reduce((s, p) => s + (p.hourly_rate ?? 0), 0) / withRate.length) : null;
    })(),
  }), [pentesters]);

  // Compare panel data
  const compareList = pentesters.filter(p => compareIds.includes(p.id));
  const activeFilters = (query ? 1 : 0) + (filter !== "All" ? 1 : 0) + (availability !== "all" ? 1 : 0) + (verifiedOnly ? 1 : 0) + (minRate || maxRate ? 1 : 0);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="container flex h-16 items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2.5 shrink-0">
            <div className="w-9 h-9 grid place-items-center rounded-full bg-primary text-primary-foreground">
              <Shield className="w-4 h-4" />
            </div>
            <div className="leading-tight">
              <div className="text-base font-serif tracking-tight">Sentinel<span className="italic">CSPM</span></div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono">pentester marketplace</div>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            {user ? (
              <>
                <Button variant="ghost" size="sm" asChild><Link to="/dashboard">Dashboard</Link></Button>
                <Button variant="ghost" size="icon" onClick={() => signOut()}><LogOut className="w-4 h-4" /></Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" asChild><Link to="/auth">Sign in</Link></Button>
                <Button variant="cta" size="sm" asChild>
                  <Link to="/auth?mode=signup&role=pentester"><UserPlus className="w-3.5 h-3.5 mr-1" />Become a pentester</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="container py-12 md:py-16">
        {/* Hero */}
        <div className="max-w-3xl mb-10">
          <div className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-primary bg-primary/10 border border-primary/20 rounded-full px-3 py-1 mb-4">
            <ShieldCheck className="w-3 h-3" />Vetted Security Experts
          </div>
          <h1 className="text-4xl md:text-5xl font-serif tracking-tight mb-4">Hire vetted pentesters</h1>
          <p className="text-lg text-muted-foreground">
            Browse independent security researchers. Scope a test, agree on terms, and get an actionable report — all in one place.
          </p>
        </div>

        {/* Stat bar */}
        {!loading && pentesters.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            {[
              { label: "Security experts",  value: stats.total,     icon: Users,      color: "text-foreground" },
              { label: "Available now",     value: stats.available, icon: ShieldCheck, color: "text-emerald-600" },
              { label: "Verified",          value: stats.verified,  icon: Award,       color: "text-primary" },
              { label: "Avg rate",          value: stats.avgRate ? `$${stats.avgRate}/hr` : "—", icon: BarChart3, color: "text-foreground" },
            ].map(({ label, value, icon: Icon, color }) => (
              <Card key={label} className="p-4 flex items-center gap-3">
                <Icon className={`w-4 h-4 shrink-0 ${color}`} />
                <div>
                  <div className={`text-xl font-bold ${color}`}>{value}</div>
                  <div className="text-[10px] font-mono uppercase text-muted-foreground">{label}</div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Search + filter bar */}
        <div className="space-y-3 mb-6">
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by skill, cert, name, location…"
                value={query} onChange={(e) => setQuery(e.target.value)}
                className="pl-9 h-11"
              />
              {query && (
                <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <Button variant="outline" className="h-11" onClick={() => setShowFilters(v => !v)}>
              <SlidersHorizontal className="w-4 h-4 mr-2" />
              Filters {activeFilters > 0 && <span className="ml-1.5 bg-primary text-primary-foreground text-[10px] rounded-full w-4 h-4 flex items-center justify-center">{activeFilters}</span>}
              {showFilters ? <ChevronUp className="w-3.5 h-3.5 ml-2" /> : <ChevronDown className="w-3.5 h-3.5 ml-2" />}
            </Button>
            <div className="flex items-center gap-1.5 border border-border rounded-md px-2 h-11">
              <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                className="bg-transparent text-sm outline-none text-foreground pr-1">
                {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {/* Expandable filter panel */}
          {showFilters && (
            <Card className="p-4">
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <div className="text-xs font-mono uppercase text-muted-foreground mb-2">Availability</div>
                  <div className="flex gap-2 flex-wrap">
                    {[["all", "All"], ["available", "Available"], ["limited", "Limited"]] .map(([v, l]) => (
                      <button key={v} onClick={() => setAvailability(v as any)}
                        className={`px-3 py-1 text-xs rounded-full border transition-colors ${availability === v ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-mono uppercase text-muted-foreground mb-2">Verification</div>
                  <button onClick={() => setVerifiedOnly(v => !v)}
                    className={`px-3 py-1 text-xs rounded-full border transition-colors flex items-center gap-1.5 ${verifiedOnly ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                    <ShieldCheck className="w-3 h-3" />Verified only
                  </button>
                </div>
                <div>
                  <div className="text-xs font-mono uppercase text-muted-foreground mb-2">Rate range ($/hr)</div>
                  <div className="flex items-center gap-2">
                    <Input type="number" placeholder="Min" value={minRate} onChange={e => setMinRate(e.target.value)} className="h-8 text-xs" />
                    <span className="text-muted-foreground text-sm">–</span>
                    <Input type="number" placeholder="Max" value={maxRate} onChange={e => setMaxRate(e.target.value)} className="h-8 text-xs" />
                  </div>
                </div>
                <div className="flex items-end">
                  {activeFilters > 0 && (
                    <button onClick={() => { setAvailability("all"); setVerifiedOnly(false); setMinRate(""); setMaxRate(""); setFilter("All"); setQuery(""); }}
                      className="text-xs text-muted-foreground hover:text-red-500 flex items-center gap-1 transition-colors">
                      <X className="w-3.5 h-3.5" />Clear all filters
                    </button>
                  )}
                </div>
              </div>
            </Card>
          )}

          {/* Specialty pills */}
          <div className="flex flex-wrap gap-2">
            {SPECIALTY_FILTERS.map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  filter === f ? "bg-foreground text-background border-foreground" : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/50"
                }`}>
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Tab bar: All / Saved */}
        <div className="flex items-center gap-4 mb-6">
          {[["all", "All Pentesters"], ["saved", `Saved (${savedIds.length})`]].map(([v, l]) => (
            <button key={v} onClick={() => setActiveTab(v as any)}
              className={`text-sm font-medium pb-1 border-b-2 transition-colors ${activeTab === v ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {l}
            </button>
          ))}
          <span className="text-xs text-muted-foreground font-mono ml-auto">
            {filtered.length} result{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Compare bar */}
        {compareIds.length > 0 && (
          <Card className="p-4 mb-6 border-primary/40 bg-primary/5 flex items-center gap-4 flex-wrap">
            <span className="text-sm font-semibold">Comparing {compareIds.length}/3:</span>
            {compareList.map(p => (
              <div key={p.id} className="flex items-center gap-2 text-sm">
                <span className="font-medium">{p.profile?.display_name ?? "Anon"}</span>
                <button onClick={() => toggleCompare(p.id)} className="text-muted-foreground hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
              </div>
            ))}
            {compareIds.length === 2 && (
              <span className="text-xs text-muted-foreground italic">Add 1 more to compare</span>
            )}
            {compareIds.length >= 2 && (
              <div className="ml-auto">
                <ComparePanel pentesters={compareList} onClose={() => setCompareIds([])} />
              </div>
            )}
          </Card>
        )}

        {/* Grid */}
        {loading ? (
          <div className="text-center py-20 text-muted-foreground">
            <Shield className="w-8 h-8 mx-auto mb-3 animate-pulse text-primary" />
            Loading pentesters...
          </div>
        ) : filtered.length === 0 ? (
          <Card className="p-12 text-center">
            <AlertCircle className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
            <h3 className="text-lg font-semibold mb-1">
              {activeTab === "saved" ? "No saved pentesters" : "No pentesters match your filters"}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {activeTab === "saved"
                ? "Click ★ on any pentester card to save them for later."
                : "Try adjusting your search or filters."}
            </p>
            {activeTab !== "saved" && pentesters.length === 0 && (
              <Button variant="cta" asChild>
                <Link to="/auth?mode=signup&role=pentester">Create pentester profile</Link>
              </Button>
            )}
            {activeFilters > 0 && (
              <Button variant="outline" onClick={() => { setAvailability("all"); setVerifiedOnly(false); setMinRate(""); setMaxRate(""); setFilter("All"); setQuery(""); }}>
                Clear filters
              </Button>
            )}
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((p) => (
              <PentesterCard
                key={p.id} p={p}
                saved={savedIds.includes(p.id)}
                onToggleSave={() => toggleSave(p.id)}
                compareSelected={compareIds.includes(p.id)}
                onToggleCompare={() => toggleCompare(p.id)}
              />
            ))}
          </div>
        )}

        {/* CTA strip */}
        {!user && (
          <div className="mt-16 rounded-2xl border border-border bg-secondary/30 p-10 text-center">
            <h2 className="text-2xl font-serif mb-2">Are you a security researcher?</h2>
            <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
              Create a free profile, showcase your skills and certifications, and get hired by startups preparing for SOC 2, ISO 27001, and enterprise security reviews.
            </p>
            <Button variant="cta" size="lg" asChild>
              <Link to="/auth?mode=signup&role=pentester"><UserPlus className="w-4 h-4 mr-2" />Create a free pentester profile</Link>
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}

// ── Compare Panel ─────────────────────────────────────────────────────────────

function ComparePanel({ pentesters, onClose }: { pentesters: PentesterCardData[]; onClose: () => void }) {
  const [open, setOpen] = useState(false);

  const rows: { label: string; get: (p: PentesterCardData) => React.ReactNode }[] = [
    { label: "Name",         get: p => p.profile?.display_name ?? "—" },
    { label: "Rate",         get: p => p.hourly_rate ? `$${p.hourly_rate}/hr` : "On request" },
    { label: "Experience",   get: p => `${p.years_experience} yrs` },
    { label: "Availability", get: p => p.availability },
    { label: "Verified",     get: p => p.verified ? "✓ Yes" : "✕ No" },
    { label: "Skills",       get: p => p.skills.slice(0, 4).join(", ") },
    { label: "Certs",        get: p => p.certifications.slice(0, 3).join(", ") || "—" },
    { label: "Location",     get: p => p.location ?? "—" },
  ];

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Compare side-by-side
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-background rounded-xl border border-border shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="font-bold text-lg">Side-by-side comparison</h2>
              <button onClick={() => setOpen(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="p-5 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left text-xs font-mono uppercase text-muted-foreground pb-3 w-28" />
                    {pentesters.map(p => (
                      <th key={p.id} className="text-center pb-3 px-2 font-semibold">
                        {p.profile?.display_name ?? "Anonymous"}
                        {p.verified && <span className="text-primary ml-1">✓</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ label, get }) => (
                    <tr key={label} className="border-t border-border/50">
                      <td className="text-xs text-muted-foreground font-mono py-2.5 pr-3 whitespace-nowrap">{label}</td>
                      {pentesters.map(p => (
                        <td key={p.id} className="text-center py-2.5 px-2 text-sm">{get(p)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex justify-end gap-3 mt-5 pt-4 border-t border-border">
                {pentesters.map(p => (
                  <Button key={p.id} size="sm" asChild>
                    <Link to={`/marketplace/pentester/${p.id}`}>View {p.profile?.display_name?.split(" ")[0] ?? "profile"} →</Link>
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
