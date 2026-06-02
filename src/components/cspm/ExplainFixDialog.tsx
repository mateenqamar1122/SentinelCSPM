import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, Copy, Check, AlertTriangle, Clock, Briefcase, Code2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type Finding = Database["public"]["Tables"]["findings"]["Row"];

interface Explanation {
  plain_explanation: string;
  business_impact: string;
  urgency: string;
  engineer_brief: string;
  ticket_title: string;
  ticket_body: string;
}

const URGENCY_STYLES: Record<string, string> = {
  "fix today":              "border-severity-critical/50 bg-severity-critical-bg text-severity-critical",
  "fix this week":          "border-severity-high/50 bg-severity-high-bg text-severity-high",
  "fix this sprint":        "border-severity-medium/50 bg-severity-medium-bg text-severity-medium",
  "track but low priority": "border-severity-low/50 bg-severity-low-bg text-severity-low",
};

export const ExplainFixDialog = ({ finding }: { finding: Finding }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Explanation | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const fetchExplanation = async () => {
    if (data || loading) return;
    setLoading(true);
    const { data: result, error } = await supabase.functions.invoke("explain-finding", {
      body: {
        title: finding.title, description: finding.description, mitigation: finding.mitigation,
        severity: finding.severity, category: finding.category, resource: finding.resource,
        rule_id: finding.rule_id, cve_id: finding.cve_id, compliance: finding.compliance,
      },
    });
    setLoading(false);
    if (error || (result as { error?: string })?.error) {
      const msg = (result as { error?: string })?.error ?? error?.message ?? "Failed to load explanation";
      toast.error(msg);
      return;
    }
    setData(result as Explanation);
  };

  const copy = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(null), 2000);
  };

  const ticketMarkdown = data
    ? `# ${data.ticket_title}\n\n${data.ticket_body}\n\n---\n\n**Source:** SentinelCSPM\n**Rule:** \`${finding.rule_id}\`\n**Severity:** ${finding.severity}${finding.cve_id ? `\n**CVE:** ${finding.cve_id}` : ""}`
    : "";

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) fetchExplanation(); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-primary" /> Explain & Fix
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> AI Explain & Fix
          </DialogTitle>
          <DialogDescription className="line-clamp-2">{finding.title}</DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            Translating into plain English…
          </div>
        )}

        {data && (
          <div className="space-y-4">
            <div className={`flex items-center gap-2 px-3 py-2 rounded-md border text-xs font-mono uppercase tracking-wider ${URGENCY_STYLES[data.urgency] ?? "border-border bg-secondary text-foreground"}`}>
              <Clock className="w-3.5 h-3.5" />
              {data.urgency}
            </div>

            <Tabs defaultValue="plain">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="plain"><Briefcase className="w-3.5 h-3.5 mr-1.5" />For you</TabsTrigger>
                <TabsTrigger value="engineer"><Code2 className="w-3.5 h-3.5 mr-1.5" />For engineer</TabsTrigger>
                <TabsTrigger value="ticket"><Copy className="w-3.5 h-3.5 mr-1.5" />Ticket</TabsTrigger>
              </TabsList>

              <TabsContent value="plain" className="space-y-4 mt-4">
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-mono text-muted-foreground mb-1.5">What's happening</div>
                  <p className="text-sm leading-relaxed">{data.plain_explanation}</p>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-mono text-muted-foreground mb-1.5 flex items-center gap-1.5">
                    <AlertTriangle className="w-3 h-3" /> Why it matters for your business
                  </div>
                  <p className="text-sm leading-relaxed">{data.business_impact}</p>
                </div>
              </TabsContent>

              <TabsContent value="engineer" className="mt-4 space-y-3">
                <div className="surface-card p-4 text-sm whitespace-pre-wrap font-mono leading-relaxed max-h-[400px] overflow-y-auto">
                  {data.engineer_brief}
                </div>
                <Button size="sm" variant="outline" className="w-full" onClick={() => copy(data.engineer_brief, "brief")}>
                  {copied === "brief" ? <Check className="w-3.5 h-3.5 mr-2" /> : <Copy className="w-3.5 h-3.5 mr-2" />}
                  Copy brief for your engineer
                </Button>
              </TabsContent>

              <TabsContent value="ticket" className="mt-4 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Paste this directly into GitHub Issues, Linear, Jira, or Slack — it's formatted markdown.
                </p>
                <div className="surface-card p-4 text-xs whitespace-pre-wrap font-mono leading-relaxed max-h-[400px] overflow-y-auto">
                  {ticketMarkdown}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" variant="outline" onClick={() => copy(ticketMarkdown, "ticket")}>
                    {copied === "ticket" ? <Check className="w-3.5 h-3.5 mr-2" /> : <Copy className="w-3.5 h-3.5 mr-2" />}
                    Copy as markdown
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <a
                      href={`https://github.com/issues/new?title=${encodeURIComponent(data.ticket_title)}&body=${encodeURIComponent(data.ticket_body)}`}
                      target="_blank" rel="noreferrer"
                    >
                      Open in GitHub
                    </a>
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
