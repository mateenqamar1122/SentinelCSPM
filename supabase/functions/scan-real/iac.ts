// Lightweight Checkov / kube-bench style rule engine.
// Parses YAML / JSON manifests and applies a curated set of public-rule checks.
// deno-lint-ignore-file no-explicit-any
import { parse as parseYaml, parseAll } from "https://deno.land/std@0.224.0/yaml/mod.ts";

export interface IacFinding {
  rule_id: string;
  severity: "critical" | "high" | "medium" | "low";
  category: string;     // "Kubernetes" | "Terraform" | "Dockerfile"
  title: string;
  resource: string;
  description: string;
  mitigation: string;
  compliance: string[];
}

function parseDocs(raw: string): any[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  // Try JSON first
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try { const j = JSON.parse(trimmed); return Array.isArray(j) ? j : [j]; } catch { /* fall through */ }
  }
  try {
    if (trimmed.includes("\n---")) return (parseAll(trimmed) as any[]).filter(Boolean);
    const one = parseYaml(trimmed);
    return Array.isArray(one) ? one : [one];
  } catch {
    return [];
  }
}

// ---------- Kubernetes manifest checks ----------
function checkK8sDoc(doc: any, out: IacFinding[]) {
  if (!doc || typeof doc !== "object") return;
  const kind = doc.kind as string | undefined;
  const name = `${kind ?? "Resource"}/${doc.metadata?.name ?? "unknown"}`;

  // Pod template extraction (Deployment, StatefulSet, DaemonSet, Job, etc.)
  const podSpec = doc.spec?.template?.spec ?? (kind === "Pod" ? doc.spec : undefined);
  if (podSpec) {
    const containers: any[] = [...(podSpec.containers ?? []), ...(podSpec.initContainers ?? [])];

    for (const c of containers) {
      const r = `${name} :: ${c.name ?? "container"}`;
      // CKV_K8S_8 — privileged
      if (c.securityContext?.privileged === true) out.push({
        rule_id: "CKV_K8S_16", severity: "critical", category: "Kubernetes",
        title: "Container running as privileged",
        resource: r,
        description: "A privileged container can perform almost everything the host can. A breakout grants root on the node.",
        mitigation: "Set `securityContext.privileged: false` and drop unneeded capabilities.",
        compliance: ["CIS K8s 5.2.1", "NIST SP 800-190"],
      });
      // CKV_K8S_20 — allowPrivilegeEscalation
      if (c.securityContext?.allowPrivilegeEscalation !== false) out.push({
        rule_id: "CKV_K8S_20", severity: "high", category: "Kubernetes",
        title: "allowPrivilegeEscalation not set to false",
        resource: r,
        description: "Without explicit denial, processes inside the container can gain more privileges than their parent.",
        mitigation: "Set `securityContext.allowPrivilegeEscalation: false`.",
        compliance: ["CIS K8s 5.2.5"],
      });
      // CKV_K8S_22 — readOnlyRootFilesystem
      if (c.securityContext?.readOnlyRootFilesystem !== true) out.push({
        rule_id: "CKV_K8S_22", severity: "medium", category: "Kubernetes",
        title: "Root filesystem is writable",
        resource: r,
        description: "A writable root filesystem lets attackers persist tools and modify binaries.",
        mitigation: "Set `securityContext.readOnlyRootFilesystem: true` and mount writable volumes only where required.",
        compliance: ["CIS K8s 5.2.12"],
      });
      // CKV_K8S_43 — image without digest / latest tag
      if (typeof c.image === "string" && (c.image.endsWith(":latest") || !c.image.includes(":"))) out.push({
        rule_id: "CKV_K8S_14", severity: "medium", category: "Kubernetes",
        title: "Image uses :latest or missing tag",
        resource: r + ` :: ${c.image}`,
        description: "Floating tags make deployments non-reproducible and can silently pull vulnerable images.",
        mitigation: "Pin to an explicit version + SHA digest, e.g. `app:1.2.3@sha256:…`.",
        compliance: ["CIS K8s 5.5.1"],
      });
      // CKV_K8S_11/13 — resource limits
      if (!c.resources?.limits?.cpu || !c.resources?.limits?.memory) out.push({
        rule_id: "CKV_K8S_11", severity: "low", category: "Kubernetes",
        title: "CPU/memory limits not set",
        resource: r,
        description: "Without resource limits, a single pod can starve the node and amplify DoS conditions.",
        mitigation: "Set `resources.limits.cpu` and `resources.limits.memory` for every container.",
        compliance: ["CIS K8s 5.7.4"],
      });
      // Liveness probe
      if (!c.livenessProbe) out.push({
        rule_id: "CKV_K8S_8", severity: "low", category: "Kubernetes",
        title: "Liveness probe missing",
        resource: r,
        description: "Without livenessProbe, hung containers won't be restarted.",
        mitigation: "Add an `httpGet` or `exec` livenessProbe with sensible thresholds.",
        compliance: ["CIS K8s 5.6.4"],
      });
    }

    // Host network / PID
    if (podSpec.hostNetwork) out.push({
      rule_id: "CKV_K8S_19", severity: "high", category: "Kubernetes",
      title: "Pod uses host network",
      resource: name,
      description: "hostNetwork bypasses pod network isolation and exposes node interfaces.",
      mitigation: "Remove `hostNetwork: true` unless absolutely required by a CNI / system pod.",
      compliance: ["CIS K8s 5.2.4"],
    });
    if (podSpec.hostPID) out.push({
      rule_id: "CKV_K8S_17", severity: "high", category: "Kubernetes",
      title: "Pod uses host PID namespace",
      resource: name,
      description: "hostPID lets the container see and signal host processes — strong escape vector.",
      mitigation: "Remove `hostPID: true`.",
      compliance: ["CIS K8s 5.2.2"],
    });
    if (podSpec.automountServiceAccountToken !== false) out.push({
      rule_id: "CKV_K8S_38", severity: "medium", category: "Kubernetes",
      title: "ServiceAccount token auto-mounted",
      resource: name,
      description: "By default the SA token is mounted; if the pod doesn't call the API, it's an unnecessary credential.",
      mitigation: "Set `automountServiceAccountToken: false` unless API access is required.",
      compliance: ["CIS K8s 5.1.6"],
    });
  }

  // ClusterRoleBinding to cluster-admin
  if (kind === "ClusterRoleBinding" && doc.roleRef?.name === "cluster-admin") out.push({
    rule_id: "K8S_CLUSTER_ADMIN_BIND", severity: "critical", category: "Kubernetes",
    title: "ClusterRoleBinding grants cluster-admin",
    resource: name,
    description: "Subjects of this binding can perform any action cluster-wide.",
    mitigation: "Replace with a least-privilege Role/RoleBinding scoped to the required namespace.",
    compliance: ["CIS K8s 5.1.1"],
  });

  // Plaintext-looking secret in ConfigMap
  if (kind === "ConfigMap" && doc.data) {
    for (const [k, v] of Object.entries<any>(doc.data)) {
      if (/secret|token|password|api[_-]?key/i.test(k)) out.push({
        rule_id: "K8S_PLAINTEXT_SECRET", severity: "high", category: "Kubernetes",
        title: `Possible secret in ConfigMap key '${k}'`,
        resource: name,
        description: "ConfigMaps are not encrypted at rest by default and are world-readable in the namespace via the API.",
        mitigation: "Move to a Secret resource and enable etcd encryption-at-rest, or use an external secrets manager.",
        compliance: ["SOC2 CC6.1", "HIPAA 164.312(a)(2)(iv)"],
      });
    }
  }

  // Service of type LoadBalancer with no source range
  if (kind === "Service" && doc.spec?.type === "LoadBalancer" && !doc.spec?.loadBalancerSourceRanges?.length) out.push({
    rule_id: "CKV_K8S_31", severity: "medium", category: "Kubernetes",
    title: "LoadBalancer Service has no source IP restriction",
    resource: name,
    description: "Without `loadBalancerSourceRanges`, the service is reachable from anywhere on the internet.",
    mitigation: "Restrict access via `loadBalancerSourceRanges` or front it with an allowlisted ingress controller.",
    compliance: ["CIS K8s 5.3.2"],
  });
}

