export const DEMO_ALERTS = [
  {
    title: "Brute-force login burst on prod-bastion",
    severity: "high",
    source: "splunk",
    raw: {
      rule: "auth_failed_threshold",
      host: "prod-bastion-01",
      user: "root",
      src_ip: "185.220.101.42",
      attempts: 412,
      window_seconds: 300,
    },
  },
  {
    title: "Suspicious PowerShell encoded command on FIN-LAPTOP-22",
    severity: "critical",
    source: "sentinel",
    raw: {
      rule: "ps_encoded_cmd",
      host: "FIN-LAPTOP-22",
      user: "j.doe@acme.com",
      process: "powershell.exe -enc JABjAD0AKAAuAC4A...",
      parent: "winword.exe",
    },
  },
  {
    title: "DNS exfiltration pattern to *.duck-tunnel.net",
    severity: "high",
    source: "elastic",
    raw: {
      rule: "dns_high_entropy_subdomain",
      host: "ENG-LAPTOP-08",
      domain: "a8b3f.duck-tunnel.net",
      query_count: 1840,
      avg_len: 58,
    },
  },
  {
    title: "Impossible travel for s.kim@acme.com (Tokyo → Berlin in 14m)",
    severity: "medium",
    source: "chronicle",
    raw: {
      rule: "impossible_travel",
      user: "s.kim@acme.com",
      city_a: "Tokyo",
      city_b: "Berlin",
      delta_minutes: 14,
    },
  },
  {
    title: "S3 bucket policy changed to public-read on customer-exports",
    severity: "critical",
    source: "datadog",
    raw: {
      rule: "s3_public_acl",
      bucket: "customer-exports",
      actor: "ci-deploy-role",
      change: "Principal '*' allowed s3:GetObject",
    },
  },
  {
    title: "Outbound traffic spike to known C2 (qradar:flow)",
    severity: "high",
    source: "qradar",
    raw: {
      rule: "c2_match_threatfeed",
      host: "DB-PROD-04",
      dst_ip: "45.9.148.99",
      bytes_out: 1.2e9,
      feed: "threatfox",
    },
  },
];
