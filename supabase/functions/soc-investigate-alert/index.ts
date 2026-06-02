import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM = `You are an autonomous SOC analyst agent investigating a SIEM alert.
You must produce a thorough but cautious investigation, with clear reasoning steps,
MITRE ATT&CK mapping, and explicit guardrails. NEVER recommend destructive automated
actions — only suggest them for a human analyst to approve. If evidence is weak,
verdict MUST be "needs_human" with confidence < 0.7.`;

const TOOL = {
  type: "function",
  function: {
    name: "submit_investigation",
    description: "Submit final investigation result for the alert.",
    parameters: {
      type: "object",
      properties: {
        verdict: { type: "string", enum: ["true_positive", "false_positive", "benign", "needs_human"] },
        confidence: { type: "number", description: "0..1" },
        summary: { type: "string", description: "2-4 sentence executive summary." },
        reasoning_steps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              step: { type: "string" },
              hypothesis: { type: "string" },
              evidence: { type: "string" },
              outcome: { type: "string", enum: ["supports", "refutes", "inconclusive"] },
            },
            required: ["step", "hypothesis", "evidence", "outcome"],
            additionalProperties: false,
          },
        },
        entities: {
          type: "object",
          properties: {
            ips: { type: "array", items: { type: "string" } },
            users: { type: "array", items: { type: "string" } },
            hosts: { type: "array", items: { type: "string" } },
            hashes: { type: "array", items: { type: "string" } },
            processes: { type: "array", items: { type: "string" } },
          },
          additionalProperties: false,
        },
        mitre_tactics: { type: "array", items: { type: "string" } },
        mitre_techniques: { type: "array", items: { type: "string" } },
        recommended_actions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              kind: { type: "string", enum: ["investigate", "contain", "notify", "dismiss"] },
              priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
              rationale: { type: "string" },
            },
            required: ["title", "kind", "priority", "rationale"],
            additionalProperties: false,
          },
        },
        guardrail_flags: {
          type: "array",
          items: { type: "string" },
          description: "e.g. 'low_confidence', 'pii_detected', 'destructive_action_blocked'",
        },
      },
      required: ["verdict", "confidence", "summary", "reasoning_steps", "mitre_tactics", "recommended_actions", "guardrail_flags"],
      additionalProperties: false,
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: uErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (uErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const { alert_id } = await req.json();
    if (!alert_id) return json({ error: "alert_id required" }, 400);

    const { data: alert, error: aErr } = await supabase
      .from("soc_alerts").select("*").eq("id", alert_id).maybeSingle();
    if (aErr || !alert) return json({ error: "Alert not found" }, 404);

    // Mark triaging
    await supabase.from("soc_alerts").update({ status: "triaging" }).eq("id", alert_id);

    // Cheap context enrichment from existing project data
    const { data: relatedFindings } = await supabase
      .from("findings").select("rule_id,title,severity,resource").limit(5);
    const { data: threatIntel } = await supabase
      .from("threat_intel_alerts").select("cve_id,title,severity,kev_listed").limit(5);

    const userPrompt = `ALERT:
${JSON.stringify({
  title: alert.title,
  severity: alert.severity,
  source: alert.source,
  raw: alert.raw,
}, null, 2)}

CONTEXT — recent findings in this tenant:
${JSON.stringify(relatedFindings ?? [], null, 2)}

CONTEXT — active threat intel:
${JSON.stringify(threatIntel ?? [], null, 2)}

Investigate this alert. Extract entities, walk through 3-5 reasoning steps,
map to MITRE ATT&CK, and recommend non-destructive next actions.
Apply guardrails: flag low confidence, PII, or any destructive recommendation.
Then call submit_investigation.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userPrompt },
        ],
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: "submit_investigation" } },
      }),
    });

    if (aiResp.status === 429) return json({ error: "Rate limited, try again shortly." }, 429);
    if (aiResp.status === 402) return json({ error: "AI credits exhausted." }, 402);
    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI error", aiResp.status, t);
      return json({ error: "AI gateway error" }, 500);
    }

    const aiData = await aiResp.json();
    const call = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) return json({ error: "No tool call returned" }, 500);

    let result: any;
    try { result = JSON.parse(call.function.arguments); }
    catch { return json({ error: "Invalid AI output" }, 500); }

    // Enforce guardrails server-side
    const flags: string[] = Array.isArray(result.guardrail_flags) ? [...result.guardrail_flags] : [];
    let verdict = result.verdict ?? "needs_human";
    const confidence = Math.max(0, Math.min(1, Number(result.confidence ?? 0)));
    if (confidence < 0.7 && verdict !== "needs_human") {
      flags.push("low_confidence_downgraded");
      verdict = "needs_human";
    }
    // Block any destructive recommendation from being auto-marked critical-execute
    const safeActions = (result.recommended_actions ?? []).map((a: any) => ({
      ...a,
      requires_human_approval: true,
    }));

    const { data: inv, error: iErr } = await supabase
      .from("soc_investigations")
      .insert({
        user_id: userId,
        alert_id,
        status: "completed",
        summary: result.summary ?? null,
        reasoning_steps: result.reasoning_steps ?? [],
        enrichments: {
          entities: result.entities ?? {},
          mitre_techniques: result.mitre_techniques ?? [],
          related_findings: relatedFindings ?? [],
          threat_intel: threatIntel ?? [],
        },
        recommended_actions: safeActions,
        guardrail_flags: flags,
        model: "google/gemini-2.5-flash",
        completed_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (iErr) {
      console.error(iErr);
      return json({ error: iErr.message }, 500);
    }

    await supabase.from("soc_alerts").update({
      status: "investigated",
      ai_verdict: verdict,
      ai_confidence: confidence,
      mitre_tactics: result.mitre_tactics ?? [],
    }).eq("id", alert_id);

    return json({ investigation: inv, verdict, confidence, guardrail_flags: flags });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
