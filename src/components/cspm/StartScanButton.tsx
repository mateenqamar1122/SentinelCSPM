import { Button } from "@/components/ui/button";
import { Loader2, Lock, Play } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSessionId } from "@/lib/session";
import { toast } from "sonner";
import { Link, useNavigate } from "react-router-dom";
import type { Database } from "@/integrations/supabase/types";
import { useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/hooks/useAuth";

type Provider = Database["public"]["Enums"]["cloud_provider"];

const fnNameFor = (p: Provider) =>
  p === "aws" ? "scan-aws" :
  p === "gcp" ? "scan-gcp" :
  p === "azure" ? "scan-azure" : "scan-demo";

interface Props {
  connectionId: string;
  provider: Provider;
  size?: "sm" | "default" | "lg";
  variant?: "default" | "outline" | "secondary";
  onStarted?: (scanId: string) => void;
}

export const StartScanButton = ({ connectionId, provider, size = "default", variant = "default", onStarted }: Props) => {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canCloudScan } = useSubscription();
  const isRealProvider = provider === "aws" || provider === "gcp" || provider === "azure";
  const locked = isRealProvider && user && !canCloudScan;

  const start = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(fnNameFor(provider), {
        body: { connectionId },
        headers: { "x-session-id": getSessionId() },
      });
      if (error) throw error;
      const scanId = (data as { scanId?: string })?.scanId;
      if (!scanId) throw new Error("Scan did not return an ID");
      toast.success("Scan completed");
      onStarted?.(scanId);
      navigate(`/scans/${scanId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Scan failed";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (locked) {
    return (
      <Button asChild size={size} variant="outline">
        <Link to="/pricing"><Lock className="w-4 h-4 mr-2" /> Upgrade for real scans</Link>
      </Button>
    );
  }

  return (
    <Button onClick={start} disabled={loading} size={size} variant={variant}>
      {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
      {loading ? "Scanning…" : "Start Scan"}
    </Button>
  );
};
