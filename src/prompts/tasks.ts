import type { Language } from "@/db/schema";
import { EDITORIAL_SCOPE_TEXT } from "@/lib/designally-strategy";
import type { EditorialCandidate } from "@/lib/editorial";
import {
  ART_DIRECTION_GUIDE,
  type ArtDirectionSelection,
} from "@/lib/image/visual-brief";

/** Task layer — stage-specific instructions. Versioned per template. */
export const TASKS_VERSION = "tasks@1.3.0";

const marketFor = (language: Language) =>
  language === "th"
    ? "the Thai market (search Thai-language sources and current Thailand trends)"
    : "the global/English market";

export function editorialResearchTask(params: {
  topic: string;
  category: string;
  format: string;
  period?: string;
  reader: string;
  entryCount: number;
  language: Language;
  seedSources?: { name: string; url: string }[];
  pillarName?: string;
  pillarPurpose?: string;
}): string {
  return `## Task: discover and verify editorial candidates
Research candidates for an editorial article about “${params.topic}”.
Content pillar: ${params.pillarName || "—"}${params.pillarPurpose ? ` — ${params.pillarPurpose}` : ""}
Content direction: ${params.category}
Format: ${params.format}
Time period: ${params.period || "Current / not fixed"}
Reader: ${params.reader}
Market: ${marketFor(params.language)}
${params.seedSources?.length ? `Sources already found during topic discovery; verify and reuse these before searching more broadly:\n${params.seedSources.map((source) => `- ${source.name}: ${source.url}`).join("\n")}` : ""}

Find ${Math.min(20, Math.max(params.entryCount + 1, 6))} credible candidates that serve this pillar's intent. The article can only use ${params.entryCount}, so prioritize verification over collecting extras. For a dated roundup, include only candidates with evidence connecting them to the requested period. Prioritize official creator, foundry, product, studio, or project pages. A candidate is “confirmed” only when its identity, attribution, URL, and period relevance are supported. Do not convert the subject into business advice. Do not rank by popularity unless a source provides real evidence; “best” means an informed editorial selection.

For each candidate return its name, creator, organization/foundry, official URL, best corroborating source URL, release evidence, 2–5 concrete factual details, what makes it distinctive, why it matters to designers, and confidence.

Respond as JSON:
{
  "candidates": [
    {
      "name": string,
      "creator": string,
      "organization": string,
      "officialUrl": string,
      "sourceUrl": string,
      "releaseEvidence": string,
      "concreteDetails": [string],
      "distinctive": string,
      "whyItMatters": string,
      "confidence": "confirmed" | "needs_review"
    }
  ]
}`;
}

export function editorialOutlineTask(params: {
  topic: string;
  period?: string;
  reader: string;
  candidates: EditorialCandidate[];
}): string {
  const pack = params.candidates.map((candidate, index) => `${index + 1}. ${candidate.name}
Creator: ${candidate.creator}
Organization: ${candidate.organization}
Official URL: ${candidate.officialUrl}
Release evidence: ${candidate.releaseEvidence}
Details: ${candidate.concreteDetails.join("; ")}
Distinctive: ${candidate.distinctive}
Why it matters: ${candidate.whyItMatters}`).join("\n\n");
  return `## Task: build an editorial outline from a curated research pack
Article: ${params.topic}
Period: ${params.period || "Not fixed"}
Reader: ${params.reader}

The editor selected the candidates below. Include every selected candidate and no unselected entries. Build a concise scene-setting introduction followed by one clear section per candidate in the supplied order. Each section must cover attribution, concrete characteristics, what makes the candidate distinctive, and why a designer should care. Do not force a business problem, Designally service message, or CTA. End with a short synthesis only if the collection reveals a genuine pattern.

Curated research pack:
${pack}

Respond as JSON:
{
  "title": string,
  "introAngle": string,
  "sections": [ { "heading": string, "points": [string] } ],
  "sources": [ { "name": string, "url": string, "whyRelevant": string } ],
  "cta": string
}`;
}

export function editorialDraftTask(params: { outlineMarkdown: string }): string {
  return `## Task: write one editorial-quality draft
Write a complete article for Designally's article platform from the researched article plan below. This is an editorial resource article, not business thought leadership. Do not introduce buyer pain, Designally services, SEO framing, or a conversion CTA.

Open with a timely, concise scene-setting introduction. Follow the plan's structure, use its research links contextually, and give concrete examples substantive attention. Never invent release timing, popularity, technical details, quotes, or URLs. Vary paragraph openings and avoid repetitive section formulas.

Researched article plan:
${params.outlineMarkdown}

Output clean Markdown only, starting directly with the title.`;
}

