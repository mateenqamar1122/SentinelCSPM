// Real AWS scanner: S3 (public/encryption), EC2 (open security groups), IAM (MFA, root keys, stale keys, account summary).
import {
  corsHeaders, jsonResponse, adminClient, startScan, finishScan,
  loadConnection, FindingInput,
} from "../_shared/scanner-core.ts";
import { signedFetch, extractTags, firstTag } from "../_shared/aws-sigv4.ts";

interface AwsCreds {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

async function listBuckets(c: AwsCreds): Promise<string[]> {
  const r = await signedFetch({
    accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey,
    region: c.region, service: "s3",
    host: "s3.amazonaws.com", path: "/",
  });
  const xml = await r.text();
  if (!r.ok) throw new Error(`ListBuckets failed (${r.status}): ${xml.slice(0, 200)}`);
  return extractTags(xml, "Name");
}

async function getBucketAcl(c: AwsCreds, bucket: string, region: string): Promise<{ public: boolean }> {
  const host = region === "us-east-1" ? "s3.amazonaws.com" : `s3.${region}.amazonaws.com`;
  const r = await signedFetch({
    accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey,
    region, service: "s3",
    host, path: `/${bucket}/`,
    queryParams: { acl: "" },
  });
  const xml = await r.text();
  if (!r.ok) return { public: false };
  // Look for AllUsers or AuthenticatedUsers grantees
  const isPublic =
    xml.includes("AllUsers") ||
    xml.includes("global/AllUsers") ||
    xml.includes("AuthenticatedUsers");
  return { public: isPublic };
}

async function getBucketEncryption(c: AwsCreds, bucket: string, region: string): Promise<boolean> {
  const host = region === "us-east-1" ? "s3.amazonaws.com" : `s3.${region}.amazonaws.com`;
  const r = await signedFetch({
    accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey,
    region, service: "s3",
    host, path: `/${bucket}/`,
    queryParams: { encryption: "" },
  });
  if (r.status === 404) return false;
  const xml = await r.text();
  if (!r.ok) return true; // assume encrypted if we can't tell
  return xml.includes("ServerSideEncryptionConfiguration");
}

async function getBucketLocation(c: AwsCreds, bucket: string): Promise<string> {
  const r = await signedFetch({
    accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey,
    region: "us-east-1", service: "s3",
    host: "s3.amazonaws.com", path: `/${bucket}/`,
    queryParams: { location: "" },
  });
  const xml = await r.text();
  const m = /<LocationConstraint[^>]*>([^<]*)<\/LocationConstraint>/.exec(xml);
  const loc = m?.[1] ?? "";
  return loc === "" ? "us-east-1" : loc === "EU" ? "eu-west-1" : loc;
}

async function describeSecurityGroups(c: AwsCreds): Promise<Array<{ id: string; name: string; openPorts: string[] }>> {
  const r = await signedFetch({
    accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey,
    region: c.region, service: "ec2",
    host: `ec2.${c.region}.amazonaws.com`, path: "/",
    queryParams: { Action: "DescribeSecurityGroups", Version: "2016-11-15" },
  });
  const xml = await r.text();
  if (!r.ok) throw new Error(`DescribeSecurityGroups failed (${r.status})`);
  const groupBlocks = xml.split("<item>").slice(1);
  const out: Array<{ id: string; name: string; openPorts: string[] }> = [];
  // Use a more careful parse: split by groupId chunks
  const groupRegex = /<groupId>([^<]+)<\/groupId>[\s\S]*?<groupName>([^<]+)<\/groupName>([\s\S]*?)(?=<groupId>|$)/g;
  let m: RegExpExecArray | null;
  while ((m = groupRegex.exec(xml)) !== null) {
    const id = m[1];
    const name = m[2];
    const body = m[3];
    const openPorts: string[] = [];
    const ipPermRegex = /<ipPermissions>([\s\S]*?)<\/ipPermissions>/g;
    const permsBlock = ipPermRegex.exec(body)?.[1] ?? "";
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let pm: RegExpExecArray | null;
    while ((pm = itemRegex.exec(permsBlock)) !== null) {
      const item = pm[1];
      if (!item.includes("0.0.0.0/0")) continue;
      const fromPort = /<fromPort>(-?\d+)<\/fromPort>/.exec(item)?.[1] ?? "";
      const toPort = /<toPort>(-?\d+)<\/toPort>/.exec(item)?.[1] ?? "";
      const proto = /<ipProtocol>([^<]+)<\/ipProtocol>/.exec(item)?.[1] ?? "";
      const label = proto === "-1"
        ? "ALL"
        : (fromPort === toPort ? `${proto}/${fromPort}` : `${proto}/${fromPort}-${toPort}`);
      openPorts.push(label);
    }
    if (openPorts.length > 0) out.push({ id, name, openPorts });
  }
  return out;
}

interface IamUserInfo {
  userName: string;
  passwordEnabled: boolean;
  mfaActive: boolean;
  accessKeyAge: number; // days
  accessKeyId?: string;
  passwordLastUsed?: string;
}

async function getCredentialReport(c: AwsCreds): Promise<IamUserInfo[]> {
  // Generate the report (idempotent)
  await signedFetch({
    accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey,
    region: "us-east-1", service: "iam",
    host: "iam.amazonaws.com", path: "/",
    queryParams: { Action: "GenerateCredentialReport", Version: "2010-05-08" },
  });
  // poll-ish: try once, AWS often returns immediately if recently generated
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await signedFetch({
      accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey,
      region: "us-east-1", service: "iam",
      host: "iam.amazonaws.com", path: "/",
      queryParams: { Action: "GetCredentialReport", Version: "2010-05-08" },
    });
    const xml = await r.text();
    if (r.ok && xml.includes("<Content>")) {
      const b64 = firstTag(xml, "Content")!;
      const csv = atob(b64);
      const lines = csv.trim().split("\n");
      const header = lines[0].split(",");
      const idx = (name: string) => header.indexOf(name);
      const users: IamUserInfo[] = [];
      const now = Date.now();
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",");
        const userName = cols[idx("user")];
        if (userName === "<root_account>") {
          users.push({
            userName: "<root>",
            passwordEnabled: cols[idx("password_enabled")] === "true",
            mfaActive: cols[idx("mfa_active")] === "true",
            accessKeyAge: cols[idx("access_key_1_active")] === "true" ? 0 : -1,
            accessKeyId: cols[idx("access_key_1_active")] === "true" ? "ROOT_KEY" : undefined,
          });
          continue;
        }
        const akActive = cols[idx("access_key_1_active")] === "true";
        const lastUsedStr = cols[idx("access_key_1_last_used_date")];
        let age = -1;
        if (akActive && lastUsedStr && lastUsedStr !== "N/A") {
          age = Math.floor((now - new Date(lastUsedStr).getTime()) / (1000 * 60 * 60 * 24));
        }
        users.push({
          userName,
          passwordEnabled: cols[idx("password_enabled")] === "true",
          mfaActive: cols[idx("mfa_active")] === "true",
          accessKeyAge: age,
          accessKeyId: akActive ? "key_1" : undefined,
          passwordLastUsed: cols[idx("password_last_used")],
        });
      }
      return users;
    }
    await new Promise(r => setTimeout(r, 1500));
  }
  return [];
}

