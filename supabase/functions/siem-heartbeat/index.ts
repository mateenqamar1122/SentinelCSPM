// Cron-invoked: marks SIEM connections as "stale" when they haven't received
// any alerts in the last 6 hours. Ingestion itself is push (siem-ingest webhook).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const sixHoursAgo = new Date(Date.now() - 6 * 3600 * 1000).toISOString();

  const { data: conns } = await supabase
    .from("siem_connections")
    .select("id, last_sync_at, status");
  let stale = 0, healthy = 0;
  for (const c of conns ?? []) {
    const isStale = !c.last_sync_at || c.last_sync_at < sixHoursAgo;
    const target = isStale ? "stale" : "connected";
    if (c.status !== target && c.status !== "disabled") {
      await supabase.from("siem_connections").update({ status: target }).eq("id", c.id);
    }
    isStale ? stale++ : healthy++;
  }
  return new Response(JSON.stringify({ stale, healthy }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
