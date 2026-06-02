// Demo scanner: produces a realistic mix of findings without touching any cloud.
import {
  corsHeaders, jsonResponse, adminClient, startScan, finishScan,
  loadConnection, FindingInput,
} from "../_shared/scanner-core.ts";

const DEMO_FINDINGS: FindingInput[] = [
  {
    severity: "critical",
    category: "Storage",
    title: "Public S3 bucket exposes sensitive data",
    resource: "s3://acme-customer-exports",
    region: "us-east-1",
    description: "The bucket has a public ACL granting READ to AllUsers. Objects are accessible to anyone on the internet without authentication.",
    mitigation: "1) Remove the public-read ACL.\n2) Enable S3 Block Public Access at the account level.\n3) Use pre-signed URLs for time-limited sharing instead of public access.",
    compliance: ["CIS 2.1.5", "PCI 1.2.1"],
    rule_id: "AWS_S3_PUBLIC_ACL",
  },
  {
    severity: "critical",
    category: "Network",
    title: "Security group allows SSH (22) from 0.0.0.0/0",
    resource: "sg-0a1b2c3d4e (web-tier)",
    region: "us-east-1",
    description: "An EC2 security group has an inbound rule opening port 22 to the entire internet, exposing SSH to brute-force attacks.",
    mitigation: "Restrict the source CIDR to your office or VPN range. Consider using AWS Systems Manager Session Manager to access instances without opening SSH at all.",
    compliance: ["CIS 5.2", "NIST AC-3"],
    rule_id: "AWS_EC2_SG_SSH_OPEN",
  },
  {
    severity: "high",
    category: "IAM",
    title: "IAM user has console password without MFA",
    resource: "iam:user/devops-bob",
    region: "global",
    description: "User has a console password but no MFA device attached. A leaked password is sufficient to take over the account.",
    mitigation: "Enforce MFA via IAM policy (aws:MultiFactorAuthPresent condition). Require all users with console access to enroll a hardware or virtual MFA device.",
    compliance: ["CIS 1.10"],
    rule_id: "AWS_IAM_NO_MFA",
  },
  {
    severity: "high",
    category: "Storage",
    title: "GCS bucket grants allUsers viewer role",
    resource: "gs://prod-backups-2024",
    region: "us-central1",
    description: "The bucket IAM policy includes the principal allUsers with role Storage Object Viewer, allowing anonymous downloads of backup contents.",
    mitigation: "Remove the allUsers binding. Enable Public Access Prevention on the bucket and at the organization policy level.",
    compliance: ["CIS GCP 5.1"],
    rule_id: "GCP_GCS_PUBLIC",
  },
  {
    severity: "high",
    category: "Network",
    title: "Azure NSG allows RDP (3389) from internet",
    resource: "nsg-prod-frontend / Allow-RDP-Any",
    region: "eastus",
    description: "Network Security Group rule allows TCP 3389 from source '*'. RDP brute-force is one of the most common ransomware entry vectors.",
    mitigation: "Limit source to your admin IP range or use Azure Bastion for browser-based RDP without exposing the port. Apply Just-In-Time VM access via Defender for Cloud.",
    compliance: ["CIS Azure 6.2"],
    rule_id: "AZURE_NSG_RDP_OPEN",
  },
  {
    severity: "high",
    category: "IAM",
    title: "GCP service account has Owner role",
    resource: "sa: [email protected]",
    region: "global",
    description: "Service account holds the primitive 'Owner' role on the project, granting it permission to do anything including deleting resources and modifying IAM.",
    mitigation: "Replace 'Owner' with the minimum set of predefined roles required (e.g., roles/storage.objectAdmin). Audit usage with Policy Analyzer first.",
    compliance: ["CIS GCP 1.5"],
    rule_id: "GCP_SA_OWNER_ROLE",
  },
  {
    severity: "medium",
    category: "Encryption",
    title: "S3 bucket has no default encryption",
    resource: "s3://internal-logs",
    region: "us-west-2",
    description: "Bucket has no default server-side encryption set. New objects could be written unencrypted depending on client configuration.",
    mitigation: "Enable default encryption with SSE-S3 or SSE-KMS. Add a bucket policy that denies PutObject without `x-amz-server-side-encryption` header.",
    compliance: ["CIS 2.1.1"],
    rule_id: "AWS_S3_NO_ENCRYPTION",
  },
  {
    severity: "medium",
    category: "Logging",
    title: "CloudTrail multi-region trail not enabled",
    resource: "account: 123456789012",
    region: "global",
    description: "No multi-region CloudTrail is configured. API activity in other regions is invisible to security monitoring.",
    mitigation: "Create a multi-region CloudTrail with log file validation and ship logs to a dedicated, MFA-delete-protected S3 bucket.",
    compliance: ["CIS 3.1"],
    rule_id: "AWS_CLOUDTRAIL_OFF",
  },
  {
    severity: "medium",
    category: "Database",
    title: "Cloud SQL instance has public IP enabled",
    resource: "sql:prod-postgres",
    region: "us-central1",
    description: "Cloud SQL instance is reachable on a public IP. Exposed databases are routinely scanned and attacked.",
    mitigation: "Disable public IP and use Private IP with the Cloud SQL Auth Proxy. Restrict authorized networks if public access is unavoidable.",
    compliance: ["CIS GCP 6.6"],
    rule_id: "GCP_CLOUDSQL_PUBLIC_IP",
  },
  {
    severity: "medium",
    category: "Encryption",
    title: "Azure Storage account allows HTTP traffic",
    resource: "storage: prodbackups",
    region: "westeurope",
    description: "Secure transfer required is disabled — clients can connect over plaintext HTTP, exposing data in transit.",
    mitigation: "Enable 'Secure transfer required' on the storage account. Update any client SDKs to use HTTPS endpoints.",
    compliance: ["CIS Azure 3.1"],
    rule_id: "AZURE_STORAGE_HTTP",
  },
  {
    severity: "low",
    category: "IAM",
    title: "Unused IAM access key older than 90 days",
    resource: "iam:user/legacy-svc / AKIA...XYZ",
    region: "global",
    description: "Access key has not been used in 92 days. Stale credentials increase the blast radius if leaked.",
    mitigation: "Disable the key and delete it after a grace period. Establish automated key rotation every 90 days.",
    compliance: ["CIS 1.14"],
    rule_id: "AWS_IAM_STALE_KEY",
  },
  {
    severity: "low",
    category: "Logging",
    title: "VPC flow logs not enabled",
    resource: "vpc-0aabbcc",
    region: "eu-west-1",
    description: "Flow logs are disabled, limiting your ability to investigate network-level incidents post-hoc.",
    mitigation: "Enable VPC Flow Logs to CloudWatch or S3 for all production VPCs and retain for at least 90 days.",
    compliance: ["CIS 3.9"],
    rule_id: "AWS_VPC_FLOW_LOGS_OFF",
  },
  {
    severity: "low",
    category: "Key Vault",
    title: "Key Vault soft-delete retention below 90 days",
    resource: "kv-prod-secrets",
    region: "eastus",
    description: "Key Vault soft-delete retention is set to 7 days. Accidentally deleted secrets cannot be recovered after that window.",
    mitigation: "Increase soft-delete retention to 90 days and enable Purge Protection to prevent permanent deletion within the retention window.",
    compliance: ["CIS Azure 8.5"],
    rule_id: "AZURE_KV_RETENTION",
  },
  {
    severity: "info",
    category: "Best Practice",
    title: "Account is missing a billing alarm",
    resource: "account: 123456789012",
    region: "global",
    description: "No billing alarm is configured. Unexpected resource consumption (often a compromise indicator) can go unnoticed.",
    mitigation: "Create a CloudWatch billing alarm at a sensible threshold and route notifications to a monitored channel.",
    compliance: ["CIS 4.13"],
    rule_id: "AWS_NO_BILLING_ALARM",
  },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const sessionId = req.headers.get("x-session-id") ?? "";
    if (!sessionId) return jsonResponse({ error: "Missing x-session-id" }, 400);
    const { connectionId } = await req.json();
    if (!connectionId) return jsonResponse({ error: "connectionId required" }, 400);

    const supabase = adminClient();
    await loadConnection(supabase, connectionId, sessionId, "demo");
    const scanId = await startScan(supabase, connectionId, sessionId);

    // Simulate latency
    await new Promise(r => setTimeout(r, 800));

    await finishScan(supabase, scanId, connectionId, DEMO_FINDINGS, 47);
    return jsonResponse({ scanId, findings: DEMO_FINDINGS.length });
  } catch (e) {
    console.error("scan-demo error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: msg }, 500);
  }
});
