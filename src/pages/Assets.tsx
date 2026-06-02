import { useEffect, useState } from "react";
import { AppShell } from "@/components/cspm/AppShell";
import { AssetBadge, assetLabel } from "@/components/cspm/AssetBadge";
import { AddAssetDialog } from "@/components/cspm/AddAssetDialog";
import { RealScanDialog } from "@/components/cspm/RealScanDialog";
import { StartAssetScanButton } from "@/components/cspm/StartAssetScanButton";
import { Button } from "@/components/ui/button";
import { Trash2, Boxes } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import type { Database } from "@/integrations/supabase/types";

type Asset = Database["public"]["Tables"]["assets"]["Row"];

const Assets = () => {
  const [items, setItems] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("assets").select("*")
      .neq("asset_type", "ai_workflow")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setItems(data ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); document.title = "Assets — SentinelCSPM"; }, []);

  const remove = async (id: string) => {
    if (!confirm("Delete this asset and all its scans?")) return;
    const { error } = await supabase.from("assets").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Asset removed");
    load();
  };

  return (
    <AppShell>
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Code & Container Assets</h1>
          <p className="text-muted-foreground mt-1">
            Repos, container images and Kubernetes clusters scanned for CVEs, secrets, and IaC issues.
            Use <span className="text-foreground font-medium">Real Scan</span> to get live results from OSV.dev, Gitleaks, and Checkov-style rules.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RealScanDialog />
          <AddAssetDialog onCreated={load} />
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : items.length === 0 ? (
        <div className="surface-card p-12 text-center">
          <Boxes className="w-8 h-8 mx-auto text-primary mb-3" />
          <h2 className="text-lg font-semibold">No assets yet</h2>
          <p className="text-sm text-muted-foreground mb-4">Add a repo, image, or cluster to start scanning.</p>
          <AddAssetDialog onCreated={load} />
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {items.map((a) => (
            <div key={a.id} className="surface-card p-5 flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <AssetBadge type={a.asset_type} withLabel={false} />
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{a.name}</div>
                    <div className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
                      {assetLabel(a.asset_type)} · {a.status}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono mt-1 truncate">{a.identifier}</div>
                  </div>
                </div>
                <Button size="icon" variant="ghost" onClick={() => remove(a.id)} aria-label="Delete">
                  <Trash2 className="w-4 h-4 text-muted-foreground" />
                </Button>
              </div>
              <div className="text-xs text-muted-foreground">
                {a.last_scan_at ? `Last scan ${formatDistanceToNow(new Date(a.last_scan_at), { addSuffix: true })}` : "Never scanned"}
              </div>
              <div className="mt-auto pt-2">
                <StartAssetScanButton assetId={a.id} />
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
};

export default Assets;
