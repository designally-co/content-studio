/**
 * Publishing taxonomy for articles headed to the external content platform.
 *
 * Two levels, derived from the content direction the article was created under:
 *   - category = the direction's parent pillar (one of the four) — the platform's
 *     top-level category, kept deliberately small for clean site navigation.
 *   - tags     = the content direction(s) — the specific sub-topic, for related
 *     content and internal linking.
 *
 * Every direction already knows its pillar (see @/lib/content-pillars), so this
 * is a pure derivation over data the project already stores — no extra input at
 * generation time.
 */
import { pillarForDirection } from "./content-pillars";

export type PublishMetadata = {
  /** Pillar name — the platform's single top-level category. Empty if unknown. */
  category: string;
  /** Content direction(s) — the platform's tags. */
  tags: string[];
};

/** Derive category (pillar) + tags (direction) from a project's content direction. */
export function publishMetadata(directionName: string | null | undefined): PublishMetadata {
  const direction = directionName?.trim() ?? "";
  const pillar = direction ? pillarForDirection(direction) : null;
  return {
    category: pillar?.name ?? "",
    tags: direction ? [direction] : [],
  };
}

/** Double-quote and escape a value so it is safe inside YAML. */
function yamlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * YAML frontmatter block for headless-CMS / static-site import (WordPress,
 * Ghost, Webflow CMS, Astro, etc.). Omits any field that has no value.
 */
export function publishFrontmatter(
  meta: PublishMetadata,
  options: { title?: string } = {}
): string {
  const lines: string[] = ["---"];
  const title = options.title?.trim();
  if (title) lines.push(`title: ${yamlString(title)}`);
  if (meta.category) lines.push(`category: ${yamlString(meta.category)}`);
  if (meta.tags.length > 0) {
    lines.push("tags:");
    for (const tag of meta.tags) lines.push(`  - ${yamlString(tag)}`);
  }
  lines.push("---");
  return lines.join("\n");
}

/** The article body with a publishing frontmatter block prepended. */
export function withFrontmatter(
  markdown: string,
  meta: PublishMetadata,
  options: { title?: string } = {}
): string {
  return `${publishFrontmatter(meta, options)}\n\n${markdown}`;
}
