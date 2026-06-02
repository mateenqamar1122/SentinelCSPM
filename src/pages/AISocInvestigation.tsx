import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { AppShell } from "@/components/cspm/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ArrowLeft, Brain, ShieldAlert, CheckCircle2, XCircle, AlertTriangle,
  ChevronRight, Loader2, Sparkles, Siren, Lock, Workflow,
} from "lucide-react";

const verdictMeta: Record<string, { label: string; cls: string; icon: any }> = {
  true_positive: { label: "True Positive", cls: "text-destructive border-destructive/30 bg-destructive/10", icon: ShieldAlert },
  false_positive: { label: "False Positive", cls: "text-muted-foreground border-border bg-muted", icon: XCircle },
  benign: { label: "Benign", cls: "text-emerald-500 border-emerald-500/30 bg-emerald-500/10", icon: CheckCircle2 },
  needs_human: { label: "Needs Human Review", cls: "text-amber-500 border-amber-500/30 bg-amber-500/10", icon: AlertTriangle },
  pending: { label: "Pending", cls: "text-muted-foreground border-border bg-secondary", icon: Loader2 },
};

export default function AISocInvestigation() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [alert, setAlert] = useState<any>(null);
  const [inv, setInv] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [overriding, setOverriding] = useState(false);

  async function load() {
    if (!id) return;
    setLoading(true);
    const [{ data: a }, { data: invs }] = await Promise.all([
      (supabase as any).from("soc_alerts").select("*").eq("id", id).maybeSingle(),
      (supabase as any).from("soc_investigations").select("*").eq("alert_id", id).order("created_at", { ascending: false }).limit(1),
    ]);
    setAlert(a);
    setInv(invs?.[0] ?? null);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  async function setVerdict(verdict: string) {
    setOverriding(true);
    const { error } = await (supabase as any).from("soc_alerts").update({ ai_verdict: verdict, status: "closed" }).eq("id", id);
    setOverriding(false);
    if (error) return toast.error(error.message);
    toast.success("Verdict overridden");
    load();
  }

  async function promoteToIncident() {
    if (!alert) return;
    const { getSessionId } = await import("@/lib/session");
    const { error } = await (supabase as any).from("incidents").insert({
      session_id: getSessionId(),
      title: `[SIEM] ${alert.title}`,
      severity: alert.severity,
      summary: inv?.summary ?? "Promoted from AI SOC investigation.",
      playbook: "data-breach",
      timeline: [{ at: new Date().toISOString(), event: "Promoted from AI SOC", verdict: alert.ai_verdict }],
    });
    if (error) return toast.error(error.message);
    toast.success("Incident opened");
    navigate("/incidents");
  }

  if (loading) return <AppShell><div className="p-10 text-center"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></div></AppShell>;
  if (!alert) return <AppShell><Card className="p-10 text-center">Alert not found.</Card></AppShell>;

  const v = verdictMeta[alert.ai_verdict] ?? verdictMeta.pending;
  const VIcon = v.icon;
  const flags: string[] = inv?.guardrail_flags ?? [];

  return (
    <AppShell>
      <Button variant="ghost" size="sm" asChild className="mb-3"><Link to="/ai-soc"><ArrowLeft className="w-4 h-4 mr-1" /> Back to inbox</Link></Button>

      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-mono mb-1">
            <Sparkles className="w-3 h-3" /> AI investigation · {inv?.model ?? "agent"}
          </div>
          <h1 className="text-2xl font-serif">{alert.title}</h1>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Badge variant="outline">{alert.severity}</Badge>
            <Badge variant="outline">{alert.source}</Badge>
            <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded border font-mono inline-flex items-center gap-1 ${v.cls}`}>
              <VIcon className="w-3 h-3" /> {v.label}
              {alert.ai_confidence != null && ` · ${Math.round(Number(alert.ai_confidence) * 100)}%`}
            </span>
            {alert.mitre_tactics?.map((t: string) => <Badge key={t} variant="secondary">{t}</Badge>)}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setVerdict("false_positive")} disabled={overriding}>Mark FP</Button>
          <Button variant="outline" size="sm" onClick={() => setVerdict("true_positive")} disabled={overriding}>Mark TP</Button>
          <Button size="sm" onClick={promoteToIncident}><Siren className="w-3.5 h-3.5 mr-1" /> Open Incident</Button>
        </div>
      </div>

      {/* AI banner */}
      <Card className="p-3 mb-4 border-primary/30 bg-primary/5 flex items-center gap-2 text-sm">
        <Brain className="w-4 h-4 text-primary" />
        <span><span className="font-semibold">AI-generated investigation.</span> Verdicts and actions are recommendations — review evidence before acting.</span>
      </Card>

      {/* Guardrail flags */}
      {flags.length > 0 && (
        <Card className="p-3 mb-4 border-amber-500/30 bg-amber-500/5">
          <div className="text-xs font-semibold text-amber-500 mb-1 flex items-center gap-1"><ShieldAlert className="w-3.5 h-3.5" /> Guardrail flags</div>
          <div className="flex flex-wrap gap-1">
            {flags.map((f) => <Badge key={f} variant="outline" className="text-amber-500 border-amber-500/30">{f}</Badge>)}
          </div>
        </Card>
      )}

      {!inv ? (
        <Card className="p-8 text-center text-muted-foreground">No investigation yet.</Card>
      ) : (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <Card className="p-5">
              <div className="text-xs uppercase tracking-wider font-mono text-muted-foreground mb-2">Executive summary</div>
              <p className="text-sm leading-relaxed">{inv.summary}</p>
            </Card>

            <Card className="p-5">
              <div className="text-xs uppercase tracking-wider font-mono text-muted-foreground mb-3 flex items-center gap-2">
                <Workflow className="w-3.5 h-3.5" /> Reasoning trail
              </div>
              <ol className="space-y-3">
                {(inv.reasoning_steps as any[]).map((s, i) => (
                  <li key={i} className="border-l-2 border-primary/40 pl-3">
                    <div className="text-sm font-semibold">{i + 1}. {s.step}</div>
                    <div className="text-xs text-muted-foreground mt-0.5"><span className="font-mono">hypothesis:</span> {s.hypothesis}</div>
                    <div className="text-xs text-muted-foreground"><span className="font-mono">evidence:</span> {s.evidence}</div>
                    <Badge variant="outline" className="mt-1 text-[10px]">{s.outcome}</Badge>
                  </li>
                ))}
              </ol>
            </Card>

            <Card className="p-5">
              <div className="text-xs uppercase tracking-wider font-mono text-muted-foreground mb-3">Recommended actions <span className="ml-1 text-amber-500">(human approval required)</span></div>
              <div className="space-y-2">
                {(inv.recommended_actions as any[]).map((a, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded border bg-muted/30">
                    <Lock className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium flex items-center gap-2">
                        {a.title}
                        <Badge variant="outline" className="text-[10px]">{a.kind}</Badge>
                        <Badge variant="secondary" className="text-[10px]">{a.priority}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{a.rationale}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="p-5">
              <div className="text-xs uppercase tracking-wider font-mono text-muted-foreground mb-2">Entities</div>
              {(() => {
                const e = inv.enrichments?.entities ?? {};
                const groups = ["ips", "users", "hosts", "hashes", "processes"] as const;
                return (
                  <div className="space-y-2 text-sm">
                    {groups.map((g) => (e[g]?.length ?? 0) > 0 && (
                      <div key={g}>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">{g}</div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {e[g].map((x: string) => <Badge key={x} variant="outline" className="font-mono text-[11px]">{x}</Badge>)}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </Card>

            <Card className="p-5">
              <div className="text-xs uppercase tracking-wider font-mono text-muted-foreground mb-2">MITRE ATT&CK</div>
              <div className="space-y-1">
                <div className="text-[10px] text-muted-foreground font-mono">Tactics</div>
                <div className="flex flex-wrap gap-1">{(alert.mitre_tactics ?? []).map((t: string) => <Badge key={t}>{t}</Badge>)}</div>
                <div className="text-[10px] text-muted-foreground font-mono mt-2">Techniques</div>
                <div className="flex flex-wrap gap-1">{(inv.enrichments?.mitre_techniques ?? []).map((t: string) => <Badge key={t} variant="outline">{t}</Badge>)}</div>
              </div>
            </Card>

            <Card className="p-5">
              <div className="text-xs uppercase tracking-wider font-mono text-muted-foreground mb-2">Raw alert</div>
              <pre className="text-[11px] font-mono whitespace-pre-wrap text-muted-foreground overflow-auto max-h-64">{JSON.stringify(alert.raw, null, 2)}</pre>
            </Card>
          </div>
        </div>
      )}
    </AppShell>
  );
}