// ---------- Terraform (HCL-ish, regex-based light pass) ----------
function checkTerraform(raw: string): IacFinding[] {
  const out: IacFinding[] = [];
  const blocks = raw.matchAll(/resource\s+"([^"]+)"\s+"([^"]+)"\s*\{([\s\S]*?)\n\}/g);
  for (const b of blocks) {
    const [_, type, name, body] = b;
    const r = `${type}.${name}`;

    if (type === "aws_s3_bucket" && /acl\s*=\s*"public-read(-write)?"/.test(body)) out.push({
      rule_id: "CKV_AWS_20", severity: "critical", category: "Terraform",
      title: "S3 bucket ACL is public",
      resource: r,
      description: "Public ACL on an S3 bucket exposes its contents to anyone on the internet.",
      mitigation: "Set `acl = \"private\"` and use bucket policies / Block Public Access.",
      compliance: ["CIS AWS 2.1.5", "SOC2 CC6.1"],
    });
    if (type === "aws_s3_bucket" && !/server_side_encryption|aws_s3_bucket_server_side_encryption_configuration/.test(body)) out.push({
      rule_id: "CKV_AWS_19", severity: "high", category: "Terraform",
      title: "S3 bucket has no server-side encryption configured",
      resource: r,
      description: "Buckets without SSE store objects in plaintext at rest.",
      mitigation: "Add an `aws_s3_bucket_server_side_encryption_configuration` resource (AES256 or aws:kms).",
      compliance: ["CIS AWS 2.1.1", "ISO27001 A.10.1.1"],
    });
    if (type === "aws_security_group" && /cidr_blocks\s*=\s*\[\s*"0\.0\.0\.0\/0"/.test(body)) out.push({
      rule_id: "CKV_AWS_24", severity: "high", category: "Terraform",
      title: "Security group allows 0.0.0.0/0",
      resource: r,
      description: "An ingress rule open to the world exposes the resource to the entire internet.",
      mitigation: "Restrict `cidr_blocks` to known address ranges or use a bastion / VPN.",
      compliance: ["CIS AWS 4.1"],
    });
    if (type === "aws_db_instance" && /publicly_accessible\s*=\s*true/.test(body)) out.push({
      rule_id: "CKV_AWS_17", severity: "critical", category: "Terraform",
      title: "RDS instance is publicly accessible",
      resource: r,
      description: "Public RDS instances are reachable from the internet — attractive bruteforce target.",
      mitigation: "Set `publicly_accessible = false` and place the instance in a private subnet.",
      compliance: ["CIS AWS 2.3.2"],
    });
    if (type === "azurerm_storage_account" && /allow_blob_public_access\s*=\s*true/.test(body)) out.push({
      rule_id: "CKV_AZURE_59", severity: "high", category: "Terraform",
      title: "Azure Storage account allows public blob access",
      resource: r,
      description: "Public blob access can lead to data exposure if any container is set to public.",
      mitigation: "Set `allow_blob_public_access = false`.",
      compliance: ["CIS Azure 3.7"],
    });
  }
  return out;
}

// ---------- Dockerfile checks ----------
function checkDockerfile(raw: string): IacFinding[] {
  const out: IacFinding[] = [];
  const lines = raw.split(/\r?\n/);
  let user: string | null = null;
  let usesLatest = false;
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("#") || !t) continue;
    if (/^FROM\s+\S+:latest\b/i.test(t) || /^FROM\s+[^:\s@]+\s*$/i.test(t)) usesLatest = true;
    if (/^USER\s+(\S+)/i.test(t)) user = t.split(/\s+/)[1];
    if (/^ENV\s+(\w+)\s*=?\s*(\S+)/i.test(t) && /(KEY|TOKEN|SECRET|PASSWORD)/i.test(t)) out.push({
      rule_id: "CKV_DOCKER_4", severity: "high", category: "Dockerfile",
      title: "Possible secret in ENV directive",
      resource: t.slice(0, 120),
      description: "ENV values persist in image history and are visible to anyone who pulls the image.",
      mitigation: "Inject secrets at runtime via Kubernetes Secret / docker run --env-file. Rotate the leaked value.",
      compliance: ["CIS Docker 4.10", "SOC2 CC6.1"],
    });
    if (/curl\s+[^|]+\|\s*(sh|bash)/i.test(t)) out.push({
      rule_id: "CKV_DOCKER_8", severity: "medium", category: "Dockerfile",
      title: "Dockerfile uses curl-pipe-shell pattern",
      resource: t.slice(0, 120),
      description: "Piping a remote script directly into a shell during image build is non-reproducible and hijackable.",
      mitigation: "Download with a pinned checksum, verify, then execute.",
      compliance: ["CIS Docker 4.7"],
    });
  }
  if (!user || user === "root" || user === "0") out.push({
    rule_id: "CKV_DOCKER_3", severity: "high", category: "Dockerfile",
    title: "Container runs as root",
    resource: "Dockerfile :: USER",
    description: "No non-root USER directive: a container escape grants root on the host.",
    mitigation: "Add `RUN adduser -D app && USER app` and set file ownership accordingly.",
    compliance: ["CIS Docker 4.1"],
  });
  if (usesLatest) out.push({
    rule_id: "CKV_DOCKER_2", severity: "medium", category: "Dockerfile",
    title: "Base image uses :latest or no tag",
    resource: "FROM …:latest",
    description: "Floating tags make builds non-reproducible.",
    mitigation: "Pin to an explicit version + SHA digest.",
    compliance: ["CIS Docker 4.7"],
  });
  return out;
}

export function scanIac(kind: "kubernetes" | "terraform" | "dockerfile", raw: string): IacFinding[] {
  if (kind === "dockerfile") return checkDockerfile(raw);
  if (kind === "terraform")  return checkTerraform(raw);
  const out: IacFinding[] = [];
  for (const doc of parseDocs(raw)) checkK8sDoc(doc, out);
  return out;
}
