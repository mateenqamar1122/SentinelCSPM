// Real OSS-powered scanner.
// - "deps"      → OSV.dev (same DB Trivy uses) for dependency CVEs
// - "container" → OSV.dev applied to a container's package list
// - "secrets"   → ported Gitleaks regex + entropy ruleset
// - "iac"       → Checkov-style rules for K8s manifests, Terraform, Dockerfile
//
// All findings are written to the existing findings table with scan_kind
// matching the existing taxonomy so they show up across the dashboard.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { parseManifest, queryOsv, severityFor, aliasCve, type EcoSystem } from "./osv.ts";
import { scan as scanSecrets } from "./gitleaks.ts";
import { scanIac } from "./iac.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RealKind = "deps" | "container" | "secrets" | "iac";
type ScanKind = "code" | "container" | "kubernetes";

interface Body {
  kind: RealKind;
  label: string;                // human-readable identifier shown in findings
  ecosystem?: EcoSystem;        // for deps/container
  iacKind?: "kubernetes" | "terraform" | "dockerfile";
  content: string;              // pasted manifest / code / packages
}

function pickScanKind(k: RealKind, iacKind?: string): ScanKind {
  if (k === "secrets" || k === "deps") return "code";
  if (k === "container") return "container";
  if (k === "iac" && iacKind === "kubernetes") return "kubernetes";
  return "code";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const sessionId = req.headers.get("x-session-id") ?? "";
    if (!sessionId) return json({ error: "Missing x-session-id" }, 400);

    const body = await req.json() as Body;
    if (!body?.kind || !body?.content) return json({ error: "kind and content are required" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false }, global: { headers: { "x-session-id": sessionId } } },
    );

    // Create or reuse a synthetic asset so the existing dashboard has somewhere to anchor results.
    const assetType = body.kind === "container" ? "container_image"
                    : body.kind === "iac" && body.iacKind === "kubernetes" ? "kubernetes"
                    : "code_repo";
    const identifier = `real:${body.kind}:${body.label || "manual"}`;

    let { data: asset } = await supabase.from("assets").select("*")
      .eq("session_id", sessionId).eq("identifier", identifier).maybeSingle();
    if (!asset) {
      const { data: ins, error: aerr } = await supabase.from("assets").insert({
        session_id: sessionId,
        asset_type: assetType,
        identifier,
        name: body.label || `Real ${body.kind} scan`,
        metadata: { source: "real-scan", kind: body.kind, ecosystem: body.ecosystem ?? null, iacKind: body.iacKind ?? null },
      }).select("*").single();
      if (aerr) throw new Error(aerr.message);
      asset = ins;
    }

    const scanKind = pickScanKind(body.kind, body.iacKind);
    const { data: scan, error: serr } = await supabase.from("scans").insert({
      session_id: sessionId,
      connection_id: asset.id,
      asset_id: asset.id,
      scan_kind: scanKind,
      status: "running",
    }).select("id").single();
    if (serr) throw new Error(serr.message);

    // -----------------------------------------------------------------
    const findings: any[] = [];
    let resourcesScanned = 0;

    if (body.kind === "deps" || body.kind === "container") {
      const ecosystem = (body.ecosystem ?? "npm") as EcoSystem;
      const pkgs = parseManifest(ecosystem, body.content);
      resourcesScanned = pkgs.length;
      if (!pkgs.length) throw new Error(`No packages parsed from the input. Make sure the format matches ${ecosystem}.`);
      const hits = await queryOsv(pkgs);
      for (const { pkg, vuln } of hits) {
        const sev = severityFor(vuln);
        const cve = aliasCve(vuln);
        const refs = (vuln.references ?? []).slice(0, 3).map(r => r.url).join("\n");
        findings.push({
          severity: sev,
          category: "CVE",
          title: vuln.summary || `${vuln.id} affects ${pkg.name}@${pkg.version}`,
          resource: `${pkg.ecosystem} :: ${pkg.name}@${pkg.version}`,
          description: (vuln.details || vuln.summary || "Vulnerability reported by OSV.dev.").slice(0, 1500)
            + (refs ? `\n\nReferences:\n${refs}` : ""),
          mitigation: `Upgrade ${pkg.name} to a fixed version. See https://osv.dev/vulnerability/${vuln.id} for affected ranges and patches.`,
          rule_id: `OSV_${vuln.id}`,
          cve_id: cve ?? null,
          compliance: ["SOC2 CC7.1", "ISO27001 A.12.6.1"],
        });
      }
    }

    if (body.kind === "secrets") {
      // Treat each line as a "resource" for the count.
      resourcesScanned = body.content.split(/\r?\n/).length;
      const hits = scanSecrets(body.content);
      for (const h of hits) {
        findings.push({
          severity: h.rule.severity,
          category: "Secrets",
          title: `${h.rule.description} detected`,
          resource: `line ${h.line}`,
          description: `Gitleaks rule \`${h.rule.id}\` matched on line ${h.line}:\n\n  ${h.fullLine}\n\nMatched value: \`${h.match}\``,
          mitigation: "1) Treat this credential as compromised — rotate it immediately at the issuer.\n2) Remove from source / git history (use git-filter-repo or BFG).\n3) Move secrets to a managed secrets store and inject at runtime.\n4) Add a pre-commit hook (gitleaks/trufflehog) to prevent recurrence.",
          rule_id: `GITLEAKS_${h.rule.id.toUpperCase().replace(/-/g, "_")}`,
          compliance: ["SOC2 CC6.1", "ISO27001 A.9.4.3", "PCI 3.4"],
        });
      }
    }

    if (body.kind === "iac") {
      resourcesScanned = body.content.split(/\r?\n/).length;
      const iacKind = body.iacKind ?? "kubernetes";
      const hits = scanIac(iacKind, body.content);
      for (const h of hits) {
        findings.push({
          severity: h.severity,
          category: h.category,
          title: h.title,
          resource: h.resource,
          description: h.description,
          mitigation: h.mitigation,
          rule_id: h.rule_id,
          compliance: h.compliance,
        });
      }
    }

    if (findings.length) {
      const rows = findings.map(f => ({
        session_id: sessionId,
        scan_id: scan.id,
        asset_id: asset.id,
        asset_type: assetType,
        ...f,
      }));
      // Service role bypasses RLS but findings RLS only allows SELECT for sessions; insert is OK with service role.
      const { error: ferr } = await supabase.from("findings").insert(rows);
      if (ferr) throw new Error(ferr.message);
    }

    const counts = {
      critical: findings.filter(f => f.severity === "critical").length,
      high:     findings.filter(f => f.severity === "high").length,
      medium:   findings.filter(f => f.severity === "medium").length,
      low:      findings.filter(f => f.severity === "low").length,
      info:     findings.filter(f => f.severity === "info").length,
    };
    await supabase.from("scans").update({
      status: "completed", finished_at: new Date().toISOString(),
      total_findings: findings.length, resources_scanned: resourcesScanned,
      critical_count: counts.critical, high_count: counts.high,
      medium_count: counts.medium, low_count: counts.low, info_count: counts.info,
    }).eq("id", scan.id);

    await supabase.from("assets").update({ last_scan_at: new Date().toISOString() }).eq("id", asset.id);

    return json({ scanId: scan.id, findings: findings.length, resources: resourcesScanned });
  } catch (e) {
    console.error("scan-real:", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
