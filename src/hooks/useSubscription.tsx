import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { isPromoActive } from "@/lib/promo";

export type Subscription = {
  tier: "free" | "pro" | "enterprise" | string;
  status: string;
  features: { cloud_scans?: boolean; marketplace_hiring?: boolean; ai_soc?: boolean };
  cancel_at_period_end: boolean;
  current_period_end: string | null;
};

const FREE: Subscription = {
  tier: "free",
  status: "inactive",
  features: { cloud_scans: false, marketplace_hiring: false, ai_soc: false },
  cancel_at_period_end: false,
  current_period_end: null,
};

const PROMO_SUB: Subscription = {
  tier: "promo",
  status: "active",
  features: { cloud_scans: true, marketplace_hiring: true, ai_soc: true },
  cancel_at_period_end: false,
  current_period_end: null,
};

export function useSubscription() {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<Subscription>(FREE);
  const [loading, setLoading] = useState(true);
  const [promo, setPromo] = useState<boolean>(isPromoActive());

  useEffect(() => {
    const onChange = () => setPromo(isPromoActive());
    window.addEventListener("promo-changed", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("promo-changed", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user) {
        setSubscription(FREE);
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("subscriptions")
        .select("tier,status,features,cancel_at_period_end,current_period_end")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (data && ["active", "trialing"].includes(data.status)) {
        setSubscription({
          tier: data.tier,
          status: data.status,
          features: (data.features as any) ?? {},
          cancel_at_period_end: data.cancel_at_period_end,
          current_period_end: data.current_period_end,
        });
      } else {
        setSubscription(FREE);
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const effective = promo ? PROMO_SUB : subscription;

  return {
    subscription: effective,
    loading,
    isPaid: effective.tier !== "free",
    canCloudScan: !!effective.features.cloud_scans,
    canHirePentester: !!effective.features.marketplace_hiring,
    canAISoc: !!effective.features.ai_soc,
    promoActive: promo,
  };
}
