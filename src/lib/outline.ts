/** Shapes the model returns for an outline (long-form) or content plan (short-form). */
export type OutlineJson = {
  // long-form
  title?: string;
  introAngle?: string;
  sections?: { heading: string; points: string[] }[];
  sources?: { name: string; url: string; whyRelevant: string }[];
  cta?: string;
  // short-form
  hook?: string;
  bodyAngle?: string;
  hashtags?: string[];
};

/** Render the model's outline/plan JSON to editable Markdown. */
export function outlineToMarkdown(o: OutlineJson, longForm: boolean): string {
  if (longForm) {
    const lines: string[] = [];
    if (o.title) lines.push(`# ${o.title}`, "");
    if (o.introAngle) lines.push(`**Intro angle:** ${o.introAngle}`, "");
    for (const s of o.sections ?? []) {
      lines.push(`## ${s.heading}`);
      for (const p of s.points ?? []) lines.push(`- ${p}`);
      lines.push("");
    }
    if (o.sources?.length) {
      lines.push("## Research notes");
      for (const source of o.sources) {
        const url = safeHttpUrl(source.url);
        lines.push(url
          ? `- [${source.name}](${url}) — ${source.whyRelevant}`
          : `- ${source.name} — ${source.whyRelevant}`);
      }
      lines.push("");
    }
    if (o.cta) lines.push(`**CTA:** ${o.cta}`);
    return lines.join("\n").trim();
  }

  const lines: string[] = [];
  if (o.title) lines.push(`**Working title:** ${o.title}`);
  if (o.hook) lines.push(`**Hook:** ${o.hook}`);
  if (o.bodyAngle) lines.push(`**Body angle:** ${o.bodyAngle}`);
  if (o.cta) lines.push(`**CTA:** ${o.cta}`);
  if (o.hashtags?.length) lines.push(`**Hashtags:** ${o.hashtags.join(" ")}`);
  return lines.join("\n\n").trim();
}

function safeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}
