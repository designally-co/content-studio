import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { appSettings, type FormatRules } from "@/db/schema";

export const DEFAULT_ARTICLE_PROMPT =
  "Write a useful, well-researched article with a clear title, a concise introduction, descriptive H2/H3 sections, and a conclusion with an appropriate call to action. Aim for 900–1,500 words. Use Markdown headings and do not add hashtags.";

export const DEFAULT_ARTICLE_RULES: FormatRules = {
  prompt: DEFAULT_ARTICLE_PROMPT,
  length: "900–1,500 words",
  structure: "Title, concise introduction, H2/H3 sections, and conclusion with CTA",
  hashtags: "None",
  headings: "Use descriptive Markdown H2/H3 headings",
  longForm: true,
};

/** Return the article generation rules, including an optional saved prompt override. */
export async function getArticleRules(): Promise<FormatRules> {
  const db = await getDb();
  const [saved] = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, "article.prompt"))
    .limit(1);
  return { ...DEFAULT_ARTICLE_RULES, prompt: saved?.value || DEFAULT_ARTICLE_PROMPT };
}

export function articlePrompt(rules: FormatRules): string {
  return (
    rules.prompt?.trim() ||
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
