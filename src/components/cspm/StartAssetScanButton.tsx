import { Button } from "@/components/ui/button";
import { Loader2, Play } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSessionId } from "@/lib/session";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface Props {
  assetId: string;
  size?: "sm" | "default" | "lg";
  variant?: "default" | "outline" | "secondary";
  onStarted?: (scanId: string) => void;
}

export const StartAssetScanButton = ({ assetId, size = "default", variant = "default", onStarted }: Props) => {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const start = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("scan-asset", {
        body: { assetId },
        headers: { "x-session-id": getSessionId() },
      });
      if (error) throw error;
      const scanId = (data as { scanId?: string })?.scanId;
      if (!scanId) throw new Error("Scan did not return an ID");
      toast.success("Scan completed");
      onStarted?.(scanId);
      navigate(`/scans/${scanId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Scan failed");
    } finally { setLoading(false); }
  };

  return (
    <Button onClick={start} disabled={loading} size={size} variant={variant}>
      {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
      {loading ? "Scanning…" : "Start Scan"}
    </Button>
  );
};
