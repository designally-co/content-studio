import type { Language } from "@/db/schema";

/** Task layer — stage-specific instructions. Versioned per template. */
export const TASKS_VERSION = "tasks@1.0.0";

const marketFor = (language: Language) =>
  language === "th"
    ? "the Thai market (search Thai-language sources and current Thailand trends)"
    : "the global/English market";

export function topicsTask(params: {
  categoryName: string;
  language: Language;
}): string {
  return `## Task: suggest topics
Use web search to find what is currently timely and relevant for the category "${params.categoryName}" in ${marketFor(params.language)}. Prioritize recent developments, seasonal angles, and genuine audience questions.

Return 5–8 topic ideas. For each: a proposed title, the angle, why it is timely right now, and the likely search intent.

Respond as JSON:
{
  "topics": [
    { "title": string, "angle": string, "whyTimely": string, "searchIntent": string }
  ]
}`;
}

export function outlineTask(params: {
  topicTitle: string;
  longForm: boolean;
}): string {
  if (params.longForm) {
    return `## Task: outline
Create a structured outline for an article titled (or about): "${params.topicTitle}".
Include: a working title, a one-line intro angle, 3–6 section headings each with 1–3 key points, and a suggested CTA. Match the format rules and brand profile.

Respond as JSON:
{
  "title": string,
  "introAngle": string,
  "sections": [ { "heading": string, "points": [string] } ],
  "cta": string
}`;
  }
  return `## Task: content plan
Create a compact plan for a short-form post about: "${params.topicTitle}".
Respond as JSON:
{
  "title": string,
  "hook": string,
  "bodyAngle": string,
  "cta": string,
  "hashtags": [string]
}`;
}

/**
 * Draft task. `variation` steers each of the 3 drafts to differ meaningfully.
 */
const VARIATION_STEER = [
  "Variation 1 — lead with a bold, provocative hook and a confident, punchy rhythm.",
  "Variation 2 — lead with a relatable problem/story angle; warmer, more narrative structure.",
  "Variation 3 — lead with a data/insight or how-to framing; clear, practical, skimmable structure.",
];

export function draftTask(params: {
  outlineMarkdown: string;
  variation: number;
  longForm: boolean;
}): string {
  const steer = VARIATION_STEER[params.variation - 1] ?? VARIATION_STEER[0];
  return `## Task: write draft (variation ${params.variation} of 3)
Write a complete, publish-ready ${params.longForm ? "piece" : "post"} from the approved outline/plan below. Follow the brand profile and format rules exactly.

${steer}

Variations must differ meaningfully from one another (hook, structure, or tone-within-brand) — not be paraphrases of the same text.

Approved outline/plan:
${params.outlineMarkdown}

Output the finished draft as clean Markdown only — no preamble, no explanation, no "here is your draft". Start directly with the content.`;
}

export function refineTask(params: {
  currentDraft: string;
  userMessage: string;
}): string {
  return `## Task: refine draft
Here is the current draft:

---
${params.currentDraft}
---

Apply this change requested by the reviewer:
"${params.userMessage}"

Return the FULL updated draft as clean Markdown only — not a diff, not a description of changes, not a preamble. Preserve everything the reviewer did not ask to change.`;
}

export function competitorTask(url: string): string {
  return `## Task: summarize competitor reference
Fetch and read the article at this URL, then summarize it as reference material for our own (original, non-copying) content: ${url}

Provide: the main topic and thesis, the structure/sections it uses, the angle and audience it targets, and any notable gaps we could cover better. Do NOT reproduce its wording. Keep the summary under 250 words.`;
}

export function imagePromptTask(params: {
  title: string;
  summary: string;
  model?: string;
  aspectRatio?: string;
  hasReferenceImage?: boolean;
}): string {
  return `## Task: draft an image prompt
Write a single vivid image-generation prompt for a companion image for this content. It should reflect the topic and the brand's visual sensibility, be concrete about subject, composition, style, and mood, and avoid text/letters in the image.

Title: ${params.title}
Summary: ${params.summary}
Model: ${params.model ?? "Not specified"}
Aspect ratio: ${params.aspectRatio ?? "1:1"}
Reference image: ${params.hasReferenceImage ? "Attached; preserve its important subject, product, and visual identity details" : "None"}

Respond with the image prompt only — one paragraph, no quotes, no preamble.`;
}
