import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Reveal, Stagger, staggerItem, motion } from "@/components/Reveal";
import {
  Shield, ArrowRight, Sparkles, Cloud, Boxes, Brain, Radar, FileBadge2,
  ListChecks, Building2, Siren, FileQuestion, CalendarDays, FileText,
  Check, Zap, Lock, Eye, ChevronRight,
} from "lucide-react";

const NAV = [
  { label: "Product", href: "#product" },
  { label: "Marketplace", href: "/marketplace", route: true },
  { label: "How it works", href: "#how" },
  { label: "Pricing", href: "#pricing" },
];

const FEATURES = [
  { icon: Cloud, title: "Cloud posture", desc: "Connect AWS, GCP & Azure. One-click scans surface misconfigurations and risky policies." },
  { icon: Boxes, title: "Code & containers", desc: "Scan repos and images for secrets, IaC drift, and CVEs — before they ship." },
  { icon: Brain, title: "AI security", desc: "Inspect agent workflows, prompts, and model endpoints for prompt injection and data exfil risks." },
  { icon: Radar, title: "Threat intel", desc: "Daily KEV & CVE feed mapped to your stack so you only see what's relevant." },
  { icon: FileBadge2, title: "Compliance", desc: "SOC 2, ISO 27001, PCI, HIPAA mapped to live findings — audit-ready evidence." },
  { icon: ListChecks, title: "Startup checklist", desc: "Curated SOC 2 / ISO starter list with progress tracking and one-click delegation." },
  { icon: Building2, title: "Vendor risk", desc: "Track every SaaS vendor's SOC 2 status, data access, and renewal dates." },
  { icon: Siren, title: "Incident response", desc: "Playbooks auto-attached to critical findings. Timeline, tasks, and post-mortems built-in." },
  { icon: FileQuestion, title: "Questionnaires", desc: "AI auto-answers RFP & vendor security questionnaires from your live posture." },
  { icon: CalendarDays, title: "Weekly digest", desc: "A one-page Monday morning brief — what changed, what's urgent, what improved." },
  { icon: FileText, title: "Board reports", desc: "Executive-ready posture reports in one click. PDF or markdown, on demand." },
  { icon: Sparkles, title: "Explain & Fix", desc: "Every finding ships with a plain-English explanation and a copy-paste mitigation." },
];

const STEPS = [
  { n: "01", title: "Connect", desc: "Add your cloud accounts, repos, and SaaS vendors. Read-only by default — under five minutes." },
  { n: "02", title: "Scan", desc: "We crawl your stack and rank findings by exploitability, business impact, and effort." },
  { n: "03", title: "Fix & prove", desc: "Copy-paste fixes, auto-incidents on critical risks, and audit-ready compliance evidence." },
];

const PRICES = [
  { name: "Seed", price: "$0", note: "Up to 25 assets · 1 cloud account", features: ["All scanners", "Weekly digest", "Compliance mappings", "Community support"], cta: "Start free" },
  { name: "Series A", price: "$249", note: "/ month · unlimited assets", features: ["Everything in Seed", "Vendor & incident workflows", "AI Explain & Fix", "Slack & email alerts", "Priority support"], cta: "Start trial", featured: true },
  { name: "Scale", price: "Talk to us", note: "Custom · SAML/SSO · audit-ready", features: ["Multi-team RBAC", "Custom compliance frameworks", "Dedicated solutions engineer", "99.9% uptime SLA"], cta: "Contact sales" },
];

