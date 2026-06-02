import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Radar, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getSessionId } from "@/lib/session";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

type RealKind = "deps" | "container" | "secrets" | "iac";

const SAMPLES: Record<string, string> = {
  npm: `{
  "name": "demo-app",
  "version": "1.0.0",
  "dependencies": {
    "lodash": "4.17.20",
    "axios": "0.21.0",
    "express": "4.16.0",
    "minimist": "1.2.5"
  }
}`,
  PyPI: `Django==2.2.10
requests==2.19.1
Flask==0.12.2
PyYAML==5.1`,
  Go: `module example.com/demo
go 1.21
require (
  github.com/gin-gonic/gin v1.6.0
  golang.org/x/crypto v0.0.0-20210921155107-089bfa567519
)`,
  secrets: `# .env (committed by accident)
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
STRIPE_SECRET=sk_live_4eC39HqLyjWDarjtT1zdp7dcReplaceMeNow
GITHUB_TOKEN=ghp_16C7e42F292c6912E7710c838347Ae178B4a
SLACK_WEBHOOK=https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX
DB_PASSWORD="9f8aH3kLpQ1xVz4mNbRtYuIoPaSdFgHj"`,
  kubernetes: `apiVersion: apps/v1
kind: Deployment
metadata: { name: api, namespace: prod }
spec:
  replicas: 2
  selector: { matchLabels: { app: api } }
  template:
    metadata: { labels: { app: api } }
    spec:
      hostNetwork: true
      containers:
        - name: api
          image: my-org/api:latest
          securityContext:
            privileged: true
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata: { name: web-frontend }
roleRef: { apiGroup: rbac.authorization.k8s.io, kind: ClusterRole, name: cluster-admin }
subjects: [{ kind: ServiceAccount, name: web, namespace: prod }]`,
  terraform: `resource "aws_s3_bucket" "logs" {
  bucket = "my-app-logs"
  acl    = "public-read"
}
resource "aws_security_group" "web" {
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
resource "aws_db_instance" "main" {
  publicly_accessible = true
}`,
  dockerfile: `FROM node:latest
ENV API_KEY=sk_live_abc123
RUN curl https://get.example.com/install.sh | bash
COPY . /app
CMD ["node", "/app/index.js"]`,
};

export const RealScanDialog = () => {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<RealKind>("deps");
  const [loading, setLoading] = useState(false);

  const [label, setLabel] = useState("");
  const [content, setContent] = useState("");
  const [ecosystem, setEcosystem] = useState<"npm" | "PyPI" | "Go" | "Maven" | "RubyGems">("npm");
  const [iacKind, setIacKind] = useState<"kubernetes" | "terraform" | "dockerfile">("kubernetes");

  const navigate = useNavigate();

  const loadSample = () => {
    if (tab === "deps" || tab === "container") setContent(SAMPLES[ecosystem] ?? SAMPLES.npm);
    else if (tab === "secrets") setContent(SAMPLES.secrets);
    else setContent(SAMPLES[iacKind]);
  };

  const submit = async () => {
    if (!content.trim()) { toast.error("Paste something to scan"); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("scan-real", {
        body: {
          kind: tab,
          label: label || `Manual ${tab} scan`,
          ecosystem: tab === "deps" || tab === "container" ? ecosystem : undefined,
          iacKind: tab === "iac" ? iacKind : undefined,
          content,
        },
        headers: { "x-session-id": getSessionId() },
      });
      if (error) throw error;
      const r = data as { scanId?: string; findings?: number; error?: string };
      if (r?.error) throw new Error(r.error);
      if (!r?.scanId) throw new Error("No scan ID returned");
      toast.success(`Real scan complete — ${r.findings ?? 0} findings`);
      setOpen(false);
      navigate(`/scans/${r.scanId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Scan failed");
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default" className="gap-2">
          <Radar className="w-4 h-4" /> Real Scan
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Run a real OSS-powered scan
            <Badge variant="secondary" className="text-[10px] uppercase">live data</Badge>
          </DialogTitle>
          <DialogDescription>
            Findings come from live OSS data sources: <span className="font-mono">OSV.dev</span> for CVEs (same database Trivy uses),
            ported <span className="font-mono">Gitleaks</span> rules for secrets, and <span className="font-mono">Checkov</span>-style checks for IaC.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as RealKind)}>
          <TabsList className="grid grid-cols-4">
            <TabsTrigger value="deps">Dependencies</TabsTrigger>
            <TabsTrigger value="container">Container</TabsTrigger>
            <TabsTrigger value="secrets">Secrets</TabsTrigger>
            <TabsTrigger value="iac">IaC / K8s</TabsTrigger>
          </TabsList>

          <div className="space-y-3 mt-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="label">Label</Label>
                <Input id="label" value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. payments-api package-lock.json" />
              </div>
              {(tab === "deps" || tab === "container") && (
                <div>
                  <Label>Ecosystem</Label>
                  <Select value={ecosystem} onValueChange={(v) => setEcosystem(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="npm">npm (package-lock.json / package.json)</SelectItem>
                      <SelectItem value="PyPI">PyPI (requirements.txt)</SelectItem>
                      <SelectItem value="Go">Go (go.mod / go.sum)</SelectItem>
                      <SelectItem value="Maven">Maven (pom.xml)</SelectItem>
                      <SelectItem value="RubyGems">RubyGems (Gemfile.lock)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {tab === "iac" && (
                <div>
                  <Label>Manifest type</Label>
                  <Select value={iacKind} onValueChange={(v) => setIacKind(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="kubernetes">Kubernetes YAML</SelectItem>
                      <SelectItem value="terraform">Terraform (HCL)</SelectItem>
                      <SelectItem value="dockerfile">Dockerfile</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="content">
                  {tab === "deps" && "Paste a manifest (package-lock.json, requirements.txt, go.mod, …)"}
                  {tab === "container" && "Paste the package list extracted from your image"}
                  {tab === "secrets" && "Paste source code, .env, log output — anything to scan for secrets"}
                  {tab === "iac" && "Paste your manifest"}
                </Label>
                <Button variant="ghost" size="sm" onClick={loadSample} className="gap-1.5 h-7">
                  <Sparkles className="w-3.5 h-3.5" /> Load sample
                </Button>
              </div>
              <Textarea
                id="content" value={content} onChange={e => setContent(e.target.value)}
                rows={14} className="font-mono text-xs"
                placeholder="Paste content here…"
              />
            </div>
          </div>
        </Tabs>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={loading}>
            {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Scanning…</> : "Run Real Scan"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
