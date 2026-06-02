import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/cspm/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Send } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

const statusStyles: Record<string, string> = {
  requested: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  accepted: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  in_progress: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30",
  completed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  declined: "bg-muted text-muted-foreground border-border",
  cancelled: "bg-muted text-muted-foreground border-border",
};

const STATUS_TRANSITIONS: Record<string, { label: string; next: string; role: "pentester" | "startup" | "either" }[]> = {
  requested: [
    { label: "Accept", next: "accepted", role: "pentester" },
    { label: "Decline", next: "declined", role: "pentester" },
    { label: "Cancel", next: "cancelled", role: "startup" },
  ],
  accepted: [
    { label: "Mark in progress", next: "in_progress", role: "pentester" },
    { label: "Cancel", next: "cancelled", role: "either" },
  ],
  in_progress: [
    { label: "Mark completed", next: "completed", role: "pentester" },
  ],
};

export default function EngagementDetail() {
  const { id } = useParams();
  const { user, loading: authLoading } = useAuth();
  const [eng, setEng] = useState<any>(null);
  const [profiles, setProfiles] = useState<Map<string, any>>(new Map());
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!id) return;
    const { data: e } = await supabase.from("engagements").select("*").eq("id", id).maybeSingle();
    setEng(e);
    if (e) {
      const ids = [e.startup_id, e.pentester_id];
      const { data: profs } = await supabase.from("profiles").select("user_id, display_name, avatar_url").in("user_id", ids);
      setProfiles(new Map((profs ?? []).map((p) => [p.user_id, p])));
      const { data: msgs } = await supabase.from("engagement_messages").select("*").eq("engagement_id", id).order("created_at");
      setMessages(msgs ?? []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  useEffect(() => {
    if (!id) return;
    const channel = supabase.channel(`engagement-${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "engagement_messages", filter: `engagement_id=eq.${id}` },
        (payload) => setMessages((prev) => [...prev, payload.new]))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  if (authLoading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  const sendMessage = async () => {
    if (!body.trim() || !id) return;
    setBusy(true);
    const { error } = await supabase.from("engagement_messages").insert({ engagement_id: id, sender_id: user.id, body: body.trim() });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setBody("");
  };

  const updateStatus = async (next: string) => {
    if (!id) return;
    const { error } = await supabase.from("engagements").update({ status: next as any }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Status updated");
    load();
  };

  if (loading) return <AppShell><div className="text-center py-20 text-muted-foreground">Loading...</div></AppShell>;
  if (!eng) return <AppShell><div className="text-center py-20"><p className="mb-4">Engagement not found.</p><Button asChild><Link to="/dashboard/engagements">Back</Link></Button></div></AppShell>;

  const isStartup = user.id === eng.startup_id;
  const startup = profiles.get(eng.startup_id);
  const pentester = profiles.get(eng.pentester_id);
  const transitions = (STATUS_TRANSITIONS[eng.status] ?? []).filter(t =>
    t.role === "either" || (t.role === "startup" && isStartup) || (t.role === "pentester" && !isStartup)
  );

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto">
        <Link to="/dashboard/engagements" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="w-4 h-4" /> All engagements
        </Link>

        <Card className="p-6 mb-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-serif mb-1">{eng.title}</h1>
              <p className="text-sm text-muted-foreground">
                Startup: <strong className="text-foreground">{startup?.display_name ?? "—"}</strong> · Pentester: <strong className="text-foreground">{pentester?.display_name ?? "—"}</strong>
              </p>
            </div>
            <Badge variant="outline" className={`capitalize ${statusStyles[eng.status] ?? ""}`}>{eng.status.replace("_", " ")}</Badge>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm border-t border-border pt-4 mb-4">
            <div><div className="text-xs text-muted-foreground mb-0.5">Budget</div><div>{eng.budget ? `$${eng.budget.toLocaleString()}` : "—"}</div></div>
            <div><div className="text-xs text-muted-foreground mb-0.5">Timeline</div><div>{eng.timeline || "—"}</div></div>
            <div><div className="text-xs text-muted-foreground mb-0.5">Created</div><div>{formatDistanceToNow(new Date(eng.created_at), { addSuffix: true })}</div></div>
          </div>

          <div className="border-t border-border pt-4 mb-4">
            <div className="text-xs text-muted-foreground mb-2">Scope</div>
            <p className="text-sm whitespace-pre-wrap">{eng.scope}</p>
          </div>

          {transitions.length > 0 && (
            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              {transitions.map((t) => (
                <Button key={t.next} variant={t.next === "declined" || t.next === "cancelled" ? "outline" : "cta"}
                  size="sm" onClick={() => updateStatus(t.next)}>{t.label}</Button>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="font-semibold mb-4">Messages</h2>
          <div className="space-y-3 mb-4 max-h-96 overflow-y-auto">
            {messages.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No messages yet.</p>}
            {messages.map((m) => {
              const mine = m.sender_id === user.id;
              const sender = profiles.get(m.sender_id);
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
                    {!mine && <div className="text-[10px] opacity-70 mb-0.5">{sender?.display_name ?? "User"}</div>}
                    <div className="whitespace-pre-wrap">{m.body}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex gap-2 border-t border-border pt-4">
            <Textarea rows={2} maxLength={2000} placeholder="Write a message..." value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendMessage(); }} />
            <Button variant="cta" onClick={sendMessage} disabled={busy || !body.trim()} className="self-end">
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
