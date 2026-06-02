// Minimal AWS SigV4 signer for Deno (no external deps).
// Supports GET requests against AWS service endpoints.

async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const enc = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
}

async function deriveKey(secret: string, dateStamp: string, region: string, service: string): Promise<ArrayBuffer> {
  const kDate = await hmac(new TextEncoder().encode("AWS4" + secret), dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

export interface SigV4Opts {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service: string;
  host: string;
  path: string;            // e.g. "/" or "/2014-11-13/identity"
  queryParams?: Record<string, string>;
  method?: string;         // default GET
  body?: string;           // optional body
  extraHeaders?: Record<string, string>;
}

export async function signedFetch(opts: SigV4Opts): Promise<Response> {
  const method = opts.method ?? "GET";
  const body = opts.body ?? "";
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");  // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);

  const sortedQuery = Object.entries(opts.queryParams ?? {}).sort(([a], [b]) => a.localeCompare(b));
  const canonicalQuery = sortedQuery
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const payloadHash = await sha256Hex(body);

  const headers: Record<string, string> = {
    host: opts.host,
    "x-amz-date": amzDate,
    "x-amz-content-sha256": payloadHash,
    ...(opts.extraHeaders ?? {}),
  };

  const sortedHeaderKeys = Object.keys(headers).map(k => k.toLowerCase()).sort();
  const canonicalHeaders = sortedHeaderKeys
    .map(k => `${k}:${String(headers[k]).trim()}\n`)
    .join("");
  const signedHeaders = sortedHeaderKeys.join(";");

  const canonicalRequest = [
    method,
    opts.path,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${opts.region}/${opts.service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = await deriveKey(opts.secretAccessKey, dateStamp, opts.region, opts.service);
  const signature = [...new Uint8Array(await hmac(signingKey, stringToSign))]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");

  const authHeader = `AWS4-HMAC-SHA256 Credential=${opts.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const url = `https://${opts.host}${opts.path}${canonicalQuery ? `?${canonicalQuery}` : ""}`;
  return fetch(url, {
    method,
    headers: {
      ...headers,
      Authorization: authHeader,
    },
    body: method === "GET" ? undefined : body,
  });
}

// Tiny XML helpers (AWS responses are XML)
export function extractTags(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
}

export function firstTag(xml: string, tag: string): string | null {
  const m = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`).exec(xml);
  return m ? m[1] : null;
}
