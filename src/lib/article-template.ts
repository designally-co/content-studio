import "server-only";

import { eq } from "drizzle-orm";
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

const LEGACY_ARTICLE_PROMPT =
  "Write a useful, well-researched article with a clear title, a concise introduction, descriptive H2/H3 sections, and a conclusion with an appropriate call to action. Aim for 900–1,500 words. Use Markdown headings and do not add hashtags.";

export const DEFAULT_ARTICLE_RULES: FormatRules = {
  prompt: DEFAULT_ARTICLE_PROMPT,
  length: "1,200–2,000 words",
  structure: "Title, standfirst, scene-setting introduction, evidence-led H2 sections, and an earned ending",
  hashtags: "None",
  headings: "Use descriptive Markdown H2/H3 headings",
  longForm: true,
};

function normalizeLength(value: string): string {
  const trimmed = value.trim();
  return trimmed || DEFAULT_ARTICLE_RULES.length;
}

function lengthFromPrompt(prompt: string): string | undefined {
  const match = prompt.match(/\b(\d{2,4})\s*[–—-]\s*(\d{2,4})\s*words?\b/i);
  return match ? `${match[1]}–${match[2]} words` : undefined;
}

/** Return the article generation rules, including an optional saved prompt override. */
export async function getArticleRules(): Promise<FormatRules> {
  const db = await getDb();
  const saved = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, "article.prompt"));
  const savedPrompt = saved[0]?.value;
  const prompt = !savedPrompt || savedPrompt === LEGACY_ARTICLE_PROMPT
    ? DEFAULT_ARTICLE_PROMPT
    : savedPrompt;
  const [savedLength] = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, "article.length"))
    .limit(1);
  const length = normalizeLength(savedLength?.value || lengthFromPrompt(prompt) || DEFAULT_ARTICLE_RULES.length);
  return { ...DEFAULT_ARTICLE_RULES, prompt, length };
}

export function articlePrompt(rules: FormatRules): string {
  const savedPrompt = rules.prompt?.trim();
  const promptWithCurrentLength = savedPrompt?.replace(
    /\b\d{2,4}\s*[–—-]\s*\d{2,4}\s*words?\b/i,
    rules.length
  );
  return (
    promptWithCurrentLength
      ? `${promptWithCurrentLength}\n\nRequired target length: ${rules.length}. Follow this range for the completed article.`
      :
    [
      rules.length && `Length: ${rules.length}`,
      rules.structure && `Structure: ${rules.structure}`,
      rules.headings && `Headings: ${rules.headings}`,
      rules.hashtags && `Hashtags: ${rules.hashtags}`,
    ]
      .filter(Boolean)
      .join("\n") ||
    DEFAULT_ARTICLE_PROMPT
  );
}
