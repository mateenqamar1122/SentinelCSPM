import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/cspm/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import {
  FileQuestion, Loader2, Copy, Sparkles, Save, Download, Edit2,
  CheckCircle2, AlertCircle, HelpCircle, History, BookOpen, Plus,
  Trash2, RefreshCw, X, Search, ChevronDown, ChevronUp, ClipboardList,
  FileText, Share2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getSessionId } from "@/lib/session";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";

// ── Types ─────────────────────────────────────────────────────────────────────

type Confidence = "high" | "medium" | "low";
type Answer = { question: string; answer: string; confidence: Confidence };

type SavedQuestionnaire = {
  id: string;
  name: string;
  questions: string[];
  answers: Answer[];
  created_at: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const CONFIDENCE_META: Record<Confidence, { label: string; color: string; icon: React.ReactNode }> = {
  high:   { label: "High confidence",   color: "text-emerald-600", icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> },
  medium: { label: "Medium confidence", color: "text-yellow-600",  icon: <AlertCircle  className="w-3.5 h-3.5 text-yellow-500" /> },
  low:    { label: "Low confidence",    color: "text-red-500",     icon: <HelpCircle   className="w-3.5 h-3.5 text-red-400" /> },
};

// Question template packs
const TEMPLATE_PACKS: { name: string; tag: string; questions: string[] }[] = [
  {
    name: "SOC 2 Vendor Assessment",
    tag: "SOC 2",
    questions: [
      "Do you have a SOC 2 Type II report? Can you share it?",
      "Do you enforce MFA on all administrator accounts?",
      "How do you handle logical access controls and least privilege?",
      "Do you conduct annual penetration testing? Who performs it?",
      "Describe your vulnerability management and patch cadence.",
      "How is customer data encrypted at rest and in transit?",
      "Do you have a formal incident response plan? Describe your breach notification process.",
      "How often do you review and revoke access for terminated employees?",
      "Do you perform background checks on employees with access to customer data?",
      "Describe your business continuity and disaster recovery plan.",
    ],
  },
  {
    name: "GDPR / Privacy Assessment",
    tag: "GDPR",
    questions: [
      "Do you act as a data processor or data controller for customer data?",
      "Have you signed a Data Processing Agreement (DPA)?",
      "Do you transfer EU personal data to third countries? Under what mechanism?",
      "How do you respond to Data Subject Access Requests (DSARs)?",
      "Describe your data retention and deletion policies.",
      "Do you use sub-processors? How are they managed?",
      "How do you handle personal data breaches and notify affected parties?",
      "Do you maintain records of processing activities (ROPA)?",
    ],
  },
  {
    name: "HIPAA / Healthcare",
    tag: "HIPAA",
    questions: [
      "Are you willing to sign a Business Associate Agreement (BAA)?",
      "Describe how you protect electronic Protected Health Information (ePHI).",
      "Do you audit access to ePHI? How long are audit logs retained?",
      "How is ePHI encrypted at rest and in transit?",
      "Describe your workforce security training on HIPAA requirements.",
      "Do you have a contingency plan for ePHI availability during outages?",
      "How do you ensure minimum necessary access to PHI?",
    ],
  },
  {
    name: "General Security Baseline",
    tag: "General",
    questions: [
      "Do you have an information security policy? When was it last reviewed?",
      "How do you manage secrets, API keys, and credentials?",
      "Do you use a bug bounty program or coordinated vulnerability disclosure?",
      "Describe your software development lifecycle (SDLC) security practices.",
      "Do you scan container images and open-source dependencies for vulnerabilities?",
      "What cloud provider(s) do you use? Are you using dedicated or shared tenancy?",
      "How do you monitor for and alert on suspicious activity?",
    ],
  },
];

const DEFAULT_TEXT = TEMPLATE_PACKS[0].questions.slice(0, 5).join("\n");

// ── Component ─────────────────────────────────────────────────────────────────

const Questionnaire = () => {
  const [name, setName]       = useState("Acme Corp Vendor Assessment");
  const [text, setText]       = useState(DEFAULT_TEXT);
  const [busy, setBusy]       = useState(false);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [history, setHistory] = useState<SavedQuestionnaire[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const [tab, setTab]         = useState("compose");
  const [search, setSearch]   = useState("");
  // Per-answer editing
  const [editIdx, setEditIdx]   = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  // Template dialog
  const [tmplOpen, setTmplOpen] = useState(false);
  // Expand/collapse answers
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  useEffect(() => { document.title = "Security Questionnaire — SentinelCSPM"; loadHistory(); }, []);

  // ── Load history ─────────────────────────────────────────────────────────────

  const loadHistory = async () => {
    setHistLoading(true);
    const { data, error } = await (supabase as any)
      .from("questionnaires").select("*").order("created_at", { ascending: false }).limit(20);
    if (!error) setHistory((data ?? []) as SavedQuestionnaire[]);
    setHistLoading(false);
  };

  // ── Generate ─────────────────────────────────────────────────────────────────

  const generate = async () => {
    const questions = text.split("\n").map(s => s.trim()).filter(Boolean);
    if (questions.length === 0) return toast.error("Add at least one question");
    setBusy(true); setAnswers([]); setEditIdx(null); setCollapsed(new Set());
    try {
      const { data, error } = await supabase.functions.invoke("answer-questionnaire", {
        body: { questions, sessionId: getSessionId() },
      });
      if (error) throw error;
      const list: Answer[] = data?.answers ?? [];
      setAnswers(list);
      await (supabase as any).from("questionnaires").insert({
        session_id: getSessionId(), name, questions, answers: list,
      });
      toast.success(`Drafted ${list.length} answers`);
      setTab("answers");
      loadHistory();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to draft answers");
    } finally { setBusy(false); }
  };

  // ── Load saved questionnaire ──────────────────────────────────────────────────

  const loadSaved = (q: SavedQuestionnaire) => {
    setName(q.name);
    setText(q.questions.join("\n"));
    setAnswers(q.answers);
    setEditIdx(null);
    setCollapsed(new Set());
    setTab("answers");
  };

  const deleteSaved = async (id: string) => {
    if (!confirm("Delete this questionnaire?")) return;
    await (supabase as any).from("questionnaires").delete().eq("id", id);
    setHistory(prev => prev.filter(q => q.id !== id));
    toast.success("Deleted");
  };

  // ── Answer editing ────────────────────────────────────────────────────────────

  const startEdit = (i: number) => { setEditIdx(i); setEditText(answers[i].answer); };

  const saveEdit = (i: number) => {
    setAnswers(prev => prev.map((a, idx) => idx === i ? { ...a, answer: editText } : a));
    setEditIdx(null);
    toast.success("Answer updated");
  };

  const toggleCollapse = (i: number) => {
    setCollapsed(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });
  };

  // ── Template helpers ─────────────────────────────────────────────────────────

  const addTemplateQuestions = (questions: string[]) => {
    const existing = text.trim();
    const combined = existing
      ? [...new Set([...existing.split("\n").map(s => s.trim()).filter(Boolean), ...questions])].join("\n")
      : questions.join("\n");
    setText(combined);
    setTmplOpen(false);
    toast.success(`Added ${questions.length} template questions`);
    setTab("compose");
  };

  // ── Export ────────────────────────────────────────────────────────────────────

  const copyMarkdown = async () => {
    const md = [
      `# ${name}`,
      `_Generated ${format(new Date(), "MMMM d, yyyy 'at' HH:mm")}_`,
      "",
      ...answers.map((a, i) =>
        `### ${i + 1}. ${a.question}\n\n${a.answer}\n\n_Confidence: ${a.confidence}_`
      ),
    ].join("\n\n---\n\n");
    await navigator.clipboard.writeText(md);
    toast.success("Copied as Markdown");
  };

  const exportJSON = () => {
    const payload = { name, generated: new Date().toISOString(), answers };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    a.download = `${name.replace(/\s+/g, "-").toLowerCase()}.json`;
    a.click();
    toast.success("Exported as JSON");
  };

  const exportText = () => {
    const txt = answers.map((a, i) =>
      `Q${i + 1}: ${a.question}\n\nA: ${a.answer}\n\n[Confidence: ${a.confidence}]`
    ).join("\n\n" + "─".repeat(60) + "\n\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([txt], { type: "text/plain" }));
    a.download = `${name.replace(/\s+/g, "-").toLowerCase()}.txt`;
    a.click();
    toast.success("Exported as plain text");
  };

  // ── Derived ───────────────────────────────────────────────────────────────────

  const questionCount = useMemo(() =>
    text.split("\n").map(s => s.trim()).filter(Boolean).length,
    [text]
  );

  const confidenceStats = useMemo(() => ({
    high:   answers.filter(a => a.confidence === "high").length,
    medium: answers.filter(a => a.confidence === "medium").length,
    low:    answers.filter(a => a.confidence === "low").length,
  }), [answers]);

  const filteredHistory = useMemo(() =>
    history.filter(q => !search || q.name.toLowerCase().includes(search.toLowerCase())),
    [history, search]
  );

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <AppShell>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Security Questionnaire</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Paste enterprise security questionnaires and get AI-drafted answers based on your compliance posture, vendors, and checklist. Always review before sending.
          </p>
        </div>
        {answers.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={copyMarkdown}>
              <Copy className="w-3.5 h-3.5 mr-1.5" />Copy Markdown
            </Button>
            <Button variant="outline" size="sm" onClick={exportText}>
              <FileText className="w-3.5 h-3.5 mr-1.5" />Export TXT
            </Button>
            <Button variant="outline" size="sm" onClick={exportJSON}>
              <Download className="w-3.5 h-3.5 mr-1.5" />Export JSON
            </Button>
          </div>
        )}
      </div>

      {/* Main tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-3 w-full max-w-md mb-6">
          <TabsTrigger value="compose" className="flex items-center gap-1.5">
            <ClipboardList className="w-3.5 h-3.5" />Compose
          </TabsTrigger>
          <TabsTrigger value="answers" className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            Answers
            {answers.length > 0 && (
              <Badge className="h-4 px-1 text-[9px] bg-primary text-primary-foreground border-0 ml-0.5">{answers.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-1.5">
            <History className="w-3.5 h-3.5" />History
          </TabsTrigger>
        </TabsList>

        {/* ── Compose Tab ───────────────────────────────────────────────────── */}
        <TabsContent value="compose">
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Left: question input */}
            <div className="lg:col-span-2 surface-card p-5 space-y-4">
              <div>
                <Label>Questionnaire name</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Acme Corp Vendor Assessment Q2 2025" />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label>Questions <span className="text-muted-foreground font-mono text-xs ml-1">({questionCount})</span></Label>
                  <div className="flex items-center gap-2">
                    {text.trim() && (
                      <button onClick={() => setText("")}
                        className="text-[10px] text-muted-foreground hover:text-red-500 flex items-center gap-1 transition-colors">
                        <X className="w-3 h-3" />Clear
                      </button>
                    )}
                    <Dialog open={tmplOpen} onOpenChange={setTmplOpen}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" className="h-7 text-xs">
                          <BookOpen className="w-3 h-3 mr-1.5" />Templates
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl">
                        <DialogHeader><DialogTitle>Question Template Library</DialogTitle></DialogHeader>
                        <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
                          {TEMPLATE_PACKS.map(pack => (
                            <div key={pack.name} className="surface-card p-4">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-sm">{pack.name}</span>
                                  <Badge variant="outline" className="text-[10px]">{pack.tag}</Badge>
                                  <span className="text-[10px] text-muted-foreground font-mono">{pack.questions.length} questions</span>
                                </div>
                                <Button size="sm" className="h-7 text-xs" onClick={() => addTemplateQuestions(pack.questions)}>
                                  <Plus className="w-3 h-3 mr-1" />Use template
                                </Button>
                              </div>
                              <ul className="space-y-1">
                                {pack.questions.slice(0, 4).map((q, i) => (
                                  <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                                    <span className="font-mono text-[10px] mt-0.5 shrink-0">{i + 1}.</span>{q}
                                  </li>
                                ))}
                                {pack.questions.length > 4 && (
                                  <li className="text-[10px] text-muted-foreground italic">+{pack.questions.length - 4} more…</li>
                                )}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
                <Textarea
                  value={text}
                  onChange={e => setText(e.target.value)}
                  rows={14}
                  className="font-mono text-sm resize-y"
                  placeholder={"Paste questions here, one per line.\n\nExample:\nDo you enforce MFA on all admin accounts?\nDo you have a SOC 2 Type II report?\nDescribe your incident response process."}
                />
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  One question per line. The AI will draft answers using your live compliance posture, vendor list, and checklist data.
                </p>
              </div>

              <Button onClick={generate} disabled={busy || questionCount === 0} className="w-full h-10">
                {busy
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Drafting {questionCount} answers…</>
                  : <><Sparkles className="w-4 h-4 mr-2" />Draft {questionCount} answer{questionCount !== 1 ? "s" : ""} with AI</>
                }
              </Button>
            </div>

            {/* Right: tips + template picks */}
            <div className="space-y-4">
              <div className="surface-card p-4">
                <div className="text-xs font-mono uppercase text-muted-foreground tracking-wider mb-3 flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5" />Quick Templates
                </div>
                <div className="space-y-2">
                  {TEMPLATE_PACKS.map(pack => (
                    <button key={pack.name} onClick={() => addTemplateQuestions(pack.questions)}
                      className="w-full text-left p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-secondary/30 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">{pack.name}</span>
                        <Badge variant="outline" className="text-[9px] ml-auto">{pack.questions.length}q</Badge>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{pack.tag}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="surface-card p-4">
                <div className="text-xs font-mono uppercase text-muted-foreground tracking-wider mb-3">Tips</div>
                <ul className="space-y-2 text-xs text-muted-foreground">
                  <li className="flex items-start gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />One question per line for best results</li>
                  <li className="flex items-start gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />Use templates for standard frameworks (SOC 2, GDPR, HIPAA)</li>
                  <li className="flex items-start gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />Always review and edit low-confidence answers before sending</li>
                  <li className="flex items-start gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />Save responses are stored in History for re-use</li>
                </ul>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ── Answers Tab ───────────────────────────────────────────────────── */}
        <TabsContent value="answers">
          {answers.length === 0 ? (
            <div className="surface-card p-16 text-center">
              <FileQuestion className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
              <h2 className="text-lg font-semibold mb-1">No answers yet</h2>
              <p className="text-sm text-muted-foreground mb-4">Go to the Compose tab, enter your questions, and click "Draft answers with AI".</p>
              <Button onClick={() => setTab("compose")}>
                <ClipboardList className="w-4 h-4 mr-2" />Go to Compose
              </Button>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Stats bar */}
              <div className="surface-card p-4 flex items-center gap-6 flex-wrap">
                <div>
                  <div className="text-2xl font-bold">{answers.length}</div>
                  <div className="text-[10px] font-mono uppercase text-muted-foreground">Total answers</div>
                </div>
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span className="text-muted-foreground w-20">High</span>
                    <Progress value={(confidenceStats.high / answers.length) * 100} className="flex-1 h-1.5" />
                    <span className="font-mono w-5 text-right">{confidenceStats.high}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <AlertCircle className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
                    <span className="text-muted-foreground w-20">Medium</span>
                    <Progress value={(confidenceStats.medium / answers.length) * 100} className="flex-1 h-1.5" />
                    <span className="font-mono w-5 text-right">{confidenceStats.medium}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <HelpCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    <span className="text-muted-foreground w-20">Low</span>
                    <Progress value={(confidenceStats.low / answers.length) * 100} className="flex-1 h-1.5" />
                    <span className="font-mono w-5 text-right">{confidenceStats.low}</span>
                  </div>
                </div>
                {confidenceStats.low > 0 && (
                  <div className="text-xs text-red-500 bg-red-50 dark:bg-red-950/20 border border-red-200/50 rounded-lg p-2.5 max-w-xs">
                    ⚠️ <strong>{confidenceStats.low}</strong> low-confidence answer{confidenceStats.low > 1 ? "s" : ""} need manual review before sending.
                  </div>
                )}
              </div>

              {/* Answer list */}
              <div className="space-y-3">
                {answers.map((a, i) => {
                  const conf = CONFIDENCE_META[a.confidence];
                  const isCollapsedItem = collapsed.has(i);
                  const isEditing = editIdx === i;
                  return (
                    <div key={i} className={`surface-card overflow-hidden border-l-4 ${a.confidence === "high" ? "border-l-emerald-500" : a.confidence === "medium" ? "border-l-yellow-500" : "border-l-red-400"}`}>
                      {/* Question header */}
                      <button className="w-full text-left px-5 py-3 flex items-start gap-3 hover:bg-secondary/20 transition-colors"
                        onClick={() => toggleCollapse(i)}>
                        <span className="text-xs font-mono text-muted-foreground shrink-0 mt-0.5 w-6">{i + 1}.</span>
                        <span className="font-medium text-sm flex-1">{a.question}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`flex items-center gap-1 text-[10px] font-mono ${conf.color}`}>
                            {conf.icon}{conf.label}
                          </span>
                          {isCollapsedItem
                            ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
                        </div>
                      </button>

                      {/* Answer body */}
                      {!isCollapsedItem && (
                        <div className="px-5 pb-4 border-t border-border/50 bg-secondary/10">
                          {isEditing ? (
                            <div className="pt-3 space-y-2">
                              <Textarea
                                autoFocus
                                rows={6}
                                value={editText}
                                onChange={e => setEditText(e.target.value)}
                                className="text-sm font-mono resize-y"
                              />
                              <div className="flex gap-2">
                                <Button size="sm" className="h-7 text-xs" onClick={() => saveEdit(i)}>
                                  <Save className="w-3 h-3 mr-1.5" />Save
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditIdx(null)}>Cancel</Button>
                              </div>
                            </div>
                          ) : (
                            <div className="pt-3">
                              <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">{a.answer}</p>
                              <div className="flex items-center gap-2 mt-3">
                                <button onClick={() => startEdit(i)}
                                  className="text-[10px] flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded border border-border hover:border-primary/50">
                                  <Edit2 className="w-3 h-3" />Edit answer
                                </button>
                                <button onClick={async () => { await navigator.clipboard.writeText(a.answer); toast.success("Copied"); }}
                                  className="text-[10px] flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded border border-border hover:border-primary/50">
                                  <Copy className="w-3 h-3" />Copy
                                </button>
                                {a.confidence === "low" && (
                                  <span className="text-[10px] text-red-500 bg-red-50 dark:bg-red-950/20 border border-red-200/50 px-2 py-1 rounded flex items-center gap-1">
                                    <HelpCircle className="w-3 h-3" />Review required
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Re-generate */}
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setTab("compose")}>
                  <Edit2 className="w-3.5 h-3.5 mr-1.5" />Edit questions
                </Button>
                <Button onClick={generate} disabled={busy}>
                  {busy ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Regenerating…</> : <><RefreshCw className="w-3.5 h-3.5 mr-1.5" />Regenerate</>}
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── History Tab ───────────────────────────────────────────────────── */}
        <TabsContent value="history">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="relative flex-1 max-w-xs">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-8 h-8 text-sm" placeholder="Search questionnaires…" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <Button variant="outline" size="sm" onClick={loadHistory} disabled={histLoading}>
                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${histLoading ? "animate-spin" : ""}`} />Refresh
              </Button>
            </div>

            {histLoading ? (
              <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>
            ) : filteredHistory.length === 0 ? (
              <div className="surface-card p-12 text-center">
                <History className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">{history.length === 0 ? "No questionnaires saved yet. Generate your first one!" : "No results match your search."}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredHistory.map(q => {
                  const highConf   = q.answers.filter(a => a.confidence === "high").length;
                  const lowConf    = q.answers.filter(a => a.confidence === "low").length;
                  const completePct = q.answers.length > 0 ? Math.round((highConf / q.answers.length) * 100) : 0;
                  return (
                    <div key={q.id} className="surface-card p-4 hover:border-primary/40 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-semibold text-sm truncate">{q.name}</span>
                            <span className="text-[10px] text-muted-foreground font-mono">
                              {q.questions.length}q · {q.answers.length} answers
                            </span>
                            {lowConf > 0 && (
                              <Badge variant="outline" className="text-[9px] text-yellow-600 border-yellow-400/50">
                                {lowConf} need review
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <Progress value={completePct} className="flex-1 max-w-[160px] h-1.5" />
                            <span className="text-[10px] font-mono text-muted-foreground">{completePct}% high confidence</span>
                          </div>
                          <div className="text-[10px] text-muted-foreground font-mono mt-1.5">
                            {formatDistanceToNow(new Date(q.created_at), { addSuffix: true })} · {format(new Date(q.created_at), "MMM d, yyyy")}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button size="sm" className="h-7 text-xs" onClick={() => loadSaved(q)}>
                            Load
                          </Button>
                          <Button size="icon" variant="ghost" className="w-7 h-7" onClick={() => deleteSaved(q.id)}>
                            <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
};

export default Questionnaire;
