import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Plus, ShieldAlert, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getSessionId } from "@/lib/session";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type Provider = Database["public"]["Enums"]["cloud_provider"];

interface Props {
  onCreated?: () => void;
  trigger?: React.ReactNode;
}

export const AddConnectionDialog = ({ onCreated, trigger }: Props) => {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Provider>("aws");
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState("");
  // AWS
  const [awsKey, setAwsKey] = useState("");
  const [awsSecret, setAwsSecret] = useState("");
  const [awsRegion, setAwsRegion] = useState("us-east-1");
  // GCP
  const [gcpJson, setGcpJson] = useState("");
  // Azure
  const [azTenant, setAzTenant] = useState("");
  const [azClient, setAzClient] = useState("");
  const [azSecret, setAzSecret] = useState("");
  const [azSub, setAzSub] = useState("");

  const reset = () => {
    setName(""); setAwsKey(""); setAwsSecret(""); setAwsRegion("us-east-1");
    setGcpJson(""); setAzTenant(""); setAzClient(""); setAzSecret(""); setAzSub("");
  };

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Please give this connection a name.");
      return;
    }
    let credentials: Record<string, unknown> = { configured: true };

    if (tab === "aws") {
      if (!awsKey || !awsSecret) return toast.error("AWS Access Key and Secret are required.");
      credentials = { configured: true, accessKeyId: awsKey, secretAccessKey: awsSecret, region: awsRegion };
    } else if (tab === "gcp") {
      if (!gcpJson) return toast.error("Service account JSON is required.");
      try { JSON.parse(gcpJson); } catch { return toast.error("Invalid JSON for service account."); }
      credentials = { configured: true, serviceAccountJson: gcpJson };
    } else if (tab === "azure") {
      if (!azTenant || !azClient || !azSecret || !azSub)
        return toast.error("All Azure fields are required.");
      credentials = { configured: true, tenantId: azTenant, clientId: azClient, clientSecret: azSecret, subscriptionId: azSub };
    } else if (tab === "demo") {
      credentials = { configured: true, demo: true };
    }

    setSubmitting(true);
    const { error } = await supabase.from("cloud_connections").insert({
      session_id: getSessionId(),
      provider: tab,
      name: name.trim(),
      credentials: credentials as never,
      status: "connected",
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Connection added.");
    reset();
    setOpen(false);
    onCreated?.();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="w-4 h-4 mr-1" /> Add connection
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Connect a cloud provider</DialogTitle>
          <DialogDescription>
            Use a least-privileged read-only role. Credentials are stored only in your session's database row and used server-side for scans.
          </DialogDescription>
        </DialogHeader>

        <Alert className="border-severity-medium/40 bg-severity-medium-bg/30">
          <ShieldAlert className="w-4 h-4 text-severity-medium" />
          <AlertTitle className="text-severity-medium">Demo app — do not use production credentials</AlertTitle>
          <AlertDescription className="text-muted-foreground">
            Create dedicated, read-only credentials for testing.
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <Label htmlFor="conn-name">Connection name</Label>
          <Input id="conn-name" placeholder="e.g. Production AWS" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as Provider)}>
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="aws">AWS</TabsTrigger>
            <TabsTrigger value="gcp">GCP</TabsTrigger>
            <TabsTrigger value="azure">Azure</TabsTrigger>
            <TabsTrigger value="demo"><Sparkles className="w-3 h-3 mr-1" />Demo</TabsTrigger>
          </TabsList>

          <TabsContent value="aws" className="space-y-3 mt-4">
            <p className="text-xs text-muted-foreground">
              Create an IAM user with policies <code className="font-mono text-foreground">SecurityAudit</code> + <code className="font-mono text-foreground">ViewOnlyAccess</code>.
            </p>
            <div className="space-y-2">
              <Label>Access Key ID</Label>
              <Input className="font-mono" placeholder="AKIA..." value={awsKey} onChange={(e) => setAwsKey(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Secret Access Key</Label>
              <Input className="font-mono" type="password" placeholder="••••••••" value={awsSecret} onChange={(e) => setAwsSecret(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Default Region</Label>
              <Input className="font-mono" value={awsRegion} onChange={(e) => setAwsRegion(e.target.value)} />
            </div>
          </TabsContent>

          <TabsContent value="gcp" className="space-y-3 mt-4">
            <p className="text-xs text-muted-foreground">
              Create a service account with <code className="font-mono text-foreground">Security Reviewer</code> + <code className="font-mono text-foreground">Viewer</code> roles, then paste the JSON key.
            </p>
            <div className="space-y-2">
              <Label>Service Account JSON</Label>
              <Textarea
                className="font-mono text-xs min-h-[160px]"
                placeholder='{"type":"service_account", ...}'
                value={gcpJson}
                onChange={(e) => setGcpJson(e.target.value)}
              />
            </div>
          </TabsContent>

          <TabsContent value="azure" className="space-y-3 mt-4">
            <p className="text-xs text-muted-foreground">
              Register an Entra ID app with <code className="font-mono text-foreground">Reader</code> + <code className="font-mono text-foreground">Security Reader</code> roles on your subscription.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2 col-span-2">
                <Label>Subscription ID</Label>
                <Input className="font-mono" value={azSub} onChange={(e) => setAzSub(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Tenant ID</Label>
                <Input className="font-mono" value={azTenant} onChange={(e) => setAzTenant(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Client ID</Label>
                <Input className="font-mono" value={azClient} onChange={(e) => setAzClient(e.target.value)} />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Client Secret</Label>
                <Input className="font-mono" type="password" value={azSecret} onChange={(e) => setAzSecret(e.target.value)} />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="demo" className="space-y-3 mt-4">
            <p className="text-sm text-muted-foreground">
              No credentials needed. Demo connections produce a realistic mix of misconfigurations across AWS, GCP and Azure so you can explore the dashboard immediately.
            </p>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Add connection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