export function editorialArticlePlanTask(params: {
  topic: string;
  brief?: string;
  format?: string;
  period?: string;
  language: Language;
  seedSources?: { name: string; url: string }[];
  pillarName?: string;
  pillarPurpose?: string;
}): string {
  return `## Task: research and plan one creative-industry article
Research the current subject using reliable sources, prioritizing official creator, product, foundry, studio, project, and documentation pages. Produce a concise article plan that contains enough verified detail for a writer to create the complete article without a separate candidate or curation step.

Topic: ${params.topic}
Content pillar: ${params.pillarName || "—"}${params.pillarPurpose ? ` — ${params.pillarPurpose}` : ""}
Brief: ${params.brief || "None"}
Format: ${params.format || "Choose the most useful editorial structure"}
Period: ${params.period || "Current / not fixed"}
Market: ${marketFor(params.language)}
${params.seedSources?.length ? `Sources already found during topic discovery; verify and reuse them first:\n${params.seedSources.map((source) => `- ${source.name}: ${source.url}`).join("\n")}` : ""}

Requirements:
- Keep the article useful to designers and creative teams.
- For roundups, choose only as many examples as a focused article genuinely needs.
- Include concrete names, attribution, supported characteristics, and why each example matters.
- For dated topics, include only items with evidence connecting them to the requested period.
- Never invent popularity, release timing, quotations, facts, or URLs.
- Do not turn the subject into business advice or a Designally sales message.

Respond as JSON with a working title, concise introduction angle, 4–8 purposeful sections with specific evidence-led points, 4–10 reliable sources, and an empty CTA unless the subject genuinely needs a useful next step.`;
}

export function topicsTask(params: {
  categoryName: string;
  language: Language;
  pillarName?: string;
  pillarPurpose?: string;
  examples?: string[];
}): string {
  const pillarLine = params.pillarName
    ? `\nThis direction lives under the "${params.pillarName}" content pillar${params.pillarPurpose ? ` — ${params.pillarPurpose}` : ""}. Every idea must serve that pillar's intent.`
    : "";
  const examplesBlock = params.examples?.length
    ? `\n\nExample headlines that fit this pillar (match their tone and specificity; do not reuse them verbatim):\n${params.examples.map((example) => `- ${example}`).join("\n")}`
    : "";
  return `## Task: suggest topics
Suggest timely, researchable directions for the content direction "${params.categoryName}" in ${marketFor(params.language)}.${pillarLine} Prioritize concrete resources, releases, developments, and genuine questions that matter to designers. Each direction must be specific enough for the next stage to research and useful enough to become a complete creative-industry article.${examplesBlock}

Stay within Designally's editorial territory:
${EDITORIAL_SCOPE_TEXT}

Favor useful editorial formats such as curated resources, notable new releases, practical reference collections, informed explainers, design-principle analysis, and evidence-led perspectives on changes affecting designers. Reject broad topics that do not have a strong creative-agency or designer angle.

Return 5–8 topic ideas. For each: a proposed title, the angle, why it is relevant now, and the likely reader intent. Do not invent source URLs; live source research happens only after the editor selects a topic.

Respond as JSON:
{
  "topics": [
    { "title": string, "angle": string, "whyTimely": string, "searchIntent": string }
  ]
}`;
}

