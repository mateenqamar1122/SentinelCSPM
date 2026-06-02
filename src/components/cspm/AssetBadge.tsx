import { cn } from "@/lib/utils";
import { GitBranch, Container, Boxes, Brain, Cloud } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type AssetType = Database["public"]["Enums"]["asset_type"];

const meta: Record<AssetType, { label: string; color: string; Icon: typeof GitBranch }> = {
  cloud:           { label: "Cloud",     color: "text-provider-aws border-provider-aws/40 bg-provider-aws/10", Icon: Cloud },
  code_repo:       { label: "Code Repo", color: "text-primary border-primary/40 bg-primary/10",                Icon: GitBranch },
  container_image: { label: "Container", color: "text-accent border-accent/40 bg-accent/10",                   Icon: Container },
  kubernetes:      { label: "Kubernetes",color: "text-provider-gcp border-provider-gcp/40 bg-provider-gcp/10", Icon: Boxes },
  ai_workflow:     { label: "AI Workflow",color: "text-provider-azure border-provider-azure/40 bg-provider-azure/10", Icon: Brain },
};

export const AssetBadge = ({ type, withLabel = true, className }: { type: AssetType; withLabel?: boolean; className?: string }) => {
  const m = meta[type];
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className={cn("w-7 h-7 grid place-items-center rounded-md border", m.color)}>
        <m.Icon className="w-4 h-4" />
      </span>
      {withLabel && <span className="text-sm font-medium">{m.label}</span>}
    </span>
  );
};

export const assetLabel = (t: AssetType) => meta[t].label;
