/**
 * Parse Google Search Console query data (CSV export or a pasted table) into a
 * compact insight summary that gets injected into generation prompts.
 * Accepts comma- or tab-separated input.
 */
export function parseGscInsights(raw: string, limit = 15): string {
  const text = raw.trim();
  if (!text) return "";

  const rows = text
    .split(/\r?\n/)
    .map((line) => splitRow(line))
    .filter((cells) => cells.length > 0 && cells.some((c) => c.trim() !== ""));
  if (rows.length < 2) return "";

  const header = rows[0].map((h) => h.toLowerCase().trim());
  const qi = findCol(header, ["query", "queries", "top queries", "search query", "keyword"]);
  const impi = findCol(header, ["impressions", "impr"]);
  const clicki = findCol(header, ["clicks", "click"]);
  const posi = findCol(header, ["position", "avg. pos", "average position", "pos"]);

  if (qi === -1) return "";

  type Row = { query: string; impressions: number; clicks: number; position: number | null };
  const data: Row[] = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    const query = (cells[qi] ?? "").trim();
    if (!query) continue;
    data.push({
      query,
      impressions: impi === -1 ? 0 : num(cells[impi]),
      clicks: clicki === -1 ? 0 : num(cells[clicki]),
      position: posi === -1 ? null : num(cells[posi]),
    });
  }
  if (data.length === 0) return "";

  data.sort((a, b) => b.impressions - a.impressions);
  const top = data.slice(0, limit);
  const totalImpr = data.reduce((s, r) => s + r.impressions, 0);
  const totalClicks = data.reduce((s, r) => s + r.clicks, 0);

  const lines = top.map((r) => {
    const parts = [`"${r.query}"`];
    if (r.impressions) parts.push(`${r.impressions.toLocaleString()} impr`);
    if (r.clicks) parts.push(`${r.clicks.toLocaleString()} clicks`);
    if (r.position != null) parts.push(`pos ${r.position.toFixed(1)}`);
    return `- ${parts.join(", ")}`;
  });

  const header2 = `Top ${top.length} queries from Search Console (of ${data.length} total; ${totalImpr.toLocaleString()} impressions, ${totalClicks.toLocaleString()} clicks). Use these to inform the topic and headings — favor high-impression queries the content can genuinely satisfy:`;
  return `${header2}\n${lines.join("\n")}`;
}

function splitRow(line: string): string[] {
  if (line.includes("\t")) return line.split("\t");
  // CSV with quoted-field support
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function findCol(header: string[], names: string[]): number {
  for (const n of names) {
    const idx = header.indexOf(n);
    if (idx !== -1) return idx;
  }
  // partial contains
  for (let i = 0; i < header.length; i++) {
    if (names.some((n) => header[i].includes(n))) return i;
  }
  return -1;
}

function num(v: string | undefined): number {
  if (!v) return 0;
  const n = parseFloat(v.replace(/[,%\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
