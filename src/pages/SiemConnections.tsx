import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "@/components/cspm/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { ArrowLeft, Plus, Server, Trash2, Copy, ChevronDown, Zap, RefreshCw } from "lucide-react";

const PROVIDERS = [
  { id: "splunk", label: "Splunk" },
  { id: "sentinel", label: "Microsoft Sentinel" },
  { id: "elastic", label: "Elastic Security" },
  { id: "chronicle", label: "Google Chronicle" },
  { id: "datadog", label: "Datadog Cloud SIEM" },
  { id: "qradar", label: "IBM QRadar" },
  { id: "wazuh", label: "Wazuh" },
  { id: "other", label: "Other" },
];

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

function ingestUrl(token: string) {
  return `${SUPABASE_URL}/functions/v1/siem-ingest?token=${token}`;
}

export default function SiemConnections() {
  const { user } = useAuth();
  const [conns, setConns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState("splunk");
  const [name, setName] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const { data } = await (supabase as any).from("siem_connections").select("*").order("created_at", { ascending: false });
    setConns(data ?? []);
    setLoading(false);
  }
  useEffect(() => { if (user) load(); else setLoading(false); }, [user]);

  async function add() {
    if (!user || !name) return;
    const { error } = await (supabase as any).from("siem_connections").insert({
      user_id: user.id, provider, name, config: { endpoint }, status: "connected",
    });
    if (error) return toast.error(error.message);
    toast.success("SIEM connected — copy the webhook URL into your SIEM's alert action");
    setOpen(false); setName(""); setEndpoint("");
    load();
  }

  async function remove(id: string) {
    const { error } = await (supabase as any).from("siem_connections").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  }

  function copy(text: string, label = "URL") {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  }

  async function sendTest(c: any) {
    setBusy(c.id);
    try {
      const r = await fetch(ingestUrl(c.ingest_token), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: `test-${Date.now()}`,
          title: `Test alert from ${c.name}`,
          severity: "high",
          rule_name: "manual_test_event",
          message: "Synthetic alert sent from the AI SOC connection panel.",
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Ingest failed");
      toast.success(`Ingested ${data.inserted} alert — check the inbox`);
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  }

  if (!user) {
    return <AppShell><Card className="p-10 text-center">Sign in to manage SIEM connections.</Card></AppShell>;
  }

  return (
    <AppShell>
      <Button variant="ghost" size="sm" asChild className="mb-3"><Link to="/ai-soc"><ArrowLeft className="w-4 h-4 mr-1" /> Back to AI SOC</Link></Button>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-serif">SIEM Connections</h1>
          <p className="text-muted-foreground">Each connection gets a unique webhook URL. Point your SIEM's alert action at it and alerts stream into the AI SOC inbox in real time.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-1" /> Connect SIEM</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Connect a SIEM</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Provider</Label>
                <Select value={provider} onValueChange={setProvider}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="prod-splunk" /></div>
              <div><Label>Endpoint (optional, for your reference)</Label><Input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://splunk.acme.com:8089" /></div>
              <p className="text-xs text-muted-foreground">After creating, copy the webhook URL and paste it into your SIEM's webhook / HTTP alert action.</p>
            </div>
            <DialogFooter><Button onClick={add} disabled={!name}>Connect</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        {loading ? <div className="p-6">Loading…</div> :
          conns.length === 0 ? <div className="p-10 text-center text-muted-foreground">No SIEM connections yet.</div> : (
          <div className="divide-y">
            {conns.map((c) => {
              const url = ingestUrl(c.ingest_token);
              return (
                <div key={c.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Server className="w-5 h-5 text-primary" />
                      <div>
                        <div className="font-medium">{c.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {PROVIDERS.find((p) => p.id === c.provider)?.label} ·{" "}
                          {c.last_sync_at ? `last alert ${new Date(c.last_sync_at).toLocaleString()}` : "no alerts yet"}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={
                        c.status === "stale" ? "text-amber-500 border-amber-500/30" :
                        c.status === "disabled" ? "text-muted-foreground" :
                        "text-emerald-500 border-emerald-500/30"
                      }>{c.status}</Badge>
                      <Button variant="outline" size="sm" onClick={() => sendTest(c)} disabled={busy === c.id}>
                        {busy === c.id ? <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Zap className="w-3.5 h-3.5 mr-1" />}
                        Send test alert
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(c.id)}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </div>
                  <Collapsible className="mt-3">
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="text-xs"><ChevronDown className="w-3.5 h-3.5 mr-1" /> Webhook setup</Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-2 space-y-2">
                      <div>
                        <Label className="text-xs">Webhook URL (POST JSON alerts here)</Label>
                        <div className="flex gap-2 mt-1">
                          <Input readOnly value={url} className="font-mono text-xs" />
                          <Button variant="outline" size="icon" onClick={() => copy(url, "Webhook URL")}><Copy className="w-4 h-4" /></Button>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground space-y-1">
                        <div>· Send a single alert object or an array of alerts (max 200 per request).</div>
                        <div>· We auto-extract <code className="font-mono">title</code>, <code className="font-mono">severity</code>, and <code className="font-mono">id</code> from the payload — the rest is stored as raw evidence.</div>
                        <div>· Duplicate alerts (same <code className="font-mono">id</code>) are ignored automatically.</div>
                      </div>
                      <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground">Example curl</summary>
                        <pre className="mt-2 p-2 bg-muted rounded text-[11px] overflow-auto">{`curl -X POST '${url}' \\
  -H 'Content-Type: application/json' \\
  -d '{"id":"evt-123","title":"Brute force on bastion","severity":"high","src_ip":"1.2.3.4"}'`}</pre>
                      </details>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </AppShell>
  );
}
