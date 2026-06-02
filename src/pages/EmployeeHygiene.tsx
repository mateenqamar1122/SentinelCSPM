import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/cspm/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Users, ShieldAlert, BookOpen, AlertTriangle, CheckCircle2,
  XCircle, Clock, Search, Filter, TrendingUp, TrendingDown,
  Eye, Download, RefreshCw, Mail, Laptop, Key, Lock, Wifi,
  UserX, Activity, BarChart3, Zap, Bell, Award, Target,
  ChevronRight, ExternalLink, Info, Brain, EyeOff, Database,
  FileWarning, LogIn, HardDrive, Clipboard, ChevronDown, ChevronUp,
} from "lucide-react";
import { format, formatDistanceToNow, subDays, subHours, subMinutes } from "date-fns";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────────────────

type RiskLevel = "critical" | "high" | "medium" | "low";
type TrainingStatus = "completed" | "in_progress" | "overdue" | "not_started";
type ThreatCategory = "data_exfil" | "privilege_abuse" | "anomalous_access" | "policy_violation" | "credential_misuse";
type Department = "Engineering" | "Finance" | "HR" | "Sales" | "Marketing" | "Legal" | "IT" | "Exec";

interface Employee {
  id: string;
  name: string;
  email: string;
  department: Department;
  role: string;
  riskScore: number;
  riskLevel: RiskLevel;
  lastLogin: Date;
  mfaEnabled: boolean;
  passwordAge: number; // days
  trainingCompleted: number;
  trainingTotal: number;
  trainingStatus: TrainingStatus;
  openAlerts: number;
  recentFlags: string[];
  joinDate: Date;
}

interface InsiderAlert {
  id: string;
  employeeId: string;
  employeeName: string;
  department: Department;
  category: ThreatCategory;
  severity: RiskLevel;
  title: string;
  description: string;
  detectedAt: Date;
  status: "open" | "investigating" | "resolved" | "dismissed";
  confidence: number; // 0-100
  indicators: string[];
}

interface TrainingModule {
  id: string;
  title: string;
  description: string;
  duration: number; // minutes
  category: string;
  completionRate: number;
  dueDate: Date;
  mandatory: boolean;
}

// ── Mock Data ─────────────────────────────────────────────────────────────────

const DEPARTMENTS: Department[] = ["Engineering", "Finance", "HR", "Sales", "Marketing", "Legal", "IT", "Exec"];

const MOCK_EMPLOYEES: Employee[] = [
  {
    id: "e1", name: "Sarah Chen", email: "sarah.chen@company.com", department: "Finance",
    role: "Senior Financial Analyst", riskScore: 87, riskLevel: "critical",
    lastLogin: subHours(new Date(), 2), mfaEnabled: false, passwordAge: 145,
    trainingCompleted: 2, trainingTotal: 8, trainingStatus: "overdue",
    openAlerts: 3, recentFlags: ["Large data export", "Off-hours access", "MFA disabled"],
    joinDate: subDays(new Date(), 730),
  },
  {
    id: "e2", name: "Marcus Johnson", email: "m.johnson@company.com", department: "IT",
    role: "DevOps Engineer", riskScore: 72, riskLevel: "high",
    lastLogin: subHours(new Date(), 1), mfaEnabled: true, passwordAge: 67,
    trainingCompleted: 4, trainingTotal: 8, trainingStatus: "in_progress",
    openAlerts: 2, recentFlags: ["Privilege escalation attempt", "Config change outside CAB"],
    joinDate: subDays(new Date(), 400),
  },
  {
    id: "e3", name: "Priya Sharma", email: "priya.s@company.com", department: "Engineering",
    role: "Staff Engineer", riskScore: 21, riskLevel: "low",
    lastLogin: subHours(new Date(), 0.5), mfaEnabled: true, passwordAge: 14,
    trainingCompleted: 8, trainingTotal: 8, trainingStatus: "completed",
    openAlerts: 0, recentFlags: [],
    joinDate: subDays(new Date(), 1200),
  },
  {
    id: "e4", name: "David Kim", email: "d.kim@company.com", department: "Sales",
    role: "Account Executive", riskScore: 55, riskLevel: "medium",
    lastLogin: subDays(new Date(), 1), mfaEnabled: true, passwordAge: 89,
    trainingCompleted: 5, trainingTotal: 8, trainingStatus: "in_progress",
    openAlerts: 1, recentFlags: ["CRM bulk export"],
    joinDate: subDays(new Date(), 540),
  },
  {
    id: "e5", name: "Emma Rodriguez", email: "e.rodriguez@company.com", department: "HR",
    role: "HR Director", riskScore: 63, riskLevel: "high",
    lastLogin: subHours(new Date(), 4), mfaEnabled: true, passwordAge: 201,
    trainingCompleted: 3, trainingTotal: 8, trainingStatus: "overdue",
    openAlerts: 2, recentFlags: ["PII bulk download", "Unusual query pattern"],
    joinDate: subDays(new Date(), 900),
  },
  {
    id: "e6", name: "Alex Thompson", email: "a.thompson@company.com", department: "Marketing",
    role: "Marketing Manager", riskScore: 18, riskLevel: "low",
    lastLogin: subHours(new Date(), 6), mfaEnabled: true, passwordAge: 28,
    trainingCompleted: 8, trainingTotal: 8, trainingStatus: "completed",
    openAlerts: 0, recentFlags: [],
    joinDate: subDays(new Date(), 650),
  },
  {
    id: "e7", name: "James Wilson", email: "j.wilson@company.com", department: "Legal",
    role: "General Counsel", riskScore: 34, riskLevel: "low",
    lastLogin: subHours(new Date(), 3), mfaEnabled: true, passwordAge: 42,
    trainingCompleted: 7, trainingTotal: 8, trainingStatus: "in_progress",
    openAlerts: 0, recentFlags: [],
    joinDate: subDays(new Date(), 1800),
  },
  {
    id: "e8", name: "Lisa Park", email: "l.park@company.com", department: "Exec",
    role: "Chief Product Officer", riskScore: 78, riskLevel: "high",
    lastLogin: subHours(new Date(), 1), mfaEnabled: false, passwordAge: 178,
    trainingCompleted: 1, trainingTotal: 8, trainingStatus: "overdue",
    openAlerts: 2, recentFlags: ["IP auth from new country", "MFA disabled"],
    joinDate: subDays(new Date(), 1100),
  },
  {
    id: "e9", name: "Ryan Patel", email: "r.patel@company.com", department: "Engineering",
    role: "Senior SRE", riskScore: 45, riskLevel: "medium",
    lastLogin: subMinutes(new Date(), 30), mfaEnabled: true, passwordAge: 55,
    trainingCompleted: 6, trainingTotal: 8, trainingStatus: "in_progress",
    openAlerts: 1, recentFlags: ["Sensitive repo cloned"],
    joinDate: subDays(new Date(), 300),
  },
  {
    id: "e10", name: "Nina Okonkwo", email: "n.okonkwo@company.com", department: "Finance",
    role: "CFO", riskScore: 58, riskLevel: "medium",
    lastLogin: subHours(new Date(), 2), mfaEnabled: true, passwordAge: 33,
    trainingCompleted: 6, trainingTotal: 8, trainingStatus: "in_progress",
    openAlerts: 1, recentFlags: ["Wire transfer approval from mobile"],
    joinDate: subDays(new Date(), 1500),
  },
];

