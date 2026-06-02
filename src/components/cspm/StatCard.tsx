import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface Props {
  label: string;
  value: number | string;
  icon?: LucideIcon;
  accent?: "primary" | "critical" | "high" | "medium" | "low" | "info" | "muted";
  hint?: string;
}

const accentMap = {
  primary:  "text-primary",
  critical: "text-severity-critical",
  high:     "text-severity-high",
  medium:   "text-severity-medium",
  low:      "text-severity-low",
  info:     "text-severity-info",
  muted:    "text-muted-foreground",
};

export const StatCard = ({ label, value, icon: Icon, accent = "primary", hint }: Props) => {
  return (
    <div className="surface-card p-5 relative overflow-hidden group">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground font-mono">{label}</div>
          <div className={cn("mt-2 text-3xl font-semibold tabular-nums", accentMap[accent])}>{value}</div>
          {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
        </div>
        {Icon && (
          <div className={cn("w-9 h-9 grid place-items-center rounded-md bg-secondary/60 border border-border", accentMap[accent])}>
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>
    </div>
  );
};
