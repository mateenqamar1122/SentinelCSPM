import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

export default function BillingSuccess() {
  const [params] = useSearchParams();
  const checkoutId = params.get("checkout_id");
  const [status, setStatus] = useState<"loading" | "succeeded" | "failed" | "pending">("loading");

  useEffect(() => {
    if (!checkoutId) {
      setStatus("failed");
      return;
    }
    let attempts = 0;
    let cancelled = false;

    async function check() {
      attempts++;
      try {
        const { data, error } = await supabase.functions.invoke("polar-verify-checkout", {
          method: "GET" as any,
          // pass via query string
        });
        // invoke doesn't pass query; use raw fetch instead
        if (error) throw error;
        return data;
      } catch {
        return null;
      }
    }

    async function poll() {
      while (!cancelled && attempts < 20) {
        try {
          const url = `${(supabase as any).functionsUrl || ""}`;
          // Use direct fetch to pass query param
          const resp = await fetch(
            `https://ifuyugqpetmhjbekpwop.supabase.co/functions/v1/polar-verify-checkout?checkout_id=${encodeURIComponent(
              checkoutId!
            )}`,
            {
              headers: {
                apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              },
            }
          );
          const data = await resp.json();
          attempts++;
          if (data.status === "succeeded") {
            setStatus("succeeded");
            return;
          }
          if (data.status === "failed" || data.status === "expired") {
            setStatus("failed");
            return;
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 1500));
      }
      if (!cancelled) setStatus("pending");
    }
    poll();
    return () => {
      cancelled = true;
    };
  }, [checkoutId]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="max-w-md w-full p-8 text-center">
        {status === "loading" && (
          <>
            <Loader2 className="h-12 w-12 mx-auto animate-spin text-primary mb-4" />
            <h1 className="text-2xl font-bold mb-2">Confirming your payment…</h1>
            <p className="text-muted-foreground">This usually takes a few seconds.</p>
          </>
        )}
        {status === "succeeded" && (
          <>
            <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-4" />
            <h1 className="text-2xl font-bold mb-2">Payment successful!</h1>
            <p className="text-muted-foreground mb-6">
              Your subscription is active. You now have access to real scans and marketplace hiring.
            </p>
            <Link to="/dashboard"><Button variant="cta" className="w-full">Go to dashboard</Button></Link>
          </>
        )}
        {status === "pending" && (
          <>
            <Loader2 className="h-12 w-12 mx-auto animate-spin text-muted-foreground mb-4" />
            <h1 className="text-2xl font-bold mb-2">Still processing</h1>
            <p className="text-muted-foreground mb-6">
              Your payment is being processed. Refresh in a moment or check your dashboard.
            </p>
            <Link to="/dashboard"><Button className="w-full">Go to dashboard</Button></Link>
          </>
        )}
        {status === "failed" && (
          <>
            <XCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
            <h1 className="text-2xl font-bold mb-2">Payment didn't go through</h1>
            <p className="text-muted-foreground mb-6">No charge was made. You can try again anytime.</p>
            <Link to="/pricing"><Button variant="cta" className="w-full">Back to pricing</Button></Link>
          </>
        )}
      </Card>
    </div>
  );
}