const MOCK_ALERTS: InsiderAlert[] = [
  {
    id: "a1", employeeId: "e1", employeeName: "Sarah Chen", department: "Finance",
    category: "data_exfil", severity: "critical",
    title: "Anomalous bulk data export detected",
    description: "User exported 45,000 financial records to personal cloud storage 3 days before scheduled resignation meeting.",
    detectedAt: subHours(new Date(), 2),
    status: "investigating",
    confidence: 94,
    indicators: ["Volume 40× above baseline", "Destination: personal Dropbox", "Outside business hours", "No approved export ticket"],
  },
  {
    id: "a2", employeeId: "e2", employeeName: "Marcus Johnson", department: "IT",
    category: "privilege_abuse", severity: "high",
    title: "Unauthorized privilege escalation to production root",
    description: "User escalated privileges to root on production K8s cluster without an approved change request during a holiday period.",
    detectedAt: subHours(new Date(), 5),
    status: "open",
    confidence: 88,
    indicators: ["No CAB ticket found", "Holiday period access", "Root escalation", "Config modified"],
  },
  {
    id: "a3", employeeId: "e5", employeeName: "Emma Rodriguez", department: "HR",
    category: "anomalous_access", severity: "high",
    title: "Mass PII records accessed outside working hours",
    description: "HR Director accessed 1,200+ employee PII records at 2:30 AM via VPN from an unrecognized location.",
    detectedAt: subHours(new Date(), 18),
    status: "open",
    confidence: 79,
    indicators: ["Access at 02:30 AM", "1,247 records in 8 minutes", "New IP geolocation: Vietnam", "VPN tunnel anomaly"],
  },
  {
    id: "a4", employeeId: "e8", employeeName: "Lisa Park", department: "Exec",
    category: "credential_misuse", severity: "high",
    title: "Executive login from anomalous geographic location",
    description: "C-suite user authenticated from two different countries within 45 minutes — impossible travel detected.",
    detectedAt: subHours(new Date(), 8),
    status: "investigating",
    confidence: 97,
    indicators: ["Location A: New York", "Location B: Singapore", "45 min apart", "MFA bypassed via legacy app token"],
  },
  {
    id: "a5", employeeId: "e4", employeeName: "David Kim", department: "Sales",
    category: "data_exfil", severity: "medium",
    title: "CRM customer list bulk export",
    description: "Sales AE exported full customer contact list (8,400 records) 2 days after accepting a competitor offer.",
    detectedAt: subDays(new Date(), 1),
    status: "resolved",
    confidence: 81,
    indicators: ["Full CRM export", "Employment status change flag", "Sent to personal email"],
  },
  {
    id: "a6", employeeId: "e9", employeeName: "Ryan Patel", department: "Engineering",
    category: "policy_violation", severity: "medium",
    title: "Sensitive repository cloned to unmanaged device",
    description: "Employee cloned a repository containing cryptographic keys to an unregistered personal MacBook.",
    detectedAt: subDays(new Date(), 2),
    status: "open",
    confidence: 72,
    indicators: ["Unmanaged device detected", "Crypto secrets repo", "Git clone via personal token", "Not on MDM"],
  },
  {
    id: "a7", employeeId: "e10", employeeName: "Nina Okonkwo", department: "Finance",
    category: "anomalous_access", severity: "medium",
    title: "Wire transfer approved from personal mobile device",
    description: "Finance executive approved a $240,000 wire transfer from a personal device not enrolled in MDM.",
    detectedAt: subDays(new Date(), 3),
    status: "dismissed",
    confidence: 60,
    indicators: ["Personal iOS device", "No MDM enrollment", "High-value transfer", "Out-of-policy approval flow"],
  },
];

