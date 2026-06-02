import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

const PRO_PRODUCT_ID = "76bf4721-71f2-4bcf-8d5e-ee04fb752e23";
const ENTERPRISE_PRODUCT_ID = "84101600-e84e-4626-8bb1-8239660d4bf4";

function tierFromProduct(productId: string): string {
  if (productId === PRO_PRODUCT_ID) return "pro";
  if (productId === ENTERPRISE_PRODUCT_ID) return "enterprise";
  return "unknown";
}

Deno.serve(async (req) => {
  try {
    const secret = Deno.env.get("POLAR_WEBHOOK_SECRET");
    if (!secret) throw new Error("POLAR_WEBHOOK_SECRET not configured");

    const body = await req.text();
    const headers: Record<string, string> = {};
    req.headers.forEach((v, k) => (headers[k] = v));

    // Polar provides plain secret; standard-webhooks needs base64
    const base64Secret = btoa(secret);
    const wh = new Webhook(base64Secret);
    let payload: any;
    try {
      payload = wh.verify(body, headers);
    } catch (err) {
      console.error("Invalid signature", err);
      return new Response("invalid signature", { status: 401 });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const type = payload.type as string;
    const data = payload.data;
    console.log("Polar webhook:", type);

    // Handle subscription lifecycle
    if (type.startsWith("subscription.") || type === "checkout.updated") {
      const sub = type === "checkout.updated" ? null : data;
      const target = sub ?? data;

      // For checkout.updated only act on succeeded
      if (type === "checkout.updated" && data.status !== "succeeded") {
        return new Response("ok");
      }

      const externalCustomerId =
        target.customer?.external_id ||
        target.metadata?.external_customer_id ||
        data.customer?.external_id;
      const userId = externalCustomerId;
      if (!userId) {
        console.warn("No external_customer_id in event", type);
        return new Response("ok");
      }

      const productId = target.product_id || target.product?.id || data.product_id;
      const tier = productId ? tierFromProduct(productId) : "pro";
      const status = target.status || "active";
      const isActive = ["active", "trialing", "succeeded"].includes(status);

      const features = isActive
        ? { cloud_scans: true, marketplace_hiring: true, ai_soc: true, tier }
        : { cloud_scans: false, marketplace_hiring: false, ai_soc: false, tier: "free" };

      await admin.from("subscriptions").upsert(
        {
          user_id: userId,
          polar_customer_id: target.customer_id || target.customer?.id,
          polar_subscription_id: target.id && type.startsWith("subscription.") ? target.id : undefined,
          polar_product_id: productId,
          tier: isActive ? tier : "free",
          status,
          features,
          current_period_end: target.current_period_end ?? null,
          cancel_at_period_end: target.cancel_at_period_end ?? false,
        },
        { onConflict: "user_id" }
      );
    }

    return new Response("ok", { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("webhook error:", msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
});
