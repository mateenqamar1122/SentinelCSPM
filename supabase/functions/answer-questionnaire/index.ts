// Drafts answers to a security questionnaire using the user's actual posture data.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-id",
};

const SYSTEM_PROMPT = `You are a security analyst helping a startup answer an enterprise vendor security questionnaire.

You will receive:
1. A list of questions from the buyer.
2. Context about the startup's CURRENT posture (compliance scores, vendor list, checklist progress, open findings).

Rules:
- Be honest. If the context doesn't support a "yes", say so or mark confidence "low".
- Use the founder's posture data to back up answers (e.g. "We use AWS which is SOC 2 compliant; details tracked in our vendor register").
- Keep each answer 2-5 sentences. Professional, factual tone.
- Confidence: "high" if posture clearly supports the answer; "medium" if partial; "low" if no supporting data.
- Never invent certifications, audits, or controls the startup doesn't have.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { questions, sessionId } = await req.json();
    if (!Array.isArray(questions) || questions.length === 0) {
      return new Response(JSON.stringify({ error: "questions array required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Pull posture context for THIS session.
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { "x-session-id": sessionId ?? "" } },
    });

    const [findingsRes, vendorsRes, checklistRes, scansRes] = await Promise.all([
      sb.from("findings").select("severity,category,title,rule_id,compliance").limit(200),
      (sb as any).from("vendors").select("name,category,soc2_status,data_access,criticality"),
      (sb as any).from("checklist_items").select("title,category,priority,done"),
      sb.from("scans").select("scan_kind,status,total_findings,started_at").order("started_at", { ascending: false }).limit(10),
    ]);

    const findings = findingsRes.data ?? [];
    const vendors = vendorsRes.data ?? [];
    const checklist = checklistRes.data ?? [];
    const scans = scansRes.data ?? [];

    const sevCounts = findings.reduce((acc: Record<string, number>, f: any) => {
      acc[f.severity] = (acc[f.severity] ?? 0) + 1; return acc;
    }, {});
    const checklistDone = checklist.filter((i: any) => i.done).length;
    const checklistByCat = checklist.reduce((acc: Record<string, { done: number; total: number }>, i: any) => {
      acc[i.category] ??= { done: 0, total: 0 };
      acc[i.category].total++;
      if (i.done) acc[i.category].done++;
      return acc;
    }, {});

    const context = `## Posture summary

Open findings by severity: ${JSON.stringify(sevCounts)}
Recent scans: ${scans.length} (kinds: ${[...new Set(scans.map((s: any) => s.scan_kind))].join(", ") || "none"})

## Vendors (${vendors.length})
${vendors.map((v: any) => `- ${v.name} [${v.category}] SOC2:${v.soc2_status} crit:${v.criticality} data:${(v.data_access || []).join("/")}`).join("\n") || "(none registered)"}

## Security checklist progress (${checklistDone}/${checklist.length} done)
${Object.entries(checklistByCat).map(([c, v]: any) => `- ${c}: ${v.done}/${v.total}`).join("\n") || "(no checklist)"}

## Sample finding rules
${[...new Set(findings.map((f: any) => f.rule_id))].slice(0, 20).join(", ") || "(none)"}`;

    const userPrompt = `${context}

## Questions to answer
${questions.map((q: string, i: number) => `${i + 1}. ${q}`).join("\n")}

Return one answer per question, in order.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "draft_answers",
            description: "Return drafted answers for the questionnaire.",
            parameters: {
              type: "object",
              properties: {
                answers: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      question: { type: "string" },
                      answer: { type: "string" },
                      confidence: { type: "string", enum: ["high", "medium", "low"] },
                    },
                    required: ["question", "answer", "confidence"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["answers"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "draft_answers" } },
      }),
    });

    if (!aiResp.ok) {
      const txt = await aiResp.text();
      console.error("AI error", aiResp.status, txt);
      if (aiResp.status === 429) return new Response(JSON.stringify({ error: "Rate limit. Try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiResp.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ error: "AI service error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await aiResp.json();
    const argsStr = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!argsStr) {
      return new Response(JSON.stringify({ error: "No structured response from AI" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const parsed = JSON.parse(argsStr);
    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("answer-questionnaire error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
