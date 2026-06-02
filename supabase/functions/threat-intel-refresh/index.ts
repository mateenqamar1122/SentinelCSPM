// Threat Intel: pulls CISA KEV (live) + a curated set of recent NVD CVEs,
// then filters to the user's declared tech stack and inserts alerts.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const KEV_URL = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json";

interface KevVuln {
  cveID: string;
  vendorProject: string;
  product: string;
  vulnerabilityName: string;
  shortDescription: string;
  dateAdded: string;
  requiredAction?: string;
  knownRansomwareCampaignUse?: string;
}

// Fallback / NVD-style curated additions when the KEV fetch fails or to enrich.
const FALLBACK: Array<{ cve: string; product: string; vendor: string; title: string; desc: string; sev: "critical"|"high"|"medium"; date: string; refs: string[] }> = [
  { cve: "CVE-2024-3094", vendor: "xz-utils", product: "xz", title: "xz-utils backdoor (sshd compromise)", desc: "Malicious code in xz 5.6.0/5.6.1 enables remote unauthorized SSH access.", sev: "critical", date: "2024-03-29", refs: ["https://nvd.nist.gov/vuln/detail/CVE-2024-3094"] },
  { cve: "CVE-2024-6387", vendor: "openssh", product: "openssh", title: "regreSSHion — OpenSSH RCE", desc: "Race condition in OpenSSH's signal handler enables unauthenticated RCE as root on glibc systems.", sev: "critical", date: "2024-07-01", refs: ["https://nvd.nist.gov/vuln/detail/CVE-2024-6387"] },
  { cve: "CVE-2023-50164", vendor: "apache", product: "struts", title: "Apache Struts file-upload RCE", desc: "Path traversal during file upload enables RCE.", sev: "critical", date: "2023-12-07", refs: ["https://nvd.nist.gov/vuln/detail/CVE-2023-50164"] },
  { cve: "CVE-2024-21626", vendor: "opencontainers", product: "runc", title: "runc — container escape via fd leak", desc: "Leaked file descriptor in runc enables container escape and host compromise.", sev: "high", date: "2024-01-31", refs: ["https://nvd.nist.gov/vuln/detail/CVE-2024-21626"] },
  { cve: "CVE-2024-39338", vendor: "axios", product: "axios", title: "axios SSRF via absolute URL", desc: "Server-Side Request Forgery in axios <1.7.4 allows internal network probing.", sev: "high", date: "2024-08-12", refs: ["https://nvd.nist.gov/vuln/detail/CVE-2024-39338"] },
  { cve: "CVE-2024-43796", vendor: "expressjs", product: "express", title: "Express open redirect", desc: "Open redirect via response.redirect when input is not validated.", sev: "medium", date: "2024-09-10", refs: ["https://nvd.nist.gov/vuln/detail/CVE-2024-43796"] },
];

function severityFor(kev: KevVuln): "critical" | "high" | "medium" {
  if (kev.knownRansomwareCampaignUse?.toLowerCase() === "known") return "critical";
  return "high";
}

function matchesStack(text: string, stack: string[]): boolean {
  const t = text.toLowerCase();
  return stack.some(s => s && t.includes(s.toLowerCase()));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const sessionId = req.headers.get("x-session-id") ?? "";
    if (!sessionId) return new Response(JSON.stringify({ error: "Missing x-session-id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { stack } = await req.json().catch(() => ({ stack: [] }));
    const techStack: string[] = Array.isArray(stack) && stack.length > 0
      ? stack
      : ["aws","s3","ec2","openssh","openssl","nodejs","express","axios","lodash","docker","runc","kubernetes","postgres","nginx","apache","struts","xz"];

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

    // Wipe prior alerts for this session before refresh
    await supabase.from("threat_intel_alerts").delete().eq("session_id", sessionId);

    const inserts: any[] = [];

    // 1) Live KEV
    try {
      const r = await fetch(KEV_URL, { headers: { "user-agent": "SentinelCSPM/1.0" } });
      if (r.ok) {
        const j = await r.json();
        const vulns: KevVuln[] = j.vulnerabilities ?? [];
        for (const v of vulns) {
          const corpus = `${v.vendorProject} ${v.product} ${v.vulnerabilityName} ${v.shortDescription}`;
          if (!matchesStack(corpus, techStack)) continue;
          inserts.push({
            session_id: sessionId,
            cve_id: v.cveID,
            severity: severityFor(v),
            title: `[KEV] ${v.vulnerabilityName}`,
            description: `${v.shortDescription}\n\nVendor: ${v.vendorProject} · Product: ${v.product}\nRequired action: ${v.requiredAction ?? "Apply vendor patch."}`,
            affected_tech: [v.vendorProject, v.product].filter(Boolean),
            references_urls: [`https://nvd.nist.gov/vuln/detail/${v.cveID}`, "https://www.cisa.gov/known-exploited-vulnerabilities-catalog"],
            kev_listed: true,
            published_at: v.dateAdded ? new Date(v.dateAdded).toISOString() : null,
          });
          if (inserts.length >= 40) break;
        }
      }
    } catch (e) {
      console.warn("KEV fetch failed, using fallback only:", e);
    }

    // 2) Curated NVD additions (also stack-filtered)
    for (const f of FALLBACK) {
      const corpus = `${f.vendor} ${f.product} ${f.title} ${f.desc}`;
      if (!matchesStack(corpus, techStack)) continue;
      if (inserts.find(x => x.cve_id === f.cve)) continue;
      inserts.push({
        session_id: sessionId,
        cve_id: f.cve,
        severity: f.sev,
        title: f.title,
        description: f.desc,
        affected_tech: [f.vendor, f.product],
        references_urls: f.refs,
        kev_listed: false,
        published_at: new Date(f.date).toISOString(),
      });
    }

    if (inserts.length > 0) {
      const { error } = await supabase.from("threat_intel_alerts").insert(inserts);
      if (error) throw error;
    }

    return new Response(JSON.stringify({ inserted: inserts.length, stack: techStack }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("threat-intel-refresh:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
