/** Shapes the model returns for an outline (long-form) or content plan (short-form). */
export type OutlineJson = {
  // long-form
  title?: string;
  introAngle?: string;
  sections?: { heading: string; points: string[] }[];
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
