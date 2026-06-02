const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const POLAR_ACCESS_TOKEN = Deno.env.get("POLAR_ACCESS_TOKEN");
    if (!POLAR_ACCESS_TOKEN) throw new Error("POLAR_ACCESS_TOKEN not configured");

    const url = new URL(req.url);
    const checkoutId = url.searchParams.get("checkout_id");
    if (!checkoutId) throw new Error("checkout_id required");

    const resp = await fetch(`https://api.polar.sh/v1/checkouts/${checkoutId}`, {
      headers: { Authorization: `Bearer ${POLAR_ACCESS_TOKEN}` },
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(`Polar verify failed [${resp.status}]: ${JSON.stringify(data)}`);

    return new Response(
      JSON.stringify({
        status: data.status,
        product_id: data.product_id,
        customer_email: data.customer_email,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
