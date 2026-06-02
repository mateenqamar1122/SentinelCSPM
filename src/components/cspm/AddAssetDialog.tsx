import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Loader2, GitBranch, Container, Boxes } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getSessionId } from "@/lib/session";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type AssetType = Database["public"]["Enums"]["asset_type"];
type Tab = "code_repo" | "container_image" | "kubernetes";

interface Props { onCreated?: () => void; trigger?: React.ReactNode }

export const AddAssetDialog = ({ onCreated, trigger }: Props) => {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("code_repo");
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");

  const placeholders: Record<Tab, { name: string; id: string; label: string; help: string }> = {
    code_repo:       { name: "acme/api-server",       id: "https://github.com/acme/api-server",          label: "Repository URL",   help: "Public or private repo URL — we scan for CVEs in deps, secrets and IaC issues." },
    container_image: { name: "api-server:prod",       id: "ghcr.io/acme/api-server:1.2.0",                label: "Image reference",  help: "OCI image reference — we scan layers for CVEs, exposed secrets and config issues." },
    kubernetes:      { name: "prod-cluster",          id: "arn:aws:eks:us-east-1:111122223333:cluster/prod", label: "Cluster identifier", help: "EKS/GKE/AKS ARN or kubeconfig context — we audit RBAC, NetworkPolicies and Pod Security." },
  };

  const reset = () => { setName(""); setIdentifier(""); };

  const submit = async () => {
    if (!name.trim() || !identifier.trim()) {
      toast.error("Name and identifier are required.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("assets").insert({
      session_id: getSessionId(),
      asset_type: tab as AssetType,
      name: name.trim(),
      identifier: identifier.trim(),
      metadata: {},
    });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Asset added — start a scan to populate findings.");
    reset(); setOpen(false); onCreated?.();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? <Button><Plus className="w-4 h-4 mr-1" />Add asset</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Add a scannable asset</DialogTitle>
          <DialogDescription>
            Code repos, container images and Kubernetes clusters scanned for CVEs, leaked secrets, and IaC misconfigurations.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="code_repo"><GitBranch className="w-3 h-3 mr-1" />Code Repo</TabsTrigger>
            <TabsTrigger value="container_image"><Container className="w-3 h-3 mr-1" />Container</TabsTrigger>
            <TabsTrigger value="kubernetes"><Boxes className="w-3 h-3 mr-1" />Kubernetes</TabsTrigger>
          </TabsList>

          {(["code_repo","container_image","kubernetes"] as Tab[]).map(k => (
            <TabsContent key={k} value={k} className="space-y-3 mt-4">
              <p className="text-xs text-muted-foreground">{placeholders[k].help}</p>
              <div className="space-y-2">
                <Label>Display name</Label>
                <Input className="font-mono" placeholder={placeholders[k].name} value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{placeholders[k].label}</Label>
                <Input className="font-mono" placeholder={placeholders[k].id} value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
              </div>
            </TabsContent>
          ))}
        </Tabs>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Add asset
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
