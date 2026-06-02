// Real Azure scanner: Storage account secure transfer + public blob access, NSG rules open to internet.
import {
  corsHeaders, jsonResponse, adminClient, startScan, finishScan,
  loadConnection, FindingInput,
} from "../_shared/scanner-core.ts";

interface AzureCreds {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  subscriptionId: string;
}

async function getToken(c: AzureCreds): Promise<string> {
  const r = await fetch(`https://login.microsoftonline.com/${c.tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: c.clientId,
      client_secret: c.clientSecret,
      scope: "https://management.azure.com/.default",
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`Azure token error: ${JSON.stringify(j).slice(0, 300)}`);
  return j.access_token as string;
}

async function azFetch<T>(url: string, token: string): Promise<T> {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const text = await r.text();
  if (!r.ok) throw new Error(`Azure ${r.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

const RISKY_AZ_PORTS: Record<string, { sev: "critical" | "high"; name: string }> = {
  "22":   { sev: "critical", name: "SSH" },
  "3389": { sev: "critical", name: "RDP" },
  "3306": { sev: "high",     name: "MySQL" },
  "5432": { sev: "high",     name: "PostgreSQL" },
  "1433": { sev: "high",     name: "MSSQL" },
  "27017":{ sev: "high",     name: "MongoDB" },
  "*":    { sev: "critical", name: "All ports" },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const sessionId = req.headers.get("x-session-id") ?? "";
    if (!sessionId) return jsonResponse({ error: "Missing x-session-id" }, 400);
    const { connectionId } = await req.json();
    if (!connectionId) return jsonResponse({ error: "connectionId required" }, 400);

    const supabase = adminClient();
    const conn = await loadConnection(supabase, connectionId, sessionId, "azure");
    const c = conn.credentials as unknown as AzureCreds;
    if (!c?.tenantId || !c?.clientId || !c?.clientSecret || !c?.subscriptionId) {
      return jsonResponse({ error: "Connection is missing Azure credentials" }, 400);
    }
    const scanId = await startScan(supabase, connectionId, sessionId);
    const findings: FindingInput[] = [];
    let resourceCount = 0;

    const token = await getToken(c);
    const sub = c.subscriptionId;

    // ---- Storage accounts ----
    try {
      const storage = await azFetch<{ value: Array<{ name: string; location: string; properties: { supportsHttpsTrafficOnly?: boolean; allowBlobPublicAccess?: boolean; minimumTlsVersion?: string } }> }>(
        `https://management.azure.com/subscriptions/${sub}/providers/Microsoft.Storage/storageAccounts?api-version=2023-01-01`,
        token,
      );
      resourceCount += storage.value.length;
      for (const sa of storage.value) {
        if (sa.properties.supportsHttpsTrafficOnly === false) {
          findings.push({
            severity: "medium",
            category: "Encryption",
            title: "Azure Storage account allows HTTP traffic",
            resource: `storage:${sa.name}`,
            region: sa.location,
            description: "Secure transfer is disabled — clients can connect over plaintext HTTP, exposing data in transit.",
            mitigation: "Enable 'Secure transfer required' on the storage account. Update SDK clients to use HTTPS endpoints.",
            compliance: ["CIS Azure 3.1"],
            rule_id: "AZURE_STORAGE_HTTP",
          });
        }
        if (sa.properties.allowBlobPublicAccess === true) {
          findings.push({
            severity: "high",
            category: "Storage",
            title: "Storage account allows public blob access",
            resource: `storage:${sa.name}`,
            region: sa.location,
            description: "Blob public access is permitted at the account level — individual containers can be configured for anonymous access.",
            mitigation: "Set 'allowBlobPublicAccess' to false on the account, and audit existing containers for public access levels.",
            compliance: ["CIS Azure 3.7"],
            rule_id: "AZURE_STORAGE_PUBLIC_BLOB",
          });
        }
        if (sa.properties.minimumTlsVersion && sa.properties.minimumTlsVersion !== "TLS1_2") {
          findings.push({
            severity: "low",
            category: "Encryption",
            title: "Storage account allows TLS below 1.2",
            resource: `storage:${sa.name}`,
            region: sa.location,
            description: `Minimum TLS version is set to ${sa.properties.minimumTlsVersion}, allowing weak protocols.`,
            mitigation: "Set 'minimumTlsVersion' to TLS1_2.",
            compliance: ["CIS Azure 3.15"],
            rule_id: "AZURE_STORAGE_OLD_TLS",
          });
        }
      }
    } catch (e) { console.error("Storage scan error", e); }

    // ---- Network Security Groups ----
    try {
      const nsgs = await azFetch<{ value: Array<{ name: string; location: string; properties: { securityRules: Array<{ name: string; properties: { access: string; direction: string; protocol: string; sourceAddressPrefix?: string; sourceAddressPrefixes?: string[]; destinationPortRange?: string; destinationPortRanges?: string[] } }> } }> }>(
        `https://management.azure.com/subscriptions/${sub}/providers/Microsoft.Network/networkSecurityGroups?api-version=2023-09-01`,
        token,
      );
      resourceCount += nsgs.value.length;
      for (const nsg of nsgs.value) {
        for (const rule of nsg.properties.securityRules ?? []) {
          if (rule.properties.direction !== "Inbound") continue;
          if (rule.properties.access !== "Allow") continue;
          const sources = [rule.properties.sourceAddressPrefix, ...(rule.properties.sourceAddressPrefixes ?? [])].filter(Boolean) as string[];
          const openToInternet = sources.some(s => s === "*" || s === "0.0.0.0/0" || s === "Internet" || s === "Any");
          if (!openToInternet) continue;
          const ports = [rule.properties.destinationPortRange, ...(rule.properties.destinationPortRanges ?? [])].filter(Boolean) as string[];
          for (const port of ports) {
            const meta = RISKY_AZ_PORTS[port];
            findings.push({
              severity: meta?.sev ?? "medium",
              category: "Network",
              title: meta
                ? `NSG rule exposes ${meta.name} (${port}) to internet`
                : `NSG rule exposes port ${port} to internet`,
              resource: `${nsg.name}/${rule.name}`,
              region: nsg.location,
              description: `Security rule allows ${rule.properties.protocol}/${port} from ${sources.join(", ")}.`,
              mitigation: "Tighten the source to specific IP ranges or service tags. Use Azure Bastion for SSH/RDP without exposing ports.",
              compliance: ["CIS Azure 6.2"],
              rule_id: "AZURE_NSG_OPEN",
            });
          }
        }
      }
    } catch (e) { console.error("NSG scan error", e); }

    // ---- SQL Servers public access ----
    try {
      const sqlServers = await azFetch<{ value: Array<{ name: string; location: string; properties: { publicNetworkAccess?: string } }> }>(
        `https://management.azure.com/subscriptions/${sub}/providers/Microsoft.Sql/servers?api-version=2022-05-01-preview`,
        token,
      );
      resourceCount += sqlServers.value.length;
      for (const srv of sqlServers.value) {
        if (srv.properties.publicNetworkAccess === "Enabled") {
          findings.push({
            severity: "high",
            category: "Database",
            title: "SQL Server public network access enabled",
            resource: `sql:${srv.name}`,
            region: srv.location,
            description: "The Azure SQL logical server accepts connections from public networks.",
            mitigation: "Set publicNetworkAccess to 'Disabled' and use Private Endpoints. If public access is required, lock down firewall rules to specific IPs.",
            compliance: ["CIS Azure 4.1"],
            rule_id: "AZURE_SQL_PUBLIC",
          });
        }
      }
    } catch (e) { console.error("SQL scan error", e); }

    await finishScan(supabase, scanId, connectionId, findings, resourceCount);
    return jsonResponse({ scanId, findings: findings.length, resourcesScanned: resourceCount });
  } catch (e) {
    console.error("scan-azure fatal:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: msg }, 500);
  }
});