const MOCK_MODULES: TrainingModule[] = [
  { id: "t1", title: "Phishing Awareness 2025", description: "Recognize and report phishing emails, spear-phishing, and social engineering attacks.", duration: 25, category: "Phishing", completionRate: 82, dueDate: subDays(new Date(), -14), mandatory: true },
  { id: "t2", title: "Data Handling & Privacy (GDPR/CCPA)", description: "Proper handling of PII, data minimization, and breach reporting obligations.", duration: 40, category: "Privacy", completionRate: 67, dueDate: subDays(new Date(), -7), mandatory: true },
  { id: "t3", title: "Password & MFA Hygiene", description: "Strong password policies, password manager adoption, and MFA best practices.", duration: 15, category: "Authentication", completionRate: 91, dueDate: subDays(new Date(), -30), mandatory: true },
  { id: "t4", title: "Secure Remote Work", description: "VPN usage, home network security, and avoiding public Wi-Fi risks.", duration: 20, category: "Remote Work", completionRate: 74, dueDate: subDays(new Date(), -21), mandatory: false },
  { id: "t5", title: "Insider Threat Awareness", description: "Recognizing insider threat indicators and reporting suspicious colleague behavior.", duration: 30, category: "Insider Threat", completionRate: 58, dueDate: subDays(new Date(), 5), mandatory: true },
  { id: "t6", title: "Social Engineering Defense", description: "Advanced tactics to resist vishing, smishing, and pretexting attacks.", duration: 35, category: "Social Engineering", completionRate: 45, dueDate: subDays(new Date(), 10), mandatory: false },
  { id: "t7", title: "Acceptable Use Policy", description: "Company device, email, and internet usage policies and enforcement procedures.", duration: 10, category: "Policy", completionRate: 95, dueDate: subDays(new Date(), -60), mandatory: true },
  { id: "t8", title: "Incident Reporting Procedures", description: "How and when to report a security incident, and escalation paths.", duration: 15, category: "Incident Response", completionRate: 70, dueDate: subDays(new Date(), -14), mandatory: true },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const RISK_COLORS: Record<RiskLevel, { text: string; bg: string; border: string; bar: string }> = {
  critical: { text: "text-red-500", bg: "bg-red-500/10 dark:bg-red-950/30", border: "border-red-400/50", bar: "bg-red-500" },
  high: { text: "text-orange-500", bg: "bg-orange-500/10 dark:bg-orange-950/20", border: "border-orange-400/50", bar: "bg-orange-500" },
  medium: { text: "text-yellow-600", bg: "bg-yellow-500/10 dark:bg-yellow-950/20", border: "border-yellow-400/50", bar: "bg-yellow-500" },
  low: { text: "text-emerald-600", bg: "bg-emerald-500/10 dark:bg-emerald-950/20", border: "border-emerald-400/50", bar: "bg-emerald-500" },
};

const THREAT_META: Record<ThreatCategory, { label: string; icon: typeof Activity; color: string }> = {
  data_exfil: { label: "Data Exfiltration", icon: Database, color: "text-red-500" },
  privilege_abuse: { label: "Privilege Abuse", icon: Key, color: "text-orange-500" },
  anomalous_access: { label: "Anomalous Access", icon: LogIn, color: "text-purple-500" },
  policy_violation: { label: "Policy Violation", icon: FileWarning, color: "text-yellow-600" },
  credential_misuse: { label: "Credential Misuse", icon: EyeOff, color: "text-red-600" },
};

const TRAINING_STATUS_META: Record<TrainingStatus, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  completed: { label: "Completed", color: "text-emerald-600", icon: CheckCircle2 },
  in_progress: { label: "In Progress", color: "text-blue-500", icon: Clock },
  overdue: { label: "Overdue", color: "text-red-500", icon: AlertTriangle },
  not_started: { label: "Not Started", color: "text-muted-foreground", icon: XCircle },
};

const STATUS_META = {
  open: { label: "Open", color: "text-red-500 bg-red-500/10 border-red-400/40" },
  investigating: { label: "Investigating", color: "text-orange-500 bg-orange-500/10 border-orange-400/40" },
  resolved: { label: "Resolved", color: "text-emerald-600 bg-emerald-500/10 border-emerald-400/40" },
  dismissed: { label: "Dismissed", color: "text-muted-foreground bg-secondary border-border" },
};

function riskScoreColor(score: number) {
  if (score >= 80) return "text-red-500";
  if (score >= 60) return "text-orange-500";
  if (score >= 40) return "text-yellow-600";
  return "text-emerald-600";
}

// ── Sub-components ────────────────────────────────────────────────────────────