export default function Landing() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 shrink-0">
            <div className="w-9 h-9 grid place-items-center rounded-full bg-primary text-primary-foreground">
              <Shield className="w-4 h-4" />
            </div>
            <div className="leading-tight">
              <div className="text-base font-serif tracking-tight">Sentinel<span className="italic">CSPM</span></div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono">unified security posture</div>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            {NAV.map((n) => (
              n.route ? (
                <Link key={n.href} to={n.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">{n.label}</Link>
              ) : (
                <a key={n.href} href={n.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">{n.label}</a>
              )
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
              <Link to="/auth">Sign in</Link>
            </Button>
            <Button size="sm" variant="cta" asChild>
              <Link to="/dashboard">
                Get started <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 grid-bg pointer-events-none opacity-60" />
        <div className="container relative pt-20 pb-24 md:pt-28 md:pb-32">
          <motion.div
            className="max-w-3xl mx-auto text-center"
            initial="hidden"
            animate="visible"
            variants={{
              hidden: {},
              visible: { transition: { staggerChildren: 0.08 } },
            }}
          >
            <motion.span variants={staggerItem} className="pill mb-6 inline-flex">
              <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Built for founders, not Fortune 500
            </motion.span>
            <motion.h1 variants={staggerItem} className="display text-5xl md:text-7xl leading-[1.05] mb-6">
              Cloud security <span className="italic font-serif">that doesn't</span> need a security team.
            </motion.h1>
            <motion.p variants={staggerItem} className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
              SentinelCSPM finds misconfigurations, leaked secrets, and compliance gaps across your entire stack —
              and tells you exactly how to fix each one in plain English.
            </motion.p>
            <motion.div variants={staggerItem} className="flex items-center justify-center gap-3 mb-10">
              <Button size="lg" variant="cta" asChild>
                <Link to="/dashboard">
                  Open dashboard <ArrowRight className="w-4 h-4 ml-1.5" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <a href="#how">See how it works</a>
              </Button>
            </motion.div>
            <motion.div variants={staggerItem} className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-xs font-mono text-muted-foreground uppercase tracking-wider">
              <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5" /> No credit card</span>
              <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5" /> Read-only access</span>
              <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5" /> 5-minute setup</span>
              <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5" /> SOC 2 ready</span>
            </motion.div>
          </motion.div>

          {/* Hero card preview */}
          <Reveal delay={0.3} y={32} className="mt-16 md:mt-20 max-w-5xl mx-auto">
            <div className="surface-card p-2 md:p-3 glow-ring">
              <div className="rounded-xl bg-card border border-border overflow-hidden">
                <div className="flex items-center gap-1.5 px-4 py-3 border-b border-border bg-surface-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-severity-critical/70" />
                  <span className="w-2.5 h-2.5 rounded-full bg-severity-medium/70" />
                  <span className="w-2.5 h-2.5 rounded-full bg-accent" />
                  <span className="ml-3 text-xs font-mono text-muted-foreground">sentinelcspm.app/dashboard</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border">
                  {[
                    { label: "Posture score", value: "87", sub: "+4 this week", tone: "text-foreground" },
                    { label: "Critical", value: "2", sub: "down from 7", tone: "text-severity-critical" },
                    { label: "High", value: "11", sub: "5 fixed today", tone: "text-severity-high" },
                    { label: "Compliance", value: "94%", sub: "SOC 2 ready", tone: "text-foreground" },
                  ].map((s) => (
                    <div key={s.label} className="bg-card p-5">
                      <div className="text-[10px] uppercase tracking-wider font-mono text-muted-foreground mb-2">{s.label}</div>
                      <div className={`text-3xl font-serif ${s.tone}`}>{s.value}</div>
                      <div className="text-xs text-muted-foreground mt-1 font-mono">{s.sub}</div>
                    </div>
                  ))}
                </div>
                <div className="p-5 space-y-2 bg-card">
                  {[
                    { sev: "critical", title: "Public S3 bucket exposes customer data", res: "s3://app-uploads-prod" },
                    { sev: "high", title: "IAM user with admin access · no MFA", res: "iam::deploy-bot" },
                    { sev: "medium", title: "Container image with high CVE", res: "ghcr.io/api:latest" },
                  ].map((f) => (
                    <div key={f.title} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-border bg-background hover:bg-secondary/40 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider border ${
                          f.sev === "critical" ? "bg-severity-critical-bg text-severity-critical border-severity-critical/30"
                          : f.sev === "high" ? "bg-severity-high-bg text-severity-high border-severity-high/30"
                          : "bg-severity-medium-bg text-severity-medium border-severity-medium/30"
                        }`}>{f.sev}</span>
                        <div className="min-w-0">
                          <div className="text-sm truncate">{f.title}</div>
                          <div className="text-xs text-muted-foreground font-mono truncate">{f.res}</div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Trust bar */}
      <section className="border-y border-border bg-surface-1/50">
        <div className="container py-8">
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-3 text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">
            <span>AWS · GCP · Azure</span>
            <span>·</span>
            <span>SOC 2 · ISO 27001 · PCI · HIPAA</span>
            <span>·</span>
            <span>GitHub · GitLab · Docker</span>
            <span>·</span>
            <span>OpenAI · Anthropic · Bedrock</span>
          </div>
        </div>
      </section>

      {/* Marketplace */}
      <section id="marketplace" className="container py-24 md:py-32">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <Reveal>
            <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-3">New · Marketplace</div>
            <h2 className="text-4xl md:text-5xl font-serif leading-[1.1] mb-5">
              Hire a vetted <span className="italic">pentester</span> in days, not months.
            </h2>
            <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
              Browse independent security researchers by skill, certification, and rate.
              Scope a test, agree on terms, and get an actionable report — all in one place.
            </p>
            <div className="flex flex-wrap items-center gap-3 mb-8">
              <Button size="lg" variant="cta" asChild>
                <Link to="/marketplace">Browse pentesters <ArrowRight className="w-4 h-4 ml-1.5" /></Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/auth?mode=signup&role=pentester">Offer your services</Link>
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-4 max-w-md">
              {[
                { v: "OSCP·OSWE", l: "Vetted certifications" },
                { v: "48h", l: "Avg. response" },
                { v: "Direct", l: "No middlemen" },
              ].map((s) => (
                <div key={s.l}>
                  <div className="text-sm font-semibold mb-0.5">{s.v}</div>
                  <div className="text-xs text-muted-foreground">{s.l}</div>
                </div>
              ))}
            </div>
          </Reveal>
          <Reveal delay={0.15} y={28}>
            <div className="surface-card p-6 space-y-3">
              {[
                { name: "Alex Reyes", h: "Senior offensive engineer · Cloud & API", rate: "$185", tags: ["AWS", "OSCP"] },
                { name: "Priya Shah", h: "AppSec specialist · React, Node, GraphQL", rate: "$140", tags: ["OWASP", "OSWE"] },
                { name: "Tomás Núñez", h: "Smart contract & Web3 auditor", rate: "$220", tags: ["Solidity", "Foundry"] },
              ].map((p) => (
                <div key={p.name} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent grid place-items-center text-primary-foreground text-xs font-semibold shrink-0">
                    {p.name.split(" ").map((s) => s[0]).join("")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{p.h}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold">{p.rate}<span className="text-xs text-muted-foreground font-normal">/hr</span></div>
                    <div className="flex gap-1 mt-1 justify-end">
                      {p.tags.map((t) => (
                        <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{t}</span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* Product highlights */}
      <section id="product" className="container py-24 md:py-32">
        <Reveal className="max-w-2xl mb-16">
          <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-3">Product</div>
          <h2 className="text-4xl md:text-5xl font-serif leading-[1.1] mb-4">
            One platform. Every <span className="italic">attack surface</span>.
          </h2>
          <p className="text-lg text-muted-foreground">
            Stop juggling six tools. SentinelCSPM unifies cloud, code, AI, and vendor risk
            into one prioritized to-do list.
          </p>
        </Reveal>

        <Stagger className="grid md:grid-cols-3 gap-6">
          {[
            { icon: Eye, title: "See everything", body: "From IAM policies to leaked API keys to vendor SOC 2 status — one inventory, always fresh." },
            { icon: Zap, title: "Fix faster", body: "Every finding includes a copy-paste shell command and a non-technical checklist. No more Stack Overflow rabbit holes." },
            { icon: Lock, title: "Prove it", body: "Auto-mapped to SOC 2, ISO 27001, PCI, and HIPAA. Export audit-ready evidence in one click." },
          ].map((p) => (
            <motion.div key={p.title} variants={staggerItem} className="surface-card p-7">
              <div className="w-10 h-10 grid place-items-center rounded-full bg-primary text-primary-foreground mb-5">
                <p.icon className="w-4.5 h-4.5" />
              </div>
              <h3 className="text-xl font-serif mb-2">{p.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{p.body}</p>
            </motion.div>
          ))}
        </Stagger>
      </section>

      {/* Features grid */}
      <section id="features" className="border-t border-border bg-surface-1/40">
        <div className="container py-24 md:py-32">
          <Reveal className="max-w-2xl mb-16">
            <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-3">Features</div>
            <h2 className="text-4xl md:text-5xl font-serif leading-[1.1] mb-4">
              Everything a startup needs. <span className="italic">Nothing</span> it doesn't.
            </h2>
          </Reveal>

          <Stagger stagger={0.04} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border rounded-2xl overflow-hidden border border-border">
            {FEATURES.map((f) => (
              <motion.div key={f.title} variants={staggerItem} className="bg-card p-6 hover:bg-secondary/40 transition-colors">
                <f.icon className="w-5 h-5 text-primary mb-3" />
                <h3 className="text-base font-medium mb-1.5">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </Stagger>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="container py-24 md:py-32">
        <Reveal className="max-w-2xl mb-16">
          <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-3">How it works</div>
          <h2 className="text-4xl md:text-5xl font-serif leading-[1.1]">
            Live posture in <span className="italic">five minutes</span>.
          </h2>
        </Reveal>

        <Stagger stagger={0.12} className="grid md:grid-cols-3 gap-8">
          {STEPS.map((s) => (
            <motion.div key={s.n} variants={staggerItem} className="relative">
              <div className="text-7xl font-serif text-primary/10 mb-2 leading-none">{s.n}</div>
              <h3 className="text-2xl font-serif mb-3">{s.title}</h3>
              <p className="text-muted-foreground leading-relaxed">{s.desc}</p>
            </motion.div>
          ))}
        </Stagger>
      </section>

      {/* Quote */}
      <section className="border-t border-border bg-surface-1/40">
        <div className="container py-24 md:py-28">
          <Reveal className="max-w-3xl mx-auto text-center">
            <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-6">From a founder</div>
            <blockquote className="text-2xl md:text-3xl font-serif leading-[1.3] mb-8">
              "We replaced three vendors and a part-time consultant with SentinelCSPM.
              Our SOC 2 readiness went from <span className="italic">'someday'</span> to a Monday morning checklist."
            </blockquote>
            <div className="text-sm text-muted-foreground font-mono">
              — CTO, Series A fintech · 28 employees
            </div>
          </Reveal>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="container py-24 md:py-32">
        <Reveal className="max-w-2xl mb-16 text-center mx-auto">
          <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-3">Pricing</div>
          <h2 className="text-4xl md:text-5xl font-serif leading-[1.1] mb-4">
            Honest pricing. <span className="italic">Cancel anytime.</span>
          </h2>
          <p className="text-lg text-muted-foreground">Start free. Upgrade when you raise.</p>
        </Reveal>

        <Stagger className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {PRICES.map((p) => (
            <motion.div
              key={p.name}
              variants={staggerItem}
              className={`surface-card p-7 flex flex-col ${
                p.featured ? "ring-2 ring-primary relative" : ""
              }`}
            >
              {p.featured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 pill">Most popular</span>
              )}
              <div className="text-sm font-mono uppercase tracking-wider text-muted-foreground mb-2">{p.name}</div>
              <div className="text-4xl font-serif mb-1">{p.price}</div>
              <div className="text-xs text-muted-foreground mb-6 font-mono">{p.note}</div>
              <ul className="space-y-2.5 mb-7 flex-1">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              <Button
                asChild
                variant={p.featured ? "cta" : "outline"}
                className="w-full"
              >
                <Link to="/dashboard">{p.cta}</Link>
              </Button>
            </motion.div>
          ))}
        </Stagger>
      </section>

      {/* Final CTA */}
      <section className="border-t border-border">
        <Reveal className="container py-24 md:py-32 text-center">
          <h2 className="text-4xl md:text-6xl font-serif leading-[1.05] max-w-3xl mx-auto mb-6">
            Your security posture, <span className="italic">on autopilot.</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto mb-10">
            Connect your first cloud account in under five minutes. See findings before your first coffee.
          </p>
          <Button size="lg" variant="cta" asChild>
            <Link to="/dashboard">
              Get started — it's free <ArrowRight className="w-4 h-4 ml-1.5" />
            </Link>
          </Button>
        </Reveal>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-10">
        <div className="container flex flex-col md:flex-row items-center justify-between gap-4 text-xs font-mono text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 grid place-items-center rounded-full bg-primary text-primary-foreground">
              <Shield className="w-3 h-3" />
            </div>
            <span>SentinelCSPM · cloud security posture</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#product" className="hover:text-foreground">Product</a>
            <a href="#pricing" className="hover:text-foreground">Pricing</a>
            <Link to="/dashboard" className="hover:text-foreground">Dashboard</Link>
            <span>v0.1 · demo</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
