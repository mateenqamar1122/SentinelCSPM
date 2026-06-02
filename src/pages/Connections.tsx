import { useEffect, useState } from "react";
import { AppShell } from "@/components/cspm/AppShell";
import { ProviderBadge, providerLabel } from "@/components/cspm/ProviderBadge";
import { AddConnectionDialog } from "@/components/cspm/AddConnectionDialog";
import { StartScanButton } from "@/components/cspm/StartScanButton";
import { Button } from "@/components/ui/button";
import { Trash2, Cloud } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import type { Database } from "@/integrations/supabase/types";

type Conn = Omit<Database["public"]["Tables"]["cloud_connections"]["Row"], "credentials">;

const Connections = () => {
  const [items, setItems] = useState<Conn[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("cloud_connections")
      .select("id, session_id, provider, name, status, last_scan_at, created_at, updated_at")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setItems(data ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); document.title = "Connections — SentinelCSPM"; }, []);

  const remove = async (id: string) => {
    if (!confirm("Delete this connection and all its scans?")) return;
    const { error } = await supabase.from("cloud_connections").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Connection deleted");
    load();
  };

  return (
    <AppShell>
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Cloud Connections</h1>
          <p className="text-muted-foreground mt-1">Connect cloud accounts with read-only credentials, then run a scan.</p>
        </div>
        <AddConnectionDialog onCreated={load} />
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : items.length === 0 ? (
        <div className="surface-card p-12 text-center">
          <Cloud className="w-8 h-8 mx-auto text-primary mb-3" />
          <h2 className="text-lg font-semibold">No connections yet</h2>
          <p className="text-sm text-muted-foreground mb-4">Add AWS, GCP, Azure — or pick "Demo" to see the dashboard with example findings.</p>
          <AddConnectionDialog onCreated={load} />
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {items.map((c) => (
            <div key={c.id} className="surface-card p-5 flex flex-col gap-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <ProviderBadge provider={c.provider} withLabel={false} />
                  <div>
                    <div className="font-semibold">{c.name}</div>
                    <div className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
                      {providerLabel(c.provider)} · {c.status}
                    </div>
                  </div>
                </div>
                <Button size="icon" variant="ghost" onClick={() => remove(c.id)} aria-label="Delete">
                  <Trash2 className="w-4 h-4 text-muted-foreground" />
                </Button>
              </div>
              <div className="text-xs text-muted-foreground">
                {c.last_scan_at ? `Last scan ${formatDistanceToNow(new Date(c.last_scan_at), { addSuffix: true })}` : "Never scanned"}
              </div>
              <div className="mt-auto pt-2">
                <StartScanButton connectionId={c.id} provider={c.provider} />
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
};

export default Connections;