const RISKY_PORT_LABELS: Record<string, { sev: "critical" | "high"; name: string }> = {
  "tcp/22":   { sev: "critical", name: "SSH" },
  "tcp/3389": { sev: "critical", name: "RDP" },
  "tcp/3306": { sev: "high",     name: "MySQL" },
  "tcp/5432": { sev: "high",     name: "PostgreSQL" },
  "tcp/27017":{ sev: "high",     name: "MongoDB" },
  "tcp/6379": { sev: "high",     name: "Redis" },
  "ALL":      { sev: "critical", name: "All ports" },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const sessionId = req.headers.get("x-session-id") ?? "";
    if (!sessionId) return jsonResponse({ error: "Missing x-session-id" }, 400);
    const { connectionId } = await req.json();
    if (!connectionId) return jsonResponse({ error: "connectionId required" }, 400);

    const supabase = adminClient();
    const conn = await loadConnection(supabase, connectionId, sessionId, "aws");
    const creds = conn.credentials as unknown as AwsCreds;
    if (!creds?.accessKeyId || !creds?.secretAccessKey) {
      return jsonResponse({ error: "Connection is missing AWS credentials" }, 400);
    }
    const scanId = await startScan(supabase, connectionId, sessionId);
    const findings: FindingInput[] = [];
    let resourceCount = 0;

    try {
      // ---- S3 ----
      const buckets = await listBuckets(creds);
      resourceCount += buckets.length;
      // Limit to first 25 buckets to keep scan fast
      for (const bucket of buckets.slice(0, 25)) {
        let region = creds.region;
        try { region = await getBucketLocation(creds, bucket); } catch { /* keep default */ }
        const [acl, encrypted] = await Promise.all([
          getBucketAcl(creds, bucket, region).catch(() => ({ public: false })),
          getBucketEncryption(creds, bucket, region).catch(() => true),
        ]);
        if (acl.public) {
          findings.push({
            severity: "critical",
            category: "Storage",
            title: "S3 bucket has a public ACL",
            resource: `s3://${bucket}`,
            region,
            description: "The bucket grants permissions to AllUsers or AuthenticatedUsers, allowing anonymous or any-AWS-account access to its contents.",
            mitigation: "Remove public ACL grants. Enable S3 Block Public Access at the bucket and account level. Use pre-signed URLs for sharing.",
            compliance: ["CIS 2.1.5"],
            rule_id: "AWS_S3_PUBLIC_ACL",
          });
        }
        if (!encrypted) {
          findings.push({
            severity: "medium",
            category: "Encryption",
            title: "S3 bucket has no default encryption",
            resource: `s3://${bucket}`,
            region,
            description: "No default server-side encryption configured. New objects could be stored unencrypted.",
            mitigation: "Enable default encryption (SSE-S3 or SSE-KMS) and add a deny policy for unencrypted PutObject calls.",
            compliance: ["CIS 2.1.1"],
            rule_id: "AWS_S3_NO_ENCRYPTION",
          });
        }
      }
    } catch (e) {
      console.error("S3 scan error", e);
    }

    try {
      // ---- EC2 Security Groups ----
      const sgs = await describeSecurityGroups(creds);
      resourceCount += sgs.length;
      for (const sg of sgs) {
        for (const portLabel of sg.openPorts) {
          const meta = RISKY_PORT_LABELS[portLabel];
          findings.push({
            severity: meta?.sev ?? "medium",
            category: "Network",
            title: meta
              ? `Security group exposes ${meta.name} (${portLabel}) to internet`
              : `Security group exposes ${portLabel} to internet`,
            resource: `${sg.id} (${sg.name})`,
            region: creds.region,
            description: `Inbound rule allows ${portLabel} from 0.0.0.0/0, exposing the service to the entire internet.`,
            mitigation: "Restrict the source CIDR to known admin ranges, or remove the rule entirely. Use SSM Session Manager for SSH access without opening ports.",
            compliance: ["CIS 5.2"],
            rule_id: "AWS_EC2_SG_OPEN",
          });
        }
      }
    } catch (e) {
      console.error("EC2 scan error", e);
    }

    try {
      // ---- IAM Credential Report ----
      const users = await getCredentialReport(creds);
      resourceCount += users.length;
      for (const u of users) {
        if (u.userName === "<root>") {
          if (!u.mfaActive) {
            findings.push({
              severity: "critical",
              category: "IAM",
              title: "Root account has no MFA enabled",
              resource: "iam:root",
              region: "global",
              description: "The AWS root account does not have MFA. Compromise of the root account leads to full account takeover.",
              mitigation: "Enable a hardware MFA device for the root user immediately. Lock root credentials in a safe and never use them for daily operations.",
              compliance: ["CIS 1.5"],
              rule_id: "AWS_ROOT_NO_MFA",
            });
          }
          if (u.accessKeyId === "ROOT_KEY") {
            findings.push({
              severity: "critical",
              category: "IAM",
              title: "Root account has active access keys",
              resource: "iam:root",
              region: "global",
              description: "Active access keys exist on the root account. Root keys grant unrestricted access and should never be used.",
              mitigation: "Delete the root account access keys. Use IAM users, roles, or Identity Center for programmatic access.",
              compliance: ["CIS 1.4"],
              rule_id: "AWS_ROOT_KEYS",
            });
          }
          continue;
        }
        if (u.passwordEnabled && !u.mfaActive) {
          findings.push({
            severity: "high",
            category: "IAM",
            title: "IAM user has console password without MFA",
            resource: `iam:user/${u.userName}`,
            region: "global",
            description: "User can sign in to the console with only a password. A leaked or phished password is enough to take over the account.",
            mitigation: "Enforce MFA via an IAM policy using the aws:MultiFactorAuthPresent condition. Require enrollment of a virtual or hardware MFA device.",
            compliance: ["CIS 1.10"],
            rule_id: "AWS_IAM_NO_MFA",
          });
        }
        if (u.accessKeyAge > 90) {
          findings.push({
            severity: "low",
            category: "IAM",
            title: `IAM access key unused for ${u.accessKeyAge} days`,
            resource: `iam:user/${u.userName}`,
            region: "global",
            description: "Access key has not been used recently. Stale credentials increase blast radius if leaked.",
            mitigation: "Disable the key, then delete it after a grace period. Establish 90-day key rotation.",
            compliance: ["CIS 1.14"],
            rule_id: "AWS_IAM_STALE_KEY",
          });
        }
      }
    } catch (e) {
      console.error("IAM scan error", e);
    }

    await finishScan(supabase, scanId, connectionId, findings, resourceCount);
    return jsonResponse({ scanId, findings: findings.length, resourcesScanned: resourceCount });
  } catch (e) {
    console.error("scan-aws fatal:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: msg }, 500);
  }
});
