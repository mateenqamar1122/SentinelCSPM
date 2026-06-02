import { useMemo } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { Database } from "@/integrations/supabase/types";

type Finding = Database["public"]["Tables"]["findings"]["Row"];
type Asset = Database["public"]["Tables"]["assets"]["Row"];
type Conn = Database["public"]["Tables"]["cloud_connections"]["Row"];

const SEVERITY_COLORS: Record<string, string> = {
  critical: "hsl(var(--sev-critical))",
  high: "hsl(var(--sev-high))",
  medium: "hsl(var(--sev-medium))",
  low: "hsl(var(--sev-low))",
  info: "hsl(var(--sev-info))",
};

const tooltipStyle = {
  background: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
  color: "hsl(var(--popover-foreground))",
};

interface Props {
  findings: Finding[];
  assets: Asset[];
  connections: Conn[];
}

export const DashboardCharts = ({ findings, assets, connections }: Props) => {
  const severityData = useMemo(() => {
    const order = ["critical", "high", "medium", "low", "info"];
    return order.map((s) => ({
      name: s.charAt(0).toUpperCase() + s.slice(1),
      value: findings.filter((f) => f.severity === s).length,
      fill: SEVERITY_COLORS[s],
    }));
  }, [findings]);

  const trendData = useMemo(() => {
    const days = 14;
    const buckets: { date: string; critical: number; high: number; medium: number; low: number }[] = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const day = findings.filter((f) => f.created_at?.slice(0, 10) === key);
      buckets.push({
        date: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        critical: day.filter((f) => f.severity === "critical").length,
        high: day.filter((f) => f.severity === "high").length,
        medium: day.filter((f) => f.severity === "medium").length,
        low: day.filter((f) => f.severity === "low").length,
      });
    }
    return buckets;
  }, [findings]);

  const categoryData = useMemo(() => {
    const map = new Map<string, number>();
    findings.forEach((f) => map.set(f.category || "Other", (map.get(f.category || "Other") ?? 0) + 1));
    return Array.from(map.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [findings]);

  const inventoryData = useMemo(() => {
    const providers = new Map<string, number>();
    connections.forEach((c) => providers.set(c.provider, (providers.get(c.provider) ?? 0) + 1));
    const assetTypes = new Map<string, number>();
    assets.forEach((a) => assetTypes.set(a.asset_type, (assetTypes.get(a.asset_type) ?? 0) + 1));
    return [
      { name: "Cloud", value: connections.length },
      { name: "Repos", value: assets.filter((a) => a.asset_type === "code_repo").length },
      { name: "Containers", value: assets.filter((a) => a.asset_type === "container_image").length },
      { name: "K8s", value: assets.filter((a) => a.asset_type === "kubernetes").length },
      { name: "AI", value: assets.filter((a) => a.asset_type === "ai_workflow").length },
    ];
  }, [assets, connections]);

  return (
    <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
      {/* Trend */}
      <div className="surface-card p-5 lg:col-span-2">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold">Findings over time</h3>
            <p className="text-xs text-muted-foreground">Last 14 days by severity</p>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={trendData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <defs>
              {(["critical", "high", "medium", "low"] as const).map((k) => (
                <linearGradient id={`g-${k}`} key={k} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SEVERITY_COLORS[k]} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={SEVERITY_COLORS[k]} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Area type="monotone" dataKey="critical" stroke={SEVERITY_COLORS.critical} fill="url(#g-critical)" strokeWidth={2} stackId="1" />
            <Area type="monotone" dataKey="high" stroke={SEVERITY_COLORS.high} fill="url(#g-high)" strokeWidth={2} stackId="1" />
            <Area type="monotone" dataKey="medium" stroke={SEVERITY_COLORS.medium} fill="url(#g-medium)" strokeWidth={2} stackId="1" />
            <Area type="monotone" dataKey="low" stroke={SEVERITY_COLORS.low} fill="url(#g-low)" strokeWidth={2} stackId="1" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Severity donut */}
      <div className="surface-card p-5">
        <h3 className="text-sm font-semibold">Severity mix</h3>
        <p className="text-xs text-muted-foreground mb-2">All open findings</p>
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={severityData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3} stroke="hsl(var(--background))" strokeWidth={2}>
              {severityData.map((d) => (
                <Cell key={d.name} fill={d.fill} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Categories bar */}
      <div className="surface-card p-5 lg:col-span-2">
        <h3 className="text-sm font-semibold">Top finding categories</h3>
        <p className="text-xs text-muted-foreground mb-2">Where risk is concentrated</p>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={categoryData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(0 100% 50%)" stopOpacity={0.95} />
                <stop offset="100%" stopColor="hsl(42 97% 67%)" stopOpacity={0.4} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="category" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "hsl(var(--muted) / 0.3)" }} />
            <Bar dataKey="count" fill="url(#barGrad)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Inventory radar */}
      <div className="surface-card p-5">
        <h3 className="text-sm font-semibold">Coverage footprint</h3>
        <p className="text-xs text-muted-foreground mb-2">Inventory across surfaces</p>
        <ResponsiveContainer width="100%" height={240}>
          <RadarChart data={inventoryData} outerRadius={85}>
            <PolarGrid stroke="hsl(var(--border))" />
            <PolarAngleAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
            <Radar dataKey="value" stroke="hsl(18 95% 55%)" fill="hsl(18 95% 55%)" fillOpacity={0.25} />
            <Tooltip contentStyle={tooltipStyle} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
};