export function outlineTask(params: {
  topicTitle: string;
  angle?: string;
  whyTimely?: string;
  searchIntent?: string;
  longForm: boolean;
}): string {
  if (params.longForm) {
    return `## Task: outline
Research the subject using current, reliable sources, prioritizing primary sources and direct project/company pages. Then create a structured outline for an article titled (or about): "${params.topicTitle}".
Editorial angle: ${params.angle || "Develop the strongest angle from the project foundation."}
Why now: ${params.whyTimely || "Establish current relevance through research."}
Reader intent: ${params.searchIntent || "Infer from the selected audience and objective."}

Include: a working title, a standfirst-style problem-first intro angle, 4–7 section headings each with 2–4 specific points, a suggested CTA, and 4–8 research sources. The points should name concrete examples, facts, people, organizations, or developments where the sources support them, then state the interpretation the reader needs. Begin in the reader's world, earn the strategic conclusion, and use a low-pressure CTA appropriate to the selected article objective. Match the format rules and brand profile.

Respond as JSON:
{
  "title": string,
  "introAngle": string,
  "sections": [ { "heading": string, "points": [string] } ],
  "sources": [ { "name": string, "url": string, "whyRelevant": string } ],
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

export function draftTask(params: {
  outlineMarkdown: string;
  longForm: boolean;
}): string {
  return `## Task: write draft
Write a complete, publish-ready article for Designally's article platform from the approved outline/plan below. Follow the brand strategy, selected audience, message pillar, objective, and format rules exactly. The finished article may later be shared on social media, but it must not read like a social post.

Treat the outline's research notes as a reporting pack. Use only source-supported specifics. You may link a source inline on the relevant name or claim in Markdown where it reads naturally. Do not add your own references or "Sources" section — a sources list is appended automatically after your draft. For every main section, move from concrete detail to interpretation: what it is, what makes it distinctive or consequential, and why the selected reader should care. Do not pad the article to meet a word count.

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
  visualBrief: import("@/lib/image/visual-brief").ArticleVisualBrief;
  direction: import("@/lib/image/visual-brief").ImageDirection;
  model?: string;
  aspectRatio?: string;
  hasReferenceImage?: boolean;
}): string {
  return `## Task: turn an article visual brief into an image-generation prompt
Write one concrete, model-ready prompt for an image that visibly represents the article's real subject. Follow the structured visual brief exactly. Prioritize named objects, products, creative artifacts, and supported visual characteristics over abstract metaphors. Do not add business strategy, agency-office scenes, growth symbolism, generic futuristic technology, or facts not present in the brief.

For typography, interfaces, websites, products, and identity systems, never claim exact visual fidelity without a reference image. Do not ask the image model to render readable names, logos, UI copy, or other precise text. If no reference is attached, create an editorial interpretation of the subject rather than a counterfeit specimen or interface. Be concrete about subject, composition, medium, lighting, color relationships, depth, and mood. Avoid text and letters unless the brief identifies typography as the subject; even then, request expressive abstract letterforms rather than readable words.

Title: ${params.title}
Requested direction: ${params.direction}
Visual brief: ${JSON.stringify(params.visualBrief)}
Selected art direction: ${ART_DIRECTION_GUIDE[params.visualBrief.artDirection]}
Feel: aim for the visual language of a creative-industry publication (Creative Boom, It's Nice That, Eye on Design) — expressive, editorial, and genuinely varied from piece to piece. Prefer real photographic or crafted quality over generic AI stylization.
Color: choose a bold, story-specific palette that fits THIS article's subject and mood — commit to it. Do not default to a fixed house palette, muted off-white/beige studio look, or the same colors as other articles. Let color vary strongly from article to article.
Model: ${params.model ?? "Not specified"}
Aspect ratio: ${params.aspectRatio ?? "1:1"}
Reference image: ${params.hasReferenceImage ? "Attached; preserve its important subject, product, and visual identity details" : "None"}

Respond with the image prompt only — one paragraph, no quotes, no preamble.`;
}

