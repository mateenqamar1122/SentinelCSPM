import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "@/components/cspm/AppShell";
import { Button } from "@/components/ui/button";
import { Brain, Loader2, ShieldCheck, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getSessionId } from "@/lib/session";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { SeverityBadge, type Severity } from "@/components/cspm/SeverityBadge";
import type { Database } from "@/integrations/supabase/types";

type Finding = Database["public"]["Tables"]["findings"]["Row"];
type Scan = Database["public"]["Tables"]["scans"]["Row"];

// Heuristic snippets representing the project's own AI surface; in a real product
// we'd fetch from the Supabase Management API. Including representative samples here
// gives the scanner real content to flag.
const PROJECT_SOURCES = [
  {
    file: "edge/chat-assistant/index.ts",
    source: `const messages = [{ role: "user", content: \`User said: \${req.body.message}. Help them.\` }];
await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", body: JSON.stringify({ model: "gpt-4", messages }) });`,
  },
  {
    file: "edge/customer-support/index.ts",
    source: `// Forward customer message including SSN if present
const prompt = "Customer ticket: " + req.body.text;
await fetch("https://api.anthropic.com/v1/messages", { method: "POST", body: JSON.stringify({ messages: [{ role: "user", content: prompt }] }) });`,
  },
];

const AISecurity = () => {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [scans, setScans] = useState<Scan[]>([]);
  const [running, setRunning] = useState(false);

  const load = async () => {
    const [{ data: f }, { data: s }] = await Promise.all([
      supabase.from("findings").select("*").eq("asset_type", "ai_workflow").order("created_at", { ascending: false }),
      supabase.from("scans").select("*").eq("scan_kind", "ai_security").order("started_at", { ascending: false }).limit(5),
    ]);
    setFindings(f ?? []); setScans(s ?? []);
  };

  useEffect(() => { document.title = "AI Security — SentinelCSPM"; load(); }, []);

  const run = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("scan-ai-workflows", {
        body: { sources: PROJECT_SOURCES, includeDemo: true },
        headers: { "x-session-id": getSessionId() },
      });
      if (error) throw error;
      toast.success(`Detected ${(data as { findings?: number })?.findings ?? 0} AI security events`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Scan failed");
    } finally { setRunning(false); }
  };

  const grouped = useMemo(() => {
    const g: Record<string, Finding[]> = {};
    for (const f of findings) (g[f.category] ||= []).push(f);
    return g;
  }, [findings]);

  const counts = {
    injection: findings.filter(f => f.category === "Prompt Injection").length,
    pii:       findings.filter(f => f.category === "PII Leakage").length,
    shadow:    findings.filter(f => f.category === "Shadow AI").length,
  };

  return (
    <AppShell>
      <div className="flex items-end justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">AI Workflow Security</h1>
          <p className="text-muted-foreground mt-1">Prompt injection, PII leakage to LLMs, and shadow AI usage across your edge functions and SaaS traffic.</p>
        </div>
        <Button onClick={run} disabled={running}>
          {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Brain className="w-4 h-4 mr-2" />}
          {running ? "Analyzing…" : "Run AI security scan"}
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="surface-card p-4"><div className="text-xs font-mono uppercase text-muted-foreground">Prompt Injection</div><div className="text-2xl font-bold text-severity-high">{counts.injection}</div></div>
        <div className="surface-card p-4"><div className="text-xs font-mono uppercase text-muted-foreground">PII Leakage</div><div className="text-2xl font-bold text-severity-high">{counts.pii}</div></div>
        <div className="surface-card p-4"><div className="text-xs font-mono uppercase text-muted-foreground">Shadow AI</div><div className="text-2xl font-bold text-severity-medium">{counts.shadow}</div></div>
      </div>

      {scans.length > 0 && (
        <div className="surface-card p-4 mb-6">
          <div className="text-xs font-mono uppercase text-muted-foreground mb-2">Recent AI scans</div>
          <ul className="divide-y divide-border">
            {scans.map(s => (
              <li key={s.id} className="py-2 flex items-center justify-between">
                <div className="text-sm">
                  {formatDistanceToNow(new Date(s.started_at), { addSuffix: true })} · {s.total_findings} findings
                </div>
                <Link to={`/scans/${s.id}`} className="text-xs text-primary inline-flex items-center gap-1">View <ArrowRight className="w-3 h-3" /></Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {findings.length === 0 ? (
        <div className="surface-card p-12 text-center">
          <ShieldCheck className="w-8 h-8 mx-auto text-accent mb-3" />
          <h2 className="text-lg font-semibold">No AI security findings yet</h2>
          <p className="text-sm text-muted-foreground mb-4">Run a scan — we inspect your edge functions for unsafe LLM patterns and surface demo events for prompt injection, PII leakage, and shadow AI.</p>
          <Button onClick={run} disabled={running}>
            {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Brain className="w-4 h-4 mr-2" />}Run AI security scan
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat}>
              <h2 className="text-sm font-mono uppercase tracking-wider text-muted-foreground mb-2">{cat} <span className="text-foreground/60">({items.length})</span></h2>
              <ul className="space-y-2">
                {items.map(f => (
                  <li key={f.id} className="surface-card p-4">
                    <div className="flex items-start gap-3">
                      <SeverityBadge severity={f.severity as Severity} className="mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{f.title}</div>
                        <div className="text-xs font-mono text-muted-foreground truncate">{f.resource}</div>
                        <p className="text-sm text-foreground/90 mt-2">{f.description}</p>
                        <p className="text-sm text-muted-foreground mt-2 whitespace-pre-line"><span className="text-[10px] uppercase font-mono mr-1">Mitigation:</span>{f.mitigation}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
};

export default AISecurity;
