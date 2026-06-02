import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type Provider = Database["public"]["Enums"]["cloud_provider"];

const meta: Record<Provider, { label: string; color: string; letter: string }> = {
  aws:   { label: "AWS",   color: "text-provider-aws border-provider-aws/40 bg-provider-aws/10",   letter: "A" },
  gcp:   { label: "GCP",   color: "text-provider-gcp border-provider-gcp/40 bg-provider-gcp/10",   letter: "G" },
  azure: { label: "Azure", color: "text-provider-azure border-provider-azure/40 bg-provider-azure/10", letter: "Z" },
  demo:  { label: "Demo",  color: "text-primary border-primary/40 bg-primary/10",                   letter: "D" },
};

export const ProviderBadge = ({ provider, withLabel = true, className }: { provider: Provider; withLabel?: boolean; className?: string }) => {
  const m = meta[provider];
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className={cn("w-7 h-7 grid place-items-center rounded-md border font-mono text-xs font-semibold", m.color)}>
        {m.letter}
      </span>
      {withLabel && <span className="text-sm font-medium">{m.label}</span>}
    </span>
  );
};

export const providerLabel = (p: Provider) => meta[p].label;
