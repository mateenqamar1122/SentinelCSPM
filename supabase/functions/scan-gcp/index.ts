// Real GCP scanner: GCS bucket public access, Compute firewall rules open to internet,
// IAM service accounts with primitive Owner/Editor roles, Cloud SQL public IP.
import {
  corsHeaders, jsonResponse, adminClient, startScan, finishScan,
  loadConnection, FindingInput,
} from "../_shared/scanner-core.ts";

interface SaJson {
  client_email: string;
  private_key: string;
  token_uri: string;
  project_id: string;
}

// ---- JWT signer for Google service account ----
function pemToBytes(pem: string): Uint8Array {
  const b64 = pem.replace(/-----BEGIN [^-]+-----|-----END [^-]+-----|\s+/g, "");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function b64url(s: string | Uint8Array): string {
  const bin = typeof s === "string" ? s : String.fromCharCode(...s);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getAccessToken(sa: SaJson, scope: string): Promise<string> {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const claim = b64url(JSON.stringify({
    iss: sa.client_email,
    scope,
    aud: sa.token_uri,
    exp: now + 3600,
    iat: now,
  }));
  const data = `${header}.${claim}`;
  const key = await crypto.subtle.importKey(
    "pkcs8", pemToBytes(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(data));
  const jwt = `${data}.${b64url(new Uint8Array(sig))}`;
  const r = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`Token error: ${JSON.stringify(j).slice(0, 300)}`);
  return j.access_token as string;
}

async function gcpFetch<T>(url: string, token: string): Promise<T> {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const text = await r.text();
  if (!r.ok) throw new Error(`GCP ${r.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const sessionId = req.headers.get("x-session-id") ?? "";
    if (!sessionId) return jsonResponse({ error: "Missing x-session-id" }, 400);
    const { connectionId } = await req.json();
    if (!connectionId) return jsonResponse({ error: "connectionId required" }, 400);

    const supabase = adminClient();
    const conn = await loadConnection(supabase, connectionId, sessionId, "gcp");
    const credsAny = conn.credentials as { serviceAccountJson?: string };
    if (!credsAny?.serviceAccountJson) {
      return jsonResponse({ error: "Connection is missing GCP service account JSON" }, 400);
    }
    let sa: SaJson;
    try { sa = JSON.parse(credsAny.serviceAccountJson); }
    catch { return jsonResponse({ error: "Invalid GCP service account JSON" }, 400); }

    const scanId = await startScan(supabase, connectionId, sessionId);
    const findings: FindingInput[] = [];
    let resourceCount = 0;

    const token = await getAccessToken(sa, "https://www.googleapis.com/auth/cloud-platform.read-only");
    const project = sa.project_id;

    // ---- Storage (GCS) public buckets ----
    try {
      const buckets = await gcpFetch<{ items?: Array<{ name: string; location: string }> }>(
        `https://storage.googleapis.com/storage/v1/b?project=${encodeURIComponent(project)}&maxResults=50`,
        token,
      );
      resourceCount += buckets.items?.length ?? 0;
      for (const b of buckets.items ?? []) {
        try {
          const iam = await gcpFetch<{ bindings?: Array<{ role: string; members: string[] }> }>(
            `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(b.name)}/iam`,
            token,
          );
          const isPublic = (iam.bindings ?? []).some(bnd =>
            bnd.members.some(m => m === "allUsers" || m === "allAuthenticatedUsers"));
          if (isPublic) {
            findings.push({
              severity: "high",
              category: "Storage",
              title: "GCS bucket grants public access",
              resource: `gs://${b.name}`,
              region: b.location,
              description: "Bucket IAM policy includes allUsers or allAuthenticatedUsers, exposing objects publicly.",
              mitigation: "Remove public bindings. Enable Public Access Prevention on the bucket and at the org policy level.",
              compliance: ["CIS GCP 5.1"],
              rule_id: "GCP_GCS_PUBLIC",
            });
          }
        } catch (e) { console.error("bucket iam error", b.name, e); }
      }
    } catch (e) { console.error("GCS scan error", e); }

    // ---- Compute firewall rules open to internet ----
    try {
      const fw = await gcpFetch<{ items?: Array<{ name: string; sourceRanges?: string[]; allowed?: Array<{ IPProtocol: string; ports?: string[] }>; direction: string; disabled: boolean }> }>(
        `https://compute.googleapis.com/compute/v1/projects/${project}/global/firewalls`,
        token,
      );
      resourceCount += fw.items?.length ?? 0;
      for (const rule of fw.items ?? []) {
        if (rule.disabled) continue;
        if (rule.direction !== "INGRESS") continue;
        if (!(rule.sourceRanges ?? []).includes("0.0.0.0/0")) continue;
        for (const allow of rule.allowed ?? []) {
          const ports = allow.ports?.join(",") ?? "all";
          const isSshRdp = allow.ports?.some(p => p === "22" || p === "3389") || allow.IPProtocol === "all";
          findings.push({
            severity: isSshRdp ? "critical" : "high",
            category: "Network",
            title: `Firewall rule '${rule.name}' open to internet (${allow.IPProtocol}/${ports})`,
            resource: `firewall: ${rule.name}`,
            region: "global",
            description: `Ingress rule allows ${allow.IPProtocol}/${ports} from 0.0.0.0/0.`,
            mitigation: "Restrict source ranges to specific known networks. Use IAP TCP forwarding for SSH/RDP instead of opening ports to the internet.",
            compliance: ["CIS GCP 3.6"],
            rule_id: "GCP_FW_OPEN",
          });
        }
      }
    } catch (e) { console.error("Firewall scan error", e); }

    // ---- IAM primitive owner/editor on service accounts ----
    try {
      const policy = await fetch(
        `https://cloudresourcemanager.googleapis.com/v1/projects/${project}:getIamPolicy`,
        { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: "{}" },
      );
      const pol = await policy.json() as { bindings?: Array<{ role: string; members: string[] }> };
      for (const b of pol.bindings ?? []) {
        if (b.role !== "roles/owner" && b.role !== "roles/editor") continue;
        for (const m of b.members) {
          if (m.startsWith("serviceAccount:")) {
            findings.push({
              severity: "high",
              category: "IAM",
              title: `Service account has primitive ${b.role.split("/")[1]} role`,
              resource: m,
              region: "global",
              description: "Primitive Owner/Editor roles grant excessive permissions across the project.",
              mitigation: "Replace with the minimum predefined roles required (e.g., roles/storage.objectViewer). Audit usage with Policy Analyzer first.",
              compliance: ["CIS GCP 1.5"],
              rule_id: "GCP_SA_PRIMITIVE_ROLE",
            });
            resourceCount += 1;
          }
        }
      }
    } catch (e) { console.error("IAM policy scan error", e); }

    // ---- Cloud SQL public IP ----
    try {
      const sql = await gcpFetch<{ items?: Array<{ name: string; settings?: { ipConfiguration?: { ipv4Enabled?: boolean; authorizedNetworks?: Array<{ value: string }> } }; region: string }> }>(
        `https://sqladmin.googleapis.com/v1/projects/${project}/instances`,
        token,
      );
      resourceCount += sql.items?.length ?? 0;
      for (const inst of sql.items ?? []) {
        const ipv4 = inst.settings?.ipConfiguration?.ipv4Enabled;
        const authNets = inst.settings?.ipConfiguration?.authorizedNetworks ?? [];
        const openToWorld = authNets.some(n => n.value === "0.0.0.0/0");
        if (ipv4) {
          findings.push({
            severity: openToWorld ? "critical" : "medium",
            category: "Database",
            title: openToWorld
              ? "Cloud SQL public IP open to 0.0.0.0/0"
              : "Cloud SQL instance has public IP enabled",
            resource: `sql:${inst.name}`,
            region: inst.region,
            description: openToWorld
              ? "The instance accepts connections from any IP on the internet."
              : "The instance is reachable on a public IP, expanding its attack surface.",
            mitigation: "Disable the public IP and use Private IP with the Cloud SQL Auth Proxy. If public IP is required, restrict authorized networks tightly.",
            compliance: ["CIS GCP 6.6"],
            rule_id: "GCP_CLOUDSQL_PUBLIC",
          });
        }
      }
    } catch (e) { console.error("Cloud SQL scan error", e); }

    await finishScan(supabase, scanId, connectionId, findings, resourceCount);
    return jsonResponse({ scanId, findings: findings.length, resourcesScanned: resourceCount });
  } catch (e) {
    console.error("scan-gcp fatal:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: msg }, 500);
  }
});
