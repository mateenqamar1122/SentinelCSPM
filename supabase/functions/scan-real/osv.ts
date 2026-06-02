// Real CVE lookups via OSV.dev (https://osv.dev) — free, no key.
// Same vulnerability database used by Trivy, Google's OSS-Fuzz, and many other OSS scanners.
// deno-lint-ignore-file no-explicit-any

export type EcoSystem = "npm" | "PyPI" | "Go" | "Maven" | "RubyGems" | "crates.io" | "NuGet" | "Packagist";

export interface PkgRef { ecosystem: EcoSystem; name: string; version: string; }

export interface OsvVuln {
  id: string;
  summary?: string;
  details?: string;
  aliases?: string[];
  severity?: { type: string; score: string }[];
  database_specific?: { severity?: string; cwe_ids?: string[] };
  affected?: any[];
  references?: { type: string; url: string }[];
}

export interface OsvHit { pkg: PkgRef; vuln: OsvVuln; }

const OSV_URL = "https://api.osv.dev/v1/querybatch";

// Parse a package-lock.json / requirements.txt / go.mod / pom.xml-ish blob.
// Keep it forgiving: best-effort extraction of name@version pairs.
export function parseManifest(ecosystem: EcoSystem, raw: string): PkgRef[] {
  const out: PkgRef[] = [];
  const seen = new Set<string>();
  const push = (name: string, version: string) => {
    name = name.trim(); version = version.trim().replace(/^[\\^~=v]+/, "");
    if (!name || !version) return;
    const k = `${name}@${version}`;
    if (seen.has(k)) return; seen.add(k);
    out.push({ ecosystem, name, version });
  };

  if (ecosystem === "npm") {
    // package-lock.json (v2/v3) — packages object
    try {
      const j = JSON.parse(raw);
      if (j?.packages && typeof j.packages === "object") {
        for (const [path, meta] of Object.entries<any>(j.packages)) {
          if (!path || !meta?.version) continue;
          const name = path.startsWith("node_modules/") ? path.split("node_modules/").pop()! : meta.name;
          if (name) push(name, meta.version);
        }
        if (out.length) return out;
      }
      if (j?.dependencies && typeof j.dependencies === "object") {
        for (const [n, m] of Object.entries<any>(j.dependencies)) push(n, typeof m === "string" ? m : m?.version);
        if (out.length) return out;
      }
      // package.json
      for (const f of ["dependencies", "devDependencies", "peerDependencies"]) {
        const block = j?.[f]; if (!block) continue;
        for (const [n, v] of Object.entries<any>(block)) push(n, String(v));
      }
      return out;
    } catch { /* fall through to text parse */ }
    // npm ls / yarn-style: name@version per line
    raw.split(/\r?\n/).forEach(line => {
      const m = line.match(/(@?[\w\-./]+)@(\d[\w.\-+]*)/);
      if (m) push(m[1], m[2]);
    });
    return out;
  }

  if (ecosystem === "PyPI") {
    raw.split(/\r?\n/).forEach(line => {
      line = line.replace(/#.*$/, "").trim();
      if (!line) return;
      const m = line.match(/^([A-Za-z0-9_\-.]+)\s*==\s*([0-9][\w.\-+]*)/);
      if (m) push(m[1], m[2]);
    });
    return out;
  }

  if (ecosystem === "Go") {
    // go.mod / go.sum
    raw.split(/\r?\n/).forEach(line => {
      const m = line.match(/([\w.\-]+(?:\/[\w.\-]+)+)\s+v(\d[\w.\-+]*)/);
      if (m) push(m[1], m[2]);
    });
    return out;
  }

  if (ecosystem === "RubyGems") {
    raw.split(/\r?\n/).forEach(line => {
      const m = line.match(/^\s+([\w\-]+)\s+\(([0-9][\w.\-]*)\)/);
      if (m) push(m[1], m[2]);
    });
    return out;
  }

  if (ecosystem === "Maven") {
    // crude: <dependency><groupId>g</groupId><artifactId>a</artifactId><version>v</version>
    const re = /<groupId>([^<]+)<\/groupId>\s*<artifactId>([^<]+)<\/artifactId>\s*<version>([^<]+)<\/version>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw))) push(`${m[1]}:${m[2]}`, m[3]);
    return out;
  }

  return out;
}

export async function queryOsv(pkgs: PkgRef[]): Promise<OsvHit[]> {
  if (!pkgs.length) return [];
  // OSV batch limit is generous; chunk to be safe.
  const chunks: PkgRef[][] = [];
  for (let i = 0; i < pkgs.length; i += 200) chunks.push(pkgs.slice(i, i + 200));

  const hits: OsvHit[] = [];
  for (const chunk of chunks) {
    const body = { queries: chunk.map(p => ({ version: p.version, package: { name: p.name, ecosystem: p.ecosystem } })) };
    const res = await fetch(OSV_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`OSV ${res.status}: ${await res.text()}`);
    const data = await res.json() as { results: { vulns?: { id: string }[] }[] };
    // Batch returns IDs only — fetch full vuln details for unique IDs.
    const idSet = new Set<string>();
    const idToPkg = new Map<string, PkgRef>();
    data.results.forEach((r, i) => {
      const p = chunk[i];
      r.vulns?.forEach(v => {
        idSet.add(v.id);
        if (!idToPkg.has(v.id)) idToPkg.set(v.id, p);
      });
    });
    const ids = [...idSet];
    // Fetch each (OSV has no batch detail endpoint — but caps are reasonable for demo input sizes).
    const detailed = await Promise.all(ids.map(async id => {
      try {
        const r = await fetch(`https://api.osv.dev/v1/vulns/${encodeURIComponent(id)}`);
        if (!r.ok) return null;
        return await r.json() as OsvVuln;
      } catch { return null; }
    }));
    detailed.forEach((v, i) => {
      if (!v) return;
      hits.push({ pkg: idToPkg.get(ids[i])!, vuln: v });
    });
  }
  return hits;
}

export function severityFor(v: OsvVuln): "critical" | "high" | "medium" | "low" | "info" {
  const cvss = v.severity?.find(s => s.type?.startsWith("CVSS"));
  const score = cvss ? Number(cvss.score?.match(/\d+\.\d+/)?.[0] ?? cvss.score) : NaN;
  if (!isNaN(score)) {
    if (score >= 9) return "critical";
    if (score >= 7) return "high";
    if (score >= 4) return "medium";
    if (score > 0)  return "low";
  }
  const txt = (v.database_specific?.severity ?? "").toLowerCase();
  if (txt.includes("critical")) return "critical";
  if (txt.includes("high"))     return "high";
  if (txt.includes("moderate") || txt.includes("medium")) return "medium";
  if (txt.includes("low"))      return "low";
  return "medium";
}

export function aliasCve(v: OsvVuln): string | undefined {
  if (v.id?.startsWith("CVE-")) return v.id;
  return v.aliases?.find(a => a.startsWith("CVE-"));
}
