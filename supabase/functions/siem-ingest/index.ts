// Public webhook endpoint that any SIEM can POST alerts to.
// URL: https://<project>.functions.supabase.co/siem-ingest?token=<ingest_token>
// Auth: per-connection ingest_token (URL param OR x-ingest-token header).
// Body: a single alert object OR an array of alerts. Free-form JSON — we
// extract title/severity/external_id with sensible fallbacks for common SIEMs
// (Splunk, Sentinel, Elastic, Datadog, Chronicle, QRadar) and store the
// untouched payload in `raw`.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ingest-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SEVERITY_MAP: Record<string, string> = {
  "0": "info", "1": "low", "2": "medium", "3": "high", "4": "critical",
  informational: "info", info: "info", low: "low", medium: "medium",
  moderate: "medium", high: "high", critical: "critical", severe: "critical",
};

function pickSeverity(raw: any): string {
  const candidates = [
    raw?.severity, raw?.Severity, raw?.priority, raw?.level,
    raw?.signal?.severity, raw?.alert?.severity, raw?.event?.severity,
  ].filter((v) => v != null);
  for (const c of candidates) {
    const k = String(c).toLowerCase().trim();
    if (SEVERITY_MAP[k]) return SEVERITY_MAP[k];
    if (["info", "low", "medium", "high", "critical"].includes(k)) return k;
  }
  return "medium";
}

function pickTitle(raw: any): string {
  return (
    raw?.title ?? raw?.name ?? raw?.rule_name ?? raw?.rule?.name ??
    raw?.alert_name ?? raw?.signal?.name ?? raw?.message ?? raw?.description ??
    "Untitled SIEM alert"
  ).toString().slice(0, 500);
}

function pickExternalId(raw: any): string | null {
  const v = raw?.id ?? raw?.event_id ?? raw?.alert_id ?? raw?.signal_id ?? raw?._id ?? raw?.uuid;
  return v != null ? String(v).slice(0, 200) : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token") ?? req.headers.get("x-ingest-token");
    if (!token || token.length < 16) return json({ error: "Missing or invalid token" }, 401);

    // Service-role client — webhook is unauthenticated, RLS bypassed by design.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: conn, error: cErr } = await supabase
      .from("siem_connections")
      .select("id, user_id, provider, status")
      .eq("ingest_token", token)
      .maybeSingle();
    if (cErr || !conn) return json({ error: "Invalid token" }, 401);
    if (conn.status === "disabled") return json({ error: "Connection disabled" }, 403);

    let body: any;
    try { body = await req.json(); }
    catch { return json({ error: "Invalid JSON" }, 400); }

    const items: any[] = Array.isArray(body) ? body : [body];
    if (items.length === 0) return json({ accepted: 0 });
    if (items.length > 200) return json({ error: "Max 200 alerts per request" }, 413);

    const rows = items.map((raw) => ({
      user_id: conn.user_id,
      siem_connection_id: conn.id,
      source: conn.provider,
      external_id: pickExternalId(raw),
      title: pickTitle(raw),
      severity: pickSeverity(raw),
      raw,
      status: "new",
      ai_verdict: "pending",
    }));

    // Upsert on (siem_connection_id, external_id) when external_id present;
    // otherwise plain insert (will create one row per call).
    const withId = rows.filter((r) => r.external_id);
    const withoutId = rows.filter((r) => !r.external_id);

    let inserted = 0;
    if (withId.length) {
      const { error, count } = await supabase
        .from("soc_alerts")
        .upsert(withId, { onConflict: "siem_connection_id,external_id", ignoreDuplicates: true, count: "exact" });
      if (error) { console.error("upsert error", error); return json({ error: error.message }, 500); }
      inserted += count ?? withId.length;
    }
    if (withoutId.length) {
      const { error, count } = await supabase.from("soc_alerts").insert(withoutId, { count: "exact" });
      if (error) { console.error("insert error", error); return json({ error: error.message }, 500); }
      inserted += count ?? withoutId.length;
    }

    await supabase
      .from("siem_connections")
      .update({ last_sync_at: new Date().toISOString(), status: "connected" })
      .eq("id", conn.id);

    return json({ accepted: items.length, inserted });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
