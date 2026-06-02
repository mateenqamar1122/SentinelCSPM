// AI Explain & Fix — translates a security finding into plain-English
// explanation, business impact, and a brief for an engineer.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface FindingPayload {
  title: string;
  description: string;
  mitigation: string;
  severity: string;
  category: string;
  resource: string;
  rule_id: string;
  cve_id?: string | null;
  compliance?: string[] | null;
}

const SYSTEM_PROMPT = `You are a friendly security advisor who helps non-technical startup founders understand security findings.

For every finding return a JSON object with these keys:
- plain_explanation: 2-3 short sentences. No jargon. Imagine explaining to a smart friend who doesn't code.
- business_impact: 1-2 sentences on real-world consequences (data breach, customer trust, fines, downtime). Mention rough $ or compliance risk if relevant.
- urgency: one of "fix today", "fix this week", "fix this sprint", "track but low priority"
- engineer_brief: a markdown block written FOR a developer. Include: what to do, where to do it, and a code/config snippet if applicable. Concise but actionable.
- ticket_title: a clear ticket title under 80 chars
- ticket_body: a markdown body suitable for a GitHub/Linear/Jira issue, including ## Problem, ## Impact, ## Suggested fix, ## Acceptance criteria sections.

Be warm, direct, and reassuring. Founders are stressed — help them prioritize.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const finding = (await req.json()) as FindingPayload;
    if (!finding?.title) {
      return new Response(JSON.stringify({ error: "Missing finding payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const userPrompt = `Finding to explain:

Title: ${finding.title}
Severity: ${finding.severity}
Category: ${finding.category}
Resource: ${finding.resource}
Rule: ${finding.rule_id}
${finding.cve_id ? `CVE: ${finding.cve_id}\n` : ""}${finding.compliance?.length ? `Compliance tags: ${finding.compliance.join(", ")}\n` : ""}
Technical description:
${finding.description}

Suggested mitigation (technical):
${finding.mitigation}`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "explain_finding",
            description: "Return founder-friendly explanation of a security finding.",
            parameters: {
              type: "object",
              properties: {
                plain_explanation: { type: "string" },
                business_impact: { type: "string" },
                urgency: { type: "string", enum: ["fix today", "fix this week", "fix this sprint", "track but low priority"] },
                engineer_brief: { type: "string" },
                ticket_title: { type: "string" },
                ticket_body: { type: "string" },
              },
              required: ["plain_explanation", "business_impact", "urgency", "engineer_brief", "ticket_title", "ticket_body"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "explain_finding" } },
      }),
    });

    if (!aiResp.ok) {
      const txt = await aiResp.text();
      console.error("AI gateway error", aiResp.status, txt);
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit reached. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in workspace settings." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiResp.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    const argsStr = toolCall?.function?.arguments;
    if (!argsStr) {
      return new Response(JSON.stringify({ error: "No structured response from AI" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const parsed = JSON.parse(argsStr);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("explain-finding error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
