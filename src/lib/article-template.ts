import "server-only";

import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { appSettings, type FormatRules } from "@/db/schema";

export const DEFAULT_ARTICLE_PROMPT =
  `Write an editorial-quality, well-researched article for Designally's article platform. Aim for 1,200–2,000 words unless the subject earns a different length.

Structure:
- A specific, compelling title that makes one clear promise without clickbait.
- A one- or two-sentence standfirst that gives the reader a reason to continue.
- A scene-setting introduction of 3–5 short paragraphs: establish what is happening now, the tension or change behind it, and why it matters to the selected audience.
- Descriptive H2 sections in a deliberate narrative order. Use H3 only when it genuinely clarifies a subsection.
- Each main section should include concrete names, examples, facts, or observations, followed by useful interpretation. Explain both what is happening and why it matters.
- End when the argument is complete. Add a concise, low-pressure CTA only when it fits the selected objective.

Editorial standards:
- Prefer precise nouns, active verbs, varied sentence lengths, and short paragraphs.
- Make informed editorial judgments, but distinguish analysis from verified fact.
- Link named sources contextually in Markdown. Never invent a URL, quotation, statistic, person, company, product, or claim.
- Use the supplied research notes as evidence, not as text to paraphrase section by section.
- Avoid generic introductions, empty trend language, repeated conclusions, listicle filler, throat-clearing, and phrases such as “in today's fast-paced world”.
- Do not add hashtags, a references dump, an FAQ, or a social-media caption unless explicitly requested.`;

/** A word range, with or without thousands separators: "300-500 words", "1,200–2,000 words". */
const WORD_RANGE = /\b((?:\d{1,3},\d{3}|\d{2,4}))\s*[–—-]\s*((?:\d{1,3},\d{3}|\d{2,4}))\s*words?\b/i;

export const DEFAULT_ARTICLE_RULES: FormatRules = {
  prompt: DEFAULT_ARTICLE_PROMPT,
  length: "1,200–2,000 words",
  longForm: true,
};

function normalizeLength(value: string): string {
  const trimmed = value.trim();
  return trimmed || DEFAULT_ARTICLE_RULES.length;
}

function lengthFromPrompt(prompt: string): string | undefined {
  const match = prompt.match(WORD_RANGE);
  return match ? `${match[1]}–${match[2]} words` : undefined;
}

/** Return the article generation rules, including an optional saved prompt override. */
export async function getArticleRules(): Promise<FormatRules> {
  const db = await getDb();
  // Both settings are fetched in one round trip. This also avoids a trailing
  // `.limit(1)`: through the Supabase transaction pooler that emits `LIMIT $n`,
  // which crashed inside postgres-js with "Cannot read properties of undefined
  // (reading 'length')" and took the whole Settings page down with a 500.
  const rows = await db
    .select({ key: appSettings.key, value: appSettings.value })
    .from(appSettings)
    .where(inArray(appSettings.key, ["article.prompt", "article.length"]));
  const byKey = new Map(rows.map((row) => [row.key, row.value]));

  const prompt = byKey.get("article.prompt") || DEFAULT_ARTICLE_PROMPT;
  const length = normalizeLength(byKey.get("article.length") || lengthFromPrompt(prompt) || DEFAULT_ARTICLE_RULES.length);
  return { ...DEFAULT_ARTICLE_RULES, prompt, length };
}

export function articlePrompt(rules: FormatRules): string {
  // `length` is the single source of truth for the target: a saved prompt may
  // carry a word range of its own (they are free text), so the range inside it
  // is rewritten to match rather than left to contradict the setting.
  const prompt = (rules.prompt?.trim() || DEFAULT_ARTICLE_PROMPT).replace(
    WORD_RANGE,
    rules.length
  );
  return `${prompt}\n\nRequired target length: ${rules.length}. Follow this range for the completed article.`;
}
