import { NavLink, Link } from "react-router-dom";
import { Shield, LayoutDashboard, Cloud, History, Boxes, FileBadge2, Brain, Radar, FileText, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { restartTour } from "./ProductTour";
import { ThemeToggle } from "@/components/ThemeToggle";

const links = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/connections", label: "Cloud", icon: Cloud },
  { to: "/assets", label: "Code & Containers", icon: Boxes },
  { to: "/ai-security", label: "AI Security", icon: Brain },
  { to: "/threat-intel", label: "Threat Intel", icon: Radar },
  { to: "/compliance", label: "Compliance", icon: FileBadge2, dataTour: "nav-compliance" },
  { to: "/report", label: "Board Report", icon: FileText, dataTour: "nav-report" },
  { to: "/scans", label: "Scans", icon: History },
];

export const TopNav = () => {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/70 backdrop-blur-xl">
      <div className="container flex h-14 items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2 group shrink-0">
          <div className="relative w-8 h-8 grid place-items-center rounded-md bg-gradient-to-br from-primary to-accent text-primary-foreground glow-ring">
            <Shield className="w-4 h-4" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">Sentinel<span className="text-gradient">CSPM</span></div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono">unified security posture</div>
          </div>
        </Link>
        <nav className="hidden lg:flex items-center gap-1 overflow-x-auto">
          {links.map(({ to, label, icon: Icon, end, dataTour }) => (
            <NavLink
              key={to} to={to} end={end}
              data-tour={dataTour}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm transition-colors whitespace-nowrap",
                  isActive ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                )
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={restartTour}
            className="hidden md:flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors"
            title="Restart product tour"
          >
            <HelpCircle className="w-3.5 h-3.5" /> TOUR
          </button>
          <ThemeToggle />
          <div className="text-[11px] font-mono text-muted-foreground hidden sm:flex items-center gap-2">
            <span className="pulse-dot" />
            DEMO MODE
          </div>
        </div>
      </div>
    </header>
  );
};
