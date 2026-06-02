// Shared utilities for CSPM scanner edge functions.
// Each scanner imports these to keep insertion + summarization consistent.
// deno-lint-ignore-file no-explicit-any
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-session-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export interface FindingInput {
  severity: Severity;
  category: string;
  title: string;
  resource: string;
  region?: string | null;
  description: string;
  mitigation: string;
  compliance?: string[];
  rule_id: string;
}

export interface ScanContext {
  supabase: SupabaseClient;
  sessionId: string;
  scanId: string;
  connectionId: string;
}

export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );
}

export async function startScan(
  supabase: SupabaseClient,
  connectionId: string,
  sessionId: string
): Promise<string> {
  const { data, error } = await supabase
    .from("scans")
    .insert({
      session_id: sessionId,
      connection_id: connectionId,
      status: "running",
    })
    .select("id")
    .single();
  if (error) throw new Error(`Failed to create scan: ${error.message}`);
  return data.id as string;
}

export async function finishScan(
  supabase: SupabaseClient,
  scanId: string,
  connectionId: string,
  findings: FindingInput[],
  resourcesScanned: number,
  errorMessage?: string,
) {
  // Insert findings (if any)
  if (findings.length > 0) {
    // session_id will be filled per row from the scan row
    const { data: scanRow } = await supabase
      .from("scans").select("session_id").eq("id", scanId).single();
    const sessionId = scanRow?.session_id;
    const rows = findings.map(f => ({
      session_id: sessionId,
      scan_id: scanId,
      severity: f.severity,
      category: f.category,
      title: f.title,
      resource: f.resource,
      region: f.region ?? null,
      description: f.description,
      mitigation: f.mitigation,
      compliance: f.compliance ?? [],
      rule_id: f.rule_id,
    }));
    const { error } = await supabase.from("findings").insert(rows);
    if (error) console.error("Failed to insert findings:", error.message);
  }

  const counts = {
    critical: findings.filter(f => f.severity === "critical").length,
    high:     findings.filter(f => f.severity === "high").length,
    medium:   findings.filter(f => f.severity === "medium").length,
    low:      findings.filter(f => f.severity === "low").length,
    info:     findings.filter(f => f.severity === "info").length,
  };

  await supabase.from("scans").update({
    status: errorMessage ? "failed" : "completed",
    finished_at: new Date().toISOString(),
    error_message: errorMessage ?? null,
    total_findings: findings.length,
    critical_count: counts.critical,
    high_count: counts.high,
    medium_count: counts.medium,
    low_count: counts.low,
    info_count: counts.info,
    resources_scanned: resourcesScanned,
  }).eq("id", scanId);

  await supabase.from("cloud_connections").update({
    last_scan_at: new Date().toISOString(),
  }).eq("id", connectionId);
}

export function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export async function loadConnection(
  supabase: SupabaseClient,
  connectionId: string,
  sessionId: string,
  expectedProvider: "aws" | "gcp" | "azure" | "demo",
) {
  const { data, error } = await supabase
    .from("cloud_connections")
    .select("*")
    .eq("id", connectionId)
    .eq("session_id", sessionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Connection not found");
  if (data.provider !== expectedProvider) {
    throw new Error(`Connection is ${data.provider}, not ${expectedProvider}`);
  }
  return data;
}
