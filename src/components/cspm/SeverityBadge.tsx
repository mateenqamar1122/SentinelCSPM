import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

export type Severity = Database["public"]["Enums"]["finding_severity"];

const map: Record<Severity, { label: string; cls: string }> = {
  critical: { label: "Critical", cls: "bg-severity-critical-bg text-severity-critical border-severity-critical/40" },
  high:     { label: "High",     cls: "bg-severity-high-bg text-severity-high border-severity-high/40" },
  medium:   { label: "Medium",   cls: "bg-severity-medium-bg text-severity-medium border-severity-medium/40" },
  low:      { label: "Low",      cls: "bg-severity-low-bg text-severity-low border-severity-low/40" },
  info:     { label: "Info",     cls: "bg-severity-info-bg text-severity-info border-severity-info/40" },
};

export const SeverityBadge = ({ severity, className }: { severity: Severity; className?: string }) => {
  const m = map[severity];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-mono font-medium uppercase tracking-wider border",
        m.cls,
        className
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {m.label}
    </span>
  );
};