export function articleVisualBriefTask(params: {
  title: string;
  article: string;
  direction: import("@/lib/image/visual-brief").ImageDirection;
  artDirection: ArtDirectionSelection;
  hasReferenceImage: boolean;
}): string {
  return `## Task: extract an article-aware visual brief
Read the finished article and identify what an editorial image must visibly communicate. Base every detail on the article. Classify the subject, retain the most visually important named fonts, tools, websites, projects, or principles, and extract concrete visual characteristics. Do not turn the subject into a business metaphor.

Target the visual variety of a creative-industry publication (Creative Boom / It's Nice That): each image should feel distinct. In "mood" and "visualCharacteristics", commit to an expressive, story-specific color palette (bold or muted as the subject demands) and a specific medium — do NOT describe a uniform muted, beige, or off-white studio look, and do not reuse a generic house palette. Let the color and medium be driven by this article alone.

Requested direction: ${params.direction}
Requested art direction: ${params.artDirection}
Reference image available: ${params.hasReferenceImage ? "yes" : "no"}
Finished title: ${params.title}

Finished article:
---
${params.article}
---

Direction rules:
- auto: choose the most appropriate image role for this article type.
- editorial_cover: create a publication-quality hero image focused on the main subject.
- subject_collage: organize several genuinely featured subjects into one coherent composition.
- conceptual_illustration: interpret the central idea, but keep the article's actual subject recognizable.
- realistic_scene: place the subject in a credible real-world creative context.
- minimal_graphic: reduce the subject to one restrained, unmistakable visual idea.

Art-direction routing:
- abstract_insight: reports, industry shifts, trend analysis, and evidence-led perspectives.
- metaphorical_editorial: design principles, methods, mindset, process, accessibility, and human creative challenges.
- editorial_studio: profiles, interviews, studio visits, identity showcases, and individual projects.
- retro_futurist: AI, software, emerging tools, and future-facing creative technology.
- tactile_flat_lay: fonts, books, tools, templates, gift guides, roundups, and resource collections.
- interface_showcase: websites, UI libraries, digital products, interfaces, and experience-design showcases.
- designally_ci: ONLY when explicitly requested — never choose it in auto. It is the Designally house system (one object per frame on a calm charcoal, steel grey-blue, or warm off-white field with a single orange accent); when it is requested, follow that restrained house palette instead of an expressive per-article one.

When requested art direction is auto, choose from the article’s meaning and structure, not its category alone. A typography profile should use editorial_studio, a typography roundup tactile_flat_lay, and a typography trend abstract_insight. When a specific art direction is requested, use it unless it would create a deceptive representation; explain any safer interpretation in artDirectionReason.

Return articleStructure as one of roundup, resources, releases, comparison, explainer, profile, or trend. Return the selected artDirection and one concise sentence explaining the choice.

For typography, UI, websites, branding, or products, explain when real specimen or screenshot references are needed for accuracy. Avoid readable generated text, invented logos, fake interfaces, generic offices, charts, rockets, lightbulbs, handshakes, and unrelated abstract technology imagery.`;
}

export function brandReviewTask(article: string): string {
  return `## Task: qualitative brand review
Review the article against the supplied Designally brand strategy and project foundation. Do not calculate a score, approval rate, or predicted performance. Evaluate these exact criteria:
1. Starts with the selected audience's business reality.
2. Names the problem before presenting Designally or a solution.
3. Uses short, direct sentences and active voice.
4. Sounds confident without hype, exaggeration, or generic agency language.
5. Speaks in business outcomes rather than only deliverables.
6. Reinforces the selected message pillar naturally rather than forcing a pitch.
7. Uses a low-pressure next step appropriate to the selected article objective.
8. Makes only supported claims and does not invent proof.
9. Uses concrete names, examples, and details instead of generic claims.
10. Connects evidence to interpretation: what happened, what is distinctive, and why it matters.
11. Links supplied sources contextually and does not invent citations.
12. Maintains editorial momentum without repetitive summaries, listicle filler, or generic transitions.

For each criterion return "aligned" when it is clearly met or "review" when a specific improvement is advisable. Findings must quote no more than a short phrase from the article. Suggestions must be concrete and concise.

Article to review:
---
${article.slice(0, 24000)}
---

Respond as JSON:
{
  "summary": string,
  "checks": [
    { "criterion": string, "status": "aligned" | "review", "finding": string, "suggestion": string }
  ]
}`;
}

export function editorialReviewTask(article: string): string {
  return `## Task: editorial fact-check and quality review
Review this Editorial Discovery article against its supplied research pack. Do not score it. Evaluate these exact criteria:
1. Every included entry appears in the curated outline and no unselected entry was added.
2. Names, creators, foundries/organizations, and URLs are internally consistent with the research notes.
3. Release timing and claims of being new, notable, popular, or trending are supported rather than assumed.
4. Technical features, quantities, and factual claims are supported; uncertain details are clearly qualified.
5. Each entry explains what it is, what distinguishes it, and why designers should care.
6. The introduction sets the period and creative context without forcing a business problem.
7. The writing avoids repetitive review formulas, generic praise, filler, and invented quotations.
8. Sources are linked contextually and no URL appears invented.
9. Designally's voice is direct, warm, clear, and non-salesy.
10. There is no SEO padding, conversion CTA, or unrelated business-advice framing.

Return "aligned" when a criterion is met or "review" when a concrete editorial correction is needed. Do not claim that you independently opened a link; judge source consistency from the research notes supplied in the article context.

Article:
---
${article.slice(0, 24000)}
---

Respond as JSON:
{
  "summary": string,
  "checks": [
    { "criterion": string, "status": "aligned" | "review", "finding": string, "suggestion": string }
  ]
}`;
}
