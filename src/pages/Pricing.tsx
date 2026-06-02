import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, Loader2, Tag, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { activatePromo, deactivatePromo } from "@/lib/promo";

const PRO_PRODUCT_ID = "76bf4721-71f2-4bcf-8d5e-ee04fb752e23";
const ENTERPRISE_PRODUCT_ID = "84101600-e84e-4626-8bb1-8239660d4bf4";

const tiers = [
  {
    name: "Free",
    price: "$0",
    productId: null,
    description: "Explore the platform with demo data.",
    features: ["Demo cloud scans", "Browse marketplace", "Compliance checklist", "Threat intel feed"],
  },
  {
    name: "Pro",
    price: "$49",
    productId: PRO_PRODUCT_ID,
    highlight: true,
    description: "Real scans and full marketplace access.",
    features: [
      "Real AWS / GCP / Azure scans",
      "Hire pentesters from marketplace",
      "Unlimited assets",
      "Email support",
    ],
  },
  {
    name: "Enterprise",
    price: "$199",
    productId: ENTERPRISE_PRODUCT_ID,
    description: "For security teams operating at scale.",
    features: [
      "Everything in Pro",
      "Priority pentester matching",
      "Dedicated success manager",
      "SSO + audit log",
    ],
  },
];

export default function Pricing() {
  const { user } = useAuth();
  const { subscription, isPaid, promoActive } = useSubscription();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [promoInput, setPromoInput] = useState("");

  function handleApplyPromo() {
    if (activatePromo(promoInput)) {
      toast.success("Promo applied — all paid features unlocked");
      setPromoInput("");
    } else {
      toast.error("Invalid promo code");
    }
  }

  async function handleSelect(productId: string | null, name: string) {
    if (!productId) return;
    if (!user) {
      navigate("/auth");
      return;
    }
    setBusy(productId);
    try {
      const { data, error } = await supabase.functions.invoke("polar-create-checkout", {
        body: { product_id: productId },
      });
      if (error) throw error;
      if (!data?.url) throw new Error("No checkout URL");
      window.location.href = data.url;
    } catch (e: any) {
      toast.error(e.message || `Couldn't start checkout for ${name}`);
      setBusy(null);
    }
  }

  async function handleManage() {
    setBusy("portal");
    try {
      const { data, error } = await supabase.functions.invoke("polar-customer-portal");
      if (error) throw error;
      window.location.href = data.url;
    } catch (e: any) {
      toast.error(e.message || "Couldn't open billing portal");
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto flex items-center justify-between py-4">
          <Link to="/" className="text-lg font-semibold">Cloud Guardian</Link>
          <Link to="/dashboard"><Button variant="ghost">Dashboard</Button></Link>
        </div>
      </header>
      <main className="container mx-auto px-4 py-16">
        <div className="mx-auto max-w-2xl text-center mb-14">
          <h1 className="text-4xl font-bold tracking-tight mb-3">Simple, transparent pricing</h1>
          <p className="text-muted-foreground">Start free. Upgrade when you need real scans and marketplace hiring.</p>
          {isPaid && (
            <div className="mt-4 flex items-center justify-center gap-3">
              <Badge>Current plan: {subscription.tier}</Badge>
              <Button variant="outline" size="sm" onClick={handleManage} disabled={busy === "portal"}>
                {busy === "portal" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Manage billing"}
              </Button>
            </div>
          )}

          <Card className="mt-6 p-4 max-w-md mx-auto text-left">
            {promoActive ? (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span>Promo active — all paid features unlocked</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    deactivatePromo();
                    toast.success("Promo removed");
                  }}
                >
                  Remove
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-muted-foreground shrink-0" />
                <Input
                  placeholder="Enter promo code"
                  value={promoInput}
                  onChange={(e) => setPromoInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleApplyPromo()}
                  className="h-9"
                />
                <Button size="sm" onClick={handleApplyPromo} disabled={!promoInput.trim()}>
                  Apply
                </Button>
              </div>
            )}
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {tiers.map((tier) => {
            const isCurrent = subscription.tier === tier.name.toLowerCase();
            return (
              <Card
                key={tier.name}
                className={`p-6 flex flex-col ${tier.highlight ? "border-primary shadow-lg" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-semibold">{tier.name}</h3>
                  {tier.highlight && <Badge>Most popular</Badge>}
                </div>
                <div className="mt-4 mb-2">
                  <span className="text-4xl font-bold">{tier.price}</span>
                  <span className="text-muted-foreground">/mo</span>
                </div>
                <p className="text-sm text-muted-foreground mb-6">{tier.description}</p>
                <ul className="space-y-2 mb-6 flex-1">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                {tier.productId === null ? (
                  <Button variant="outline" disabled={!user || subscription.tier === "free"}>
                    {subscription.tier === "free" ? "Current plan" : "Free"}
                  </Button>
                ) : isCurrent ? (
                  <Button variant="outline" disabled>Current plan</Button>
                ) : (
                  <Button
                    onClick={() => handleSelect(tier.productId, tier.name)}
                    disabled={busy === tier.productId}
                    variant={tier.highlight ? "cta" : "default"}
                  >
                    {busy === tier.productId ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      `Get ${tier.name}`
                    )}
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
      </main>
    </div>
  );
}