function RiskBadge({ level }: { level: RiskLevel }) {
  const c = RISK_COLORS[level];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono uppercase tracking-wider border font-semibold ${c.text} ${c.bg} ${c.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.bar}`} />
      {level}
    </span>
  );
}

function MiniRiskBar({ score }: { score: number }) {
  const col = score >= 80 ? "bg-red-500" : score >= 60 ? "bg-orange-500" : score >= 40 ? "bg-yellow-500" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${col}`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-xs font-mono font-bold w-6 text-right ${riskScoreColor(score)}`}>{score}</span>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function EmployeeHygiene() {
  const [activeTab, setActiveTab] = useState("overview");
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState<Department | "all">("all");
  const [riskFilter, setRiskFilter] = useState<RiskLevel | "all">("all");
  const [alertFilter, setAlertFilter] = useState<"all" | "open" | "investigating" | "resolved" | "dismissed">("all");
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<InsiderAlert | null>(null);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());

  useEffect(() => { document.title = "Employee Hygiene & Insider Threats — SentinelCSPM"; }, []);

  // ── Derived ──────────────────────────────────────────────────────────────────

  const filteredEmployees = useMemo(() => {
    return MOCK_EMPLOYEES.filter(e => {
      if (deptFilter !== "all" && e.department !== deptFilter) return false;
      if (riskFilter !== "all" && e.riskLevel !== riskFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!e.name.toLowerCase().includes(q) && !e.email.toLowerCase().includes(q) && !e.role.toLowerCase().includes(q)) return false;
      }
      return true;
    }).sort((a, b) => b.riskScore - a.riskScore);
  }, [search, deptFilter, riskFilter]);

  const filteredAlerts = useMemo(() => {
    return MOCK_ALERTS.filter(a => {
      if (alertFilter !== "all" && a.status !== alertFilter) return false;
      if (deptFilter !== "all" && a.department !== deptFilter) return false;
      if (riskFilter !== "all" && a.severity !== riskFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!a.employeeName.toLowerCase().includes(q) && !a.title.toLowerCase().includes(q)) return false;
      }
      return true;
    }).sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime());
  }, [alertFilter, deptFilter, riskFilter, search]);

  const stats = useMemo(() => ({
    totalEmployees: MOCK_EMPLOYEES.length,
    criticalRisk: MOCK_EMPLOYEES.filter(e => e.riskLevel === "critical").length,
    highRisk: MOCK_EMPLOYEES.filter(e => e.riskLevel === "high").length,
    mfaDisabled: MOCK_EMPLOYEES.filter(e => !e.mfaEnabled).length,
    overdueTraining: MOCK_EMPLOYEES.filter(e => e.trainingStatus === "overdue").length,
    openAlerts: MOCK_ALERTS.filter(a => a.status === "open").length,
    investigatingAlerts: MOCK_ALERTS.filter(a => a.status === "investigating").length,
    avgRisk: Math.round(MOCK_EMPLOYEES.reduce((s, e) => s + e.riskScore, 0) / MOCK_EMPLOYEES.length),
    avgHygieneScore: Math.round(MOCK_EMPLOYEES.reduce((s, e) => s + (e.trainingCompleted / e.trainingTotal) * 100, 0) / MOCK_EMPLOYEES.length),
  }), []);

  const toggleModule = (id: string) => {
    setExpandedModules(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <AppShell>
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 grid place-items-center rounded-lg bg-orange-500/15 text-orange-500">
              <Users className="w-4 h-4" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Employee Hygiene & Insider Threats</h1>
          </div>
          <p className="text-muted-foreground mt-1 ml-10">
            Monitor employee cyber hygiene posture, security training completion, and detect insider threat signals in real-time.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => toast.success("Report exported successfully")}>
            <Download className="w-3.5 h-3.5 mr-1.5" />Export Report
          </Button>
          <Button size="sm" onClick={() => toast.info("Scanning for new anomalies…")}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Refresh Scan
          </Button>
        </div>
      </div>

      {/* ── KPI Stats Row ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
        {[
          { label: "Total Employees", value: stats.totalEmployees, icon: Users, color: "text-foreground", sub: "monitored" },
          { label: "Critical Risk", value: stats.criticalRisk, icon: AlertTriangle, color: "text-red-500", sub: "employees" },
          { label: "High Risk", value: stats.highRisk, icon: TrendingUp, color: "text-orange-500", sub: "employees" },
          { label: "MFA Disabled", value: stats.mfaDisabled, icon: Lock, color: "text-red-500", sub: "accounts" },
          { label: "Overdue Training", value: stats.overdueTraining, icon: BookOpen, color: "text-yellow-600", sub: "employees" },
          { label: "Open Alerts", value: stats.openAlerts, icon: Bell, color: "text-red-500", sub: "unresolved" },
          { label: "Avg Risk Score", value: stats.avgRisk, icon: Target, color: riskScoreColor(stats.avgRisk), sub: "/ 100" },
          { label: "Training Rate", value: `${stats.avgHygieneScore}%`, icon: Award, color: "text-emerald-600", sub: "completed" },
        ].map(({ label, value, icon: Icon, color, sub }) => (
          <div key={label} className="surface-card p-3 flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <div className={`text-2xl font-bold tabular-nums ${color}`}>{value}</div>
            <div>
              <div className="text-[10px] font-mono uppercase text-muted-foreground leading-tight">{label}</div>
              <div className="text-[9px] text-muted-foreground/60">{sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Filters ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 mb-5">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8 h-8 text-sm" placeholder="Search employees, alerts…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={deptFilter} onValueChange={v => setDeptFilter(v as Department | "all")}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={riskFilter} onValueChange={v => setRiskFilter(v as RiskLevel | "all")}>
          <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Risk Levels</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ── Main Tabs ─────────────────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 w-full max-w-xl mb-6">
          <TabsTrigger value="overview" className="flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5" />Overview
          </TabsTrigger>
          <TabsTrigger value="employees" className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />Employees
            <Badge className="h-4 px-1 text-[9px] bg-muted text-muted-foreground border-0">{filteredEmployees.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="alerts" className="flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5" />Insider Threats
            {stats.openAlerts > 0 && (
              <Badge className="h-4 px-1 text-[9px] bg-red-500 text-white border-0">{stats.openAlerts}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="training" className="flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5" />Training
          </TabsTrigger>
        </TabsList>

        {/* ── OVERVIEW TAB ──────────────────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid lg:grid-cols-2 gap-5">
            {/* Risk Distribution */}
            <div className="surface-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Target className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold">Risk Distribution by Department</span>
              </div>
              <div className="space-y-3">
                {DEPARTMENTS.map(dept => {
                  const deptEmps = MOCK_EMPLOYEES.filter(e => e.department === dept);
                  if (!deptEmps.length) return null;
                  const avgScore = Math.round(deptEmps.reduce((s, e) => s + e.riskScore, 0) / deptEmps.length);
                  const critical = deptEmps.filter(e => e.riskLevel === "critical").length;
                  const high = deptEmps.filter(e => e.riskLevel === "high").length;
                  return (
                    <div key={dept} className="flex items-center gap-3">
                      <div className="w-24 text-xs font-mono text-muted-foreground truncate">{dept}</div>
                      <div className="flex-1">
                        <MiniRiskBar score={avgScore} />
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {critical > 0 && <span className="text-[9px] px-1 py-0.5 rounded bg-red-500/10 text-red-500 font-mono">{critical}C</span>}
                        {high > 0 && <span className="text-[9px] px-1 py-0.5 rounded bg-orange-500/10 text-orange-500 font-mono">{high}H</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Hygiene Issues Breakdown */}
            <div className="surface-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <ShieldAlert className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold">Hygiene Issues Breakdown</span>
              </div>
              <div className="space-y-3">
                {[
                  { label: "MFA Not Enabled", count: MOCK_EMPLOYEES.filter(e => !e.mfaEnabled).length, total: MOCK_EMPLOYEES.length, icon: Lock, color: "text-red-500", bar: "bg-red-500" },
                  { label: "Password Age > 90 days", count: MOCK_EMPLOYEES.filter(e => e.passwordAge > 90).length, total: MOCK_EMPLOYEES.length, icon: Key, color: "text-orange-500", bar: "bg-orange-500" },
                  { label: "Training Overdue", count: MOCK_EMPLOYEES.filter(e => e.trainingStatus === "overdue").length, total: MOCK_EMPLOYEES.length, icon: BookOpen, color: "text-yellow-600", bar: "bg-yellow-500" },
                  { label: "Open Security Alerts", count: MOCK_EMPLOYEES.filter(e => e.openAlerts > 0).length, total: MOCK_EMPLOYEES.length, icon: Bell, color: "text-red-500", bar: "bg-red-500" },
                  { label: "Training < 50% Complete", count: MOCK_EMPLOYEES.filter(e => (e.trainingCompleted / e.trainingTotal) < 0.5).length, total: MOCK_EMPLOYEES.length, icon: Activity, color: "text-purple-500", bar: "bg-purple-500" },
                ].map(({ label, count, total, icon: Icon, color, bar }) => (
                  <div key={label} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <Icon className={`w-3 h-3 ${color}`} />
                        <span className="text-foreground">{label}</span>
                      </div>
                      <span className={`font-mono font-bold ${color}`}>{count}/{total}</span>
                    </div>
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${bar}`} style={{ width: `${(count / total) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Risk Employees */}
            <div className="surface-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  <span className="text-sm font-semibold">Highest Risk Employees</span>
                </div>
                <button onClick={() => setActiveTab("employees")} className="text-xs text-primary hover:underline flex items-center gap-0.5">
                  View all <ChevronRight className="w-3 h-3" />
                </button>
              </div>
              <div className="space-y-2">
                {[...MOCK_EMPLOYEES].sort((a, b) => b.riskScore - a.riskScore).slice(0, 5).map(emp => (
                  <button
                    key={emp.id}
                    onClick={() => { setSelectedEmployee(emp); setActiveTab("employees"); }}
                    className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-secondary/50 transition-colors text-left"
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${RISK_COLORS[emp.riskLevel].bg} ${RISK_COLORS[emp.riskLevel].text}`}>
                      {emp.name.split(" ").map(n => n[0]).join("")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{emp.name}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">{emp.department} · {emp.role}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <RiskBadge level={emp.riskLevel} />
                      <div className={`text-xs font-mono font-bold mt-0.5 ${riskScoreColor(emp.riskScore)}`}>{emp.riskScore}/100</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Recent Alerts */}
            <div className="surface-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold">Recent Threat Detections</span>
                </div>
                <button onClick={() => setActiveTab("alerts")} className="text-xs text-primary hover:underline flex items-center gap-0.5">
                  View all <ChevronRight className="w-3 h-3" />
                </button>
              </div>
              <div className="space-y-2">
                {MOCK_ALERTS.slice(0, 5).map(alert => {
                  const ThreatIcon = THREAT_META[alert.category].icon;
                  const status = STATUS_META[alert.status];
                  return (
                    <button
                      key={alert.id}
                      onClick={() => { setSelectedAlert(alert); setActiveTab("alerts"); }}
                      className="w-full flex items-start gap-3 p-2.5 rounded-lg hover:bg-secondary/50 transition-colors text-left"
                    >
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${RISK_COLORS[alert.severity].bg}`}>
                        <ThreatIcon className={`w-3.5 h-3.5 ${THREAT_META[alert.category].color}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium truncate">{alert.title}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{alert.employeeName} · {formatDistanceToNow(alert.detectedAt, { addSuffix: true })}</div>
                      </div>
                      <span className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded border shrink-0 ${status.color}`}>
                        {status.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ── EMPLOYEES TAB ──────────────────────────────────────────────── */}
        <TabsContent value="employees">
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Employee List */}
            <div className="lg:col-span-1 space-y-2">
              <div className="text-xs font-mono uppercase text-muted-foreground tracking-wider mb-2">
                {filteredEmployees.length} Employee{filteredEmployees.length !== 1 ? "s" : ""}
              </div>
              {filteredEmployees.map(emp => (
                <button
                  key={emp.id}
                  onClick={() => setSelectedEmployee(emp)}
                  className={`w-full text-left surface-card p-4 hover:border-primary/40 transition-all ${selectedEmployee?.id === emp.id ? "border-primary/60" : ""}`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${RISK_COLORS[emp.riskLevel].bg} ${RISK_COLORS[emp.riskLevel].text}`}>
                      {emp.name.split(" ").map(n => n[0]).join("")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold truncate">{emp.name}</div>
                      <div className="text-[10px] text-muted-foreground font-mono truncate">{emp.department} · {emp.role}</div>
                    </div>
                    <RiskBadge level={emp.riskLevel} />
                  </div>
                  <MiniRiskBar score={emp.riskScore} />
                  <div className="flex items-center gap-3 mt-2 text-[10px] font-mono text-muted-foreground">
                    {!emp.mfaEnabled && <span className="text-red-500 flex items-center gap-0.5"><Lock className="w-2.5 h-2.5" />No MFA</span>}
                    {emp.openAlerts > 0 && <span className="text-orange-500 flex items-center gap-0.5"><Bell className="w-2.5 h-2.5" />{emp.openAlerts} alert{emp.openAlerts !== 1 ? "s" : ""}</span>}
                    {emp.trainingStatus === "overdue" && <span className="text-yellow-600 flex items-center gap-0.5"><AlertTriangle className="w-2.5 h-2.5" />Training overdue</span>}
                  </div>
                </button>
              ))}
            </div>

            {/* Employee Detail */}
            <div className="lg:col-span-2">
              {!selectedEmployee ? (
                <div className="surface-card p-16 text-center text-muted-foreground">
                  <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <div className="text-sm">Select an employee to view their full risk profile, hygiene metrics, and associated alerts.</div>
                </div>
              ) : (
                <div className="surface-card p-6 space-y-6">
                  {/* Employee Header */}
                  <div className="flex items-start gap-4">
                    <div className={`w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold shrink-0 ${RISK_COLORS[selectedEmployee.riskLevel].bg} ${RISK_COLORS[selectedEmployee.riskLevel].text}`}>
                      {selectedEmployee.name.split(" ").map(n => n[0]).join("")}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="text-xl font-bold">{selectedEmployee.name}</h2>
                      <div className="text-sm text-muted-foreground">{selectedEmployee.role} · {selectedEmployee.department}</div>
                      <div className="text-xs text-muted-foreground font-mono mt-0.5">{selectedEmployee.email}</div>
                      <div className="flex items-center gap-2 mt-2">
                        <RiskBadge level={selectedEmployee.riskLevel} />
                        <span className={`text-sm font-mono font-bold ${riskScoreColor(selectedEmployee.riskScore)}`}>
                          Risk Score: {selectedEmployee.riskScore}/100
                        </span>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => toast.info(`Sending alert to ${selectedEmployee.name}`)}>
                      <Mail className="w-3.5 h-3.5 mr-1.5" />Notify
                    </Button>
                  </div>

                  {/* Risk Score Gauge */}
                  <div className="bg-secondary/40 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-mono uppercase text-muted-foreground tracking-wider">Overall Risk Score</span>
                      <span className={`text-2xl font-bold tabular-nums ${riskScoreColor(selectedEmployee.riskScore)}`}>{selectedEmployee.riskScore}</span>
                    </div>
                    <Progress value={selectedEmployee.riskScore} className="h-3" />
                    <div className="flex justify-between text-[10px] text-muted-foreground font-mono mt-1">
                      <span>Low</span><span>Medium</span><span>High</span><span>Critical</span>
                    </div>
                  </div>

                  {/* Hygiene Metrics Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      {
                        label: "MFA Status", value: selectedEmployee.mfaEnabled ? "Enabled" : "DISABLED",
                        icon: Lock, color: selectedEmployee.mfaEnabled ? "text-emerald-600" : "text-red-500",
                        bg: selectedEmployee.mfaEnabled ? "bg-emerald-500/10" : "bg-red-500/10",
                      },
                      {
                        label: "Password Age", value: `${selectedEmployee.passwordAge}d`,
                        icon: Key, color: selectedEmployee.passwordAge > 90 ? "text-red-500" : "text-emerald-600",
                        bg: selectedEmployee.passwordAge > 90 ? "bg-red-500/10" : "bg-emerald-500/10",
                      },
                      {
                        label: "Last Login", value: formatDistanceToNow(selectedEmployee.lastLogin, { addSuffix: true }),
                        icon: LogIn, color: "text-blue-500", bg: "bg-blue-500/10",
                      },
                      {
                        label: "Open Alerts", value: selectedEmployee.openAlerts.toString(),
                        icon: Bell, color: selectedEmployee.openAlerts > 0 ? "text-red-500" : "text-emerald-600",
                        bg: selectedEmployee.openAlerts > 0 ? "bg-red-500/10" : "bg-emerald-500/10",
                      },
                    ].map(({ label, value, icon: Icon, color, bg }) => (
                      <div key={label} className={`rounded-xl p-3 ${bg} border border-border/50`}>
                        <Icon className={`w-4 h-4 ${color} mb-1.5`} />
                        <div className={`text-sm font-bold font-mono ${color}`}>{value}</div>
                        <div className="text-[10px] text-muted-foreground">{label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Training Progress */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-xs font-mono uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
                        <BookOpen className="w-3.5 h-3.5" />Security Training
                      </div>
                      <div className={`text-xs font-mono font-bold ${TRAINING_STATUS_META[selectedEmployee.trainingStatus].color}`}>
                        {selectedEmployee.trainingCompleted}/{selectedEmployee.trainingTotal} modules · {TRAINING_STATUS_META[selectedEmployee.trainingStatus].label}
                      </div>
                    </div>
                    <Progress value={(selectedEmployee.trainingCompleted / selectedEmployee.trainingTotal) * 100} className="h-2" />
                  </div>

                  {/* Recent Flags */}
                  {selectedEmployee.recentFlags.length > 0 && (
                    <div>
                      <div className="text-xs font-mono uppercase text-muted-foreground tracking-wider mb-2 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />Risk Flags
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {selectedEmployee.recentFlags.map(flag => (
                          <span key={flag} className="text-xs px-2.5 py-1 rounded-full bg-orange-500/10 text-orange-600 border border-orange-400/30 font-mono">
                            ⚠ {flag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Associated Alerts */}
                  {MOCK_ALERTS.filter(a => a.employeeId === selectedEmployee.id).length > 0 && (
                    <div>
                      <div className="text-xs font-mono uppercase text-muted-foreground tracking-wider mb-2 flex items-center gap-1.5">
                        <ShieldAlert className="w-3.5 h-3.5 text-red-500" />Associated Insider Threat Alerts
                      </div>
                      <div className="space-y-2">
                        {MOCK_ALERTS.filter(a => a.employeeId === selectedEmployee.id).map(alert => {
                          const ThreatIcon = THREAT_META[alert.category].icon;
                          const status = STATUS_META[alert.status];
                          return (
                            <div key={alert.id} className={`flex items-start gap-3 p-3 rounded-lg border ${RISK_COLORS[alert.severity].border} ${RISK_COLORS[alert.severity].bg}`}>
                              <ThreatIcon className={`w-4 h-4 mt-0.5 shrink-0 ${THREAT_META[alert.category].color}`} />
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-semibold">{alert.title}</div>
                                <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                                  {formatDistanceToNow(alert.detectedAt, { addSuffix: true })} · Confidence: {alert.confidence}%
                                </div>
                              </div>
                              <span className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded border shrink-0 ${status.color}`}>
                                {status.label}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ── INSIDER THREATS TAB ────────────────────────────────────────── */}
        <TabsContent value="alerts">
          {/* Alert filters */}
          <div className="flex flex-wrap gap-2 mb-4">
            {(["all", "open", "investigating", "resolved", "dismissed"] as const).map(s => (
              <button
                key={s}
                onClick={() => setAlertFilter(s)}
                className={`h-8 px-3 text-xs rounded-md border font-mono uppercase tracking-wider transition-colors ${alertFilter === s ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:text-foreground"}`}
              >
                {s === "all" ? "All" : STATUS_META[s].label}
                {s !== "all" && (
                  <span className="ml-1.5 opacity-70">
                    ({MOCK_ALERTS.filter(a => a.status === s).length})
                  </span>
                )}
              </button>
            ))}
            <span className="ml-auto text-xs text-muted-foreground font-mono self-center">
              {filteredAlerts.length} alert{filteredAlerts.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="grid lg:grid-cols-5 gap-5">
            {/* Alert List */}
            <div className="lg:col-span-2 space-y-2">
              {filteredAlerts.length === 0 ? (
                <div className="surface-card p-10 text-center text-muted-foreground text-sm">
                  <ShieldAlert className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No alerts match your filters.
                </div>
              ) : filteredAlerts.map(alert => {
                const ThreatIcon = THREAT_META[alert.category].icon;
                const status = STATUS_META[alert.status];
                const riskC = RISK_COLORS[alert.severity];
                return (
                  <button
                    key={alert.id}
                    onClick={() => setSelectedAlert(alert)}
                    className={`w-full text-left surface-card p-4 hover:border-primary/40 transition-all ${selectedAlert?.id === alert.id ? "border-primary/60" : ""}`}
                  >
                    <div className="flex items-start gap-3 mb-2">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${riskC.bg}`}>
                        <ThreatIcon className={`w-4 h-4 ${THREAT_META[alert.category].color}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold leading-tight">{alert.title}</div>
                        <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                          {alert.employeeName} · {alert.department}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <RiskBadge level={alert.severity} />
                        <span className="text-[10px] font-mono text-muted-foreground flex items-center gap-0.5">
                          <Brain className="w-2.5 h-2.5" />{alert.confidence}% conf
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded border ${status.color}`}>
                          {status.label}
                        </span>
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {formatDistanceToNow(alert.detectedAt, { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Alert Detail */}
            <div className="lg:col-span-3">
              {!selectedAlert ? (
                <div className="surface-card p-16 text-center text-muted-foreground">
                  <Eye className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <div className="text-sm">Select an alert to view full investigation details, indicators, and recommended actions.</div>
                </div>
              ) : (() => {
                const ThreatIcon = THREAT_META[selectedAlert.category].icon;
                const status = STATUS_META[selectedAlert.status];
                const riskC = RISK_COLORS[selectedAlert.severity];
                return (
                  <div className="surface-card p-6 space-y-5">
                    {/* Alert Header */}
                    <div className="flex items-start gap-3">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${riskC.bg} border ${riskC.border}`}>
                        <ThreatIcon className={`w-5 h-5 ${THREAT_META[selectedAlert.category].color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-base leading-tight">{selectedAlert.title}</h3>
                        <div className="flex items-center flex-wrap gap-2 mt-1.5">
                          <RiskBadge level={selectedAlert.severity} />
                          <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border ${status.color}`}>{status.label}</span>
                          <span className="text-[10px] text-muted-foreground font-mono">{THREAT_META[selectedAlert.category].label}</span>
                        </div>
                      </div>
                    </div>

                    {/* Employee & Time */}
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: "Employee", value: selectedAlert.employeeName, sub: selectedAlert.department },
                        { label: "Detected", value: format(selectedAlert.detectedAt, "MMM d, HH:mm"), sub: formatDistanceToNow(selectedAlert.detectedAt, { addSuffix: true }) },
                        { label: "AI Confidence", value: `${selectedAlert.confidence}%`, sub: selectedAlert.confidence >= 85 ? "High confidence" : selectedAlert.confidence >= 70 ? "Moderate" : "Low — review carefully" },
                      ].map(({ label, value, sub }) => (
                        <div key={label} className="bg-secondary/40 rounded-lg p-3">
                          <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1">{label}</div>
                          <div className="text-sm font-semibold">{value}</div>
                          <div className="text-[10px] text-muted-foreground">{sub}</div>
                        </div>
                      ))}
                    </div>

                    {/* Confidence Bar */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="text-xs font-mono uppercase text-muted-foreground tracking-wider flex items-center gap-1">
                          <Brain className="w-3.5 h-3.5" />ML Detection Confidence
                        </div>
                        <span className={`text-xs font-mono font-bold ${selectedAlert.confidence >= 80 ? "text-red-500" : selectedAlert.confidence >= 60 ? "text-orange-500" : "text-yellow-600"}`}>
                          {selectedAlert.confidence}%
                        </span>
                      </div>
                      <Progress value={selectedAlert.confidence} className="h-2" />
                    </div>

                    {/* Description */}
                    <div>
                      <div className="text-xs font-mono uppercase text-muted-foreground tracking-wider mb-2 flex items-center gap-1.5">
                        <Info className="w-3.5 h-3.5" />Alert Description
                      </div>
                      <p className="text-sm leading-relaxed text-muted-foreground bg-secondary/30 rounded-lg p-3 border border-border/50">
                        {selectedAlert.description}
                      </p>
                    </div>

                    {/* Indicators */}
                    <div>
                      <div className="text-xs font-mono uppercase text-muted-foreground tracking-wider mb-2 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />Detection Indicators
                      </div>
                      <ul className="space-y-1.5">
                        {selectedAlert.indicators.map((ind, i) => (
                          <li key={i} className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-sm ${riskC.bg} ${riskC.border}`}>
                            <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${riskC.bar}`} />
                            {ind}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                      {selectedAlert.status === "open" && (
                        <Button size="sm" onClick={() => { toast.success("Investigation started"); }}>
                          <Eye className="w-3.5 h-3.5 mr-1.5" />Start Investigation
                        </Button>
                      )}
                      {selectedAlert.status === "investigating" && (
                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => toast.success("Alert resolved")}>
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />Mark Resolved
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => toast.info("Employee notified")}>
                        <Mail className="w-3.5 h-3.5 mr-1.5" />Notify Employee
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => toast.info("Alert escalated to CISO")}>
                        <Zap className="w-3.5 h-3.5 mr-1.5" />Escalate to CISO
                      </Button>
                      <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => toast.success("Alert dismissed")}>
                        Dismiss
                      </Button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </TabsContent>

        {/* ── TRAINING TAB ───────────────────────────────────────────────── */}
        <TabsContent value="training" className="space-y-5">
          {/* Training Overview Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Avg Completion", value: `${stats.avgHygieneScore}%`, color: "text-emerald-600", bg: "bg-emerald-500/10" },
              { label: "Overdue Employees", value: stats.overdueTraining, color: "text-red-500", bg: "bg-red-500/10" },
              { label: "Mandatory Modules", value: MOCK_MODULES.filter(m => m.mandatory).length, color: "text-primary", bg: "bg-primary/10" },
              { label: "In Progress", value: MOCK_EMPLOYEES.filter(e => e.trainingStatus === "in_progress").length, color: "text-blue-500", bg: "bg-blue-500/10" },
            ].map(({ label, value, color, bg }) => (
              <div key={label} className={`surface-card p-4 flex items-center gap-3`}>
                <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center`}>
                  <BookOpen className={`w-5 h-5 ${color}`} />
                </div>
                <div>
                  <div className={`text-2xl font-bold ${color}`}>{value}</div>
                  <div className="text-[10px] font-mono uppercase text-muted-foreground">{label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Training Modules List */}
          <div className="space-y-2">
            <div className="text-xs font-mono uppercase text-muted-foreground tracking-wider mb-3">Security Training Modules</div>
            {MOCK_MODULES.map(module => {
              const isOverdue = module.dueDate < new Date();
              const isExpanded = expandedModules.has(module.id);
              return (
                <div key={module.id} className={`surface-card overflow-hidden border-l-4 ${isOverdue ? "border-l-red-500" : module.completionRate >= 80 ? "border-l-emerald-500" : "border-l-yellow-500"}`}>
                  <button
                    className="w-full p-4 flex items-center gap-4 text-left hover:bg-secondary/20 transition-colors"
                    onClick={() => toggleModule(module.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-sm font-semibold">{module.title}</span>
                        {module.mandatory && (
                          <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">Mandatory</span>
                        )}
                        {isOverdue && (
                          <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-red-500/10 text-red-500 border border-red-400/30">Past Due</span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-[10px] text-muted-foreground font-mono">
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{module.duration} min</span>
                        <span>{module.category}</span>
                        <span>Due: {format(module.dueDate, "MMM d, yyyy")}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right w-28">
                        <div className={`text-sm font-bold font-mono ${module.completionRate >= 80 ? "text-emerald-600" : module.completionRate >= 60 ? "text-yellow-600" : "text-red-500"}`}>
                          {module.completionRate}%
                        </div>
                        <Progress value={module.completionRate} className="h-1.5 w-24 mt-1" />
                      </div>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-0 border-t border-border/50 bg-secondary/20">
                      <p className="text-sm text-muted-foreground mb-4 mt-3">{module.description}</p>
                      <div className="space-y-2">
                        <div className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider">Completion by Department</div>
                        {DEPARTMENTS.map(dept => {
                          const deptEmps = MOCK_EMPLOYEES.filter(e => e.department === dept);
                          if (!deptEmps.length) return null;
                          const rate = Math.round(40 + Math.random() * 55);
                          return (
                            <div key={dept} className="flex items-center gap-3">
                              <div className="w-20 text-[10px] font-mono text-muted-foreground">{dept}</div>
                              <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${rate >= 80 ? "bg-emerald-500" : rate >= 60 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${rate}%` }} />
                              </div>
                              <span className={`text-[10px] font-mono w-8 text-right ${rate >= 80 ? "text-emerald-600" : rate >= 60 ? "text-yellow-600" : "text-red-500"}`}>{rate}%</span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex gap-2 mt-4">
                        <Button size="sm" variant="outline" onClick={() => toast.success(`Reminder sent for: ${module.title}`)}>
                          <Mail className="w-3.5 h-3.5 mr-1.5" />Send Reminder to Overdue
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => toast.info("Opening module details…")}>
                          <ExternalLink className="w-3.5 h-3.5 mr-1.5" />View Full Report
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Employee Detail Modal ──────────────────────────────────────────── */}
      <Dialog open={!!selectedEmployee && activeTab !== "employees"} onOpenChange={() => setSelectedEmployee(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Employee Risk Profile</DialogTitle>
          </DialogHeader>
          {selectedEmployee && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold ${RISK_COLORS[selectedEmployee.riskLevel].bg} ${RISK_COLORS[selectedEmployee.riskLevel].text}`}>
                  {selectedEmployee.name.split(" ").map(n => n[0]).join("")}
                </div>
                <div>
                  <div className="font-bold">{selectedEmployee.name}</div>
                  <div className="text-sm text-muted-foreground">{selectedEmployee.role} · {selectedEmployee.department}</div>
                </div>
                <div className="ml-auto"><RiskBadge level={selectedEmployee.riskLevel} /></div>
              </div>
              <MiniRiskBar score={selectedEmployee.riskScore} />
              <Button className="w-full" onClick={() => { setSelectedEmployee(null); setActiveTab("employees"); }}>
                View Full Profile
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
