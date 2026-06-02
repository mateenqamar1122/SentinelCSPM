import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, Cloud, History, Boxes, FileBadge2, Brain, Radar, FileText, HelpCircle, Building2, ListChecks, Siren, FileQuestion, CalendarDays, Store, Briefcase, UserCircle, Sparkles, BrainCircuit, GitMerge, UserCheck } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { restartTour } from "./ProductTour";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
  dataTour?: string;
};

const groups: { label: string; items: NavItem[] }[] = [
  {
    label: "Overview",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, end: true },
    ],
  },
  {
    label: "Security Operations",
    items: [
      { to: "/ai-soc", label: "AI SOC", icon: BrainCircuit },
      { to: "/incidents", label: "Incidents", icon: Siren },
      { to: "/threat-intel", label: "Threat Intel", icon: Radar },
      { to: "/attack-paths", label: "Attack Paths", icon: GitMerge },
      { to: "/employee-hygiene", label: "Employee Hygiene", icon: UserCheck },
      { to: "/scans", label: "Scans", icon: History },
    ],
  },
  {
    label: "Posture & Assets",
    items: [
      { to: "/connections", label: "Cloud", icon: Cloud },
      { to: "/assets", label: "Code & Containers", icon: Boxes },
      { to: "/ai-security", label: "AI Security", icon: Brain },
    ],
  },
  {
    label: "Governance",
    items: [
      { to: "/compliance", label: "Compliance", icon: FileBadge2, dataTour: "nav-compliance" },
      { to: "/checklist", label: "Checklist", icon: ListChecks },
      { to: "/vendors", label: "Vendors", icon: Building2 },
      { to: "/questionnaire", label: "Questionnaire", icon: FileQuestion },
    ],
  },
  {
    label: "Reporting",
    items: [
      { to: "/digest", label: "Weekly Digest", icon: CalendarDays },
      { to: "/report", label: "Board Report", icon: FileText, dataTour: "nav-report" },
    ],
  },
  {
    label: "Marketplace",
    items: [
      { to: "/marketplace", label: "Marketplace", icon: Store },
      { to: "/dashboard/engagements", label: "Engagements", icon: Briefcase },
      { to: "/dashboard/pentester-profile", label: "My Pentester Profile", icon: UserCircle },
    ],
  },
  {
    label: "Account",
    items: [
      { to: "/pricing", label: "Upgrade", icon: Sparkles },
    ],
  },
];

export const AppSidebar = () => {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();

  const isActive = (to: string, end?: boolean) =>
    end ? location.pathname === to : location.pathname.startsWith(to) && to !== "/";

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            {!collapsed && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map(({ to, label, icon: Icon, end, dataTour }) => {
                  const active = isActive(to, end);
                  return (
                    <SidebarMenuItem key={to}>
                      <SidebarMenuButton asChild tooltip={collapsed ? label : undefined}>
                        <NavLink
                          to={to}
                          end={end}
                          data-tour={dataTour}
                          className={cn(
                            "flex items-center gap-2",
                            active ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <Icon className="w-4 h-4" />
                          {!collapsed && <span>{label}</span>}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={restartTour} tooltip={collapsed ? "Restart tour" : undefined}>
                  <HelpCircle className="w-4 h-4" />
                  {!collapsed && <span>Restart Tour</span>}
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
};
