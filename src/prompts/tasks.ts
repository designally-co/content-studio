import type { Language } from "@/db/schema";
import { EDITORIAL_SCOPE_TEXT } from "@/lib/designally-strategy";
import {
  visualDirectionBlock,
  IMAGE_CRITERIA,
} from "@/lib/image/visual-brief";

/** Task layer — stage-specific instructions. Versioned per template. */
export const TASKS_VERSION = "tasks@2.0.0";

/** How far back a news-driven idea may sit and still count as current. */
const RECENCY_DAYS = 90;

const formatDay = (date: Date) =>
  date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

/**
 * The clock the topic prompts run against. Without it the model has no idea
 * when "now" is, and anchors "timely" on the densest part of its training data.
 */
export function recencyWindow(): { today: string; since: string } {
  const now = new Date();
  return {
    today: formatDay(now),
    since: formatDay(new Date(now.getTime() - RECENCY_DAYS * 24 * 60 * 60 * 1000)),
  };
}

const marketFor = (language: Language) =>
  language === "th"
    ? "the Thai market (search Thai-language sources and current Thailand trends)"
    : "the global/English market";

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
  /** Omit to range across every available direction instead of one. */
  categoryName?: string;
  language: Language;
  pillarName?: string;
  pillarPurpose?: string;
  examples?: string[];
  /** Selectable direction names, required when `categoryName` is omitted. */
  directionNames?: string[];
  /** Today, written out. Without it the model infers "now" from its training data. */
  today: string;
  /** Start of the window a news-driven idea must fall inside to count as current. */
  since: string;
  /** True when the web tool is available and ideas should carry real sources. */
  researchLive?: boolean;
}): string {
  const open = !params.categoryName;
  const scopeLine = open
    // "At least four directions" was raised to force variety, and it also
    // forced the model to research four subjects before it could answer. With
    // three ideas requested the two constraints contradict each other, so this
    // asks for distinctness instead of a count — variety without the breadth
    // tax. See the note on the count below.
    ? `Suggest timely, researchable article ideas from anywhere in Designally's editorial territory in ${marketFor(params.language)}. Make the ideas genuinely distinct from one another rather than variations on one subject.`
    : `Suggest timely, researchable directions for the content direction "${params.categoryName}" in ${marketFor(params.language)}.`;
  const pillarLine = !open && params.pillarName
    ? `\nThis direction lives under the "${params.pillarName}" content pillar${params.pillarPurpose ? ` — ${params.pillarPurpose}` : ""}. Every idea must serve that pillar's intent.`
    : "";
  const examplesBlock = params.examples?.length
    ? `\n\nExample headlines that fit this pillar (match their tone and specificity; do not reuse them verbatim):\n${params.examples.map((example) => `- ${example}`).join("\n")}`
    : "";
  const directionBlock = open
    ? `\n\nAssign every idea to exactly one of these content directions, copying the name verbatim:\n${(params.directionNames ?? []).map((name) => `- ${name}`).join("\n")}`
    : "";
  const directionField = open ? `, "direction": string` : "";
  const sourcesField = params.researchLive ? `, "sources": [{ "name": string, "url": string }]` : "";

  const researchBlock = params.researchLive
    ? `\n\nUse web search before proposing anything news-driven. Confirm that what you are describing has actually happened, and that it happened on or after ${params.since}. For every idea, return 1–3 real sources you actually consulted, copying their URLs exactly. Never fabricate a URL, and never pad the list with a homepage that does not cover the specific development. An evergreen craft idea may return an empty source list.`
    : `\n\nLive source lookup is unavailable for this request. Return an empty source list, favor evergreen craft subjects over news-driven ones, and do not claim that anything is new, recent, trending, or newly released. Do not invent source URLs; live source research happens only after the editor selects a topic.`;

  return `## Task: suggest topics
Today is ${params.today}.

${scopeLine}${pillarLine} Prioritize concrete resources, releases, developments, and genuine questions that matter to designers. Each direction must be specific enough for the next stage to research and useful enough to become a complete creative-industry article.${examplesBlock}${directionBlock}

Stay within Designally's editorial territory:
${EDITORIAL_SCOPE_TEXT}

Anchor every idea in time:
- A news-driven idea — a release, launch, acquisition, industry development, or newly published resource — counts only if it happened on or after ${params.since}. Begin its "whyTimely" with the date or month it happened.
- An evergreen craft idea — a principle, method, system, or reference collection — is welcome, but its "whyTimely" must give a real reason to publish it now and must not dress it up as news.
- Never present something from before ${params.since} as new, recent, or trending, and never state a date you cannot support. If you are unsure when something happened, treat it as evergreen and say so.
- Do not reuse a year or season from memory as a stand-in for the present. The only dates you may treat as current are the ones you can support for this request.${researchBlock}

Favor useful editorial formats such as curated resources, notable new releases, practical reference collections, informed explainers, design-principle analysis, and evidence-led perspectives on changes affecting designers. Reject broad topics that do not have a strong creative-agency or designer angle.

Return exactly 3 topic ideas. For each: a proposed title, the angle, why it is relevant now, and the likely reader intent.

Respond as JSON:
{
  "topics": [
    { "title": string, "angle": string, "whyTimely": string, "searchIntent": string${directionField}${sourcesField} }
  ]
}`;
}

/**
 * Reads an editor's free-text article input. Used at submit time to fill only
 * what the form could not determine on its own: the content direction when the
 * editor left it on auto, and a working title when the input is a brief rather
 * than a usable headline.
 */
export function articleSetupTask(params: {
  text: string;
  needDirection: boolean;
  needTitle: boolean;
  directionNames: string[];
}): string {
  const wants = [
    params.needDirection ? "the content direction it belongs to" : null,
    params.needTitle ? "a working title" : null,
  ].filter(Boolean);

  const directionBlock = params.needDirection
    ? `\n\nChoose exactly one content direction, copying the name verbatim from this list:\n${params.directionNames.map((name) => `- ${name}`).join("\n")}\nPick the direction the finished article would be filed under, not the one the wording superficially resembles.`
    : "";
  const titleBlock = params.needTitle
    ? `\n\nWrite a working title: a specific, factual headline of at most 12 words describing the article this input asks for. Use the editor's own subject and constraints. Do not add claims, numbers, dates, or superlatives the input does not support, and do not write a title that merely restates the instruction ("Article from brief" and similar are unacceptable).`
    : "";

  return `## Task: read the article input
An editor has described the article they want. Determine ${wants.join(" and ")}.

Stay within Designally's editorial territory:
${EDITORIAL_SCOPE_TEXT}

Editor's input:
"""
${params.text}
"""${directionBlock}${titleBlock}

Respond as JSON with only the requested fields.`;
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

export function imagePromptTask(params: {
  title: string;
  visualBrief: import("@/lib/image/visual-brief").ArticleVisualBrief;
  direction: import("@/lib/image/visual-brief").ImageDirection;
  /** The concept THIS prompt realises — the brief's lead concept, or one of its alternates. */
  concept: string;
  /** Where this prompt sits in the set, so it can be told what it must not repeat. */
  variantNo: number;
  variantCount: number;
  siblingConcepts: string[];
  model?: string;
  aspectRatio?: string;
  hasReferenceImage?: boolean;
  /** How many real photographs are attached, and therefore how to speak about them. */
  referenceCount?: number;
  mode: import("@/lib/image/visual-brief").ImageMode;
}): string {
  const conceptual = params.mode === "conceptual";
  return `## Task: turn an article visual brief into an image-generation prompt
Write one model-ready prompt for a single image.

${visualDirectionBlock(params.mode)}

It is judged against these criteria:
${IMAGE_CRITERIA.map((c) => `- ${c.id} ${c.name} — ${c.principle}`).join("\n")}

How to apply them here:
${
  conceptual
    ? `- Lead with THE CONCEPT ASSIGNED BELOW, not the subject, and not the brief's other concepts. The image should make someone think, not caption the article. A piece about type licensing is not a picture of a font; it is a metaphor for permission, ownership, or constraint.
- Give the concept one deliberate surreal move — an impossible juxtaposition, a shifted scale, an object where it does not belong — and let the rest of the frame stay disciplined around it. One strange thing, composed calmly, beats five strange things.
- Be specific about composition: where the subject sits, what is left empty, what the eye reaches first.
- Be specific about styling: setting, materials, surface, light direction and quality, colour relationships. Commit to a palette that belongs to THIS article rather than a house look.
- Aim at the register of a creative magazine or fashion editorial. Not advertising, not stock, not a product shot.`
    : `- Describe THE SCENE ASSIGNED BELOW as a photograph: who is in it, what they are doing with their hands, where they are, what is on the surfaces around them. An article about designers working with AI is a designer at a desk with a laptop — write that, not a symbol for it.
- MATCH THE REFERENCE PHOTOGRAPH IN KIND. It shows the sort of picture this should be: the same kind of subject, the same sort of setting and activity, the same framing and light. Describe a scene a viewer would file alongside it. Not the same person, not the same room, not the same moment — the same kind of picture.
- Write it the way a photographer would be briefed: lens feel and distance, where the light comes from and how hard it is, what is sharp and what falls away, the time of day the room suggests.
- Keep the details ordinary and specific — a cooling coffee, a cable half-coiled, a second monitor turned away, papers that have been moved. Specific ordinary detail is what makes a photograph read as real.
- Colours the room would really have. No neon, no gradient backdrop, no teal-and-orange grade, no lens flare.
- Do not describe it as art, as conceptual, as surreal, or as a metaphor. It is a photograph of something that happened.`
}

Hard limits:
- No readable text, letterforms as words, invented logos, or counterfeit interfaces. Without a reference image, never claim exact fidelity to a real typeface, product, or UI — interpret instead.
${
  conceptual
    ? `- Nothing disturbing. "Slightly uncanny" means intriguing, not unsettling.
- No agency offices, handshakes, lightbulbs, rockets, growth arrows, glowing blue grids, or robots.`
    : `- Nothing surreal, impossible, floating, or symbolic. If a detail could not exist in the room, it does not belong in the prompt.
- No handshakes, no lightbulbs, no rockets, no growth arrows, no glowing blue grids, no robots, no holograms.
- Hands, screens and faces must be plausible. Say so in the prompt: natural hands, an ordinary screen, no rendered perfection.`
}

Title: ${params.title}
Requested framing: ${params.direction}

${conceptual ? "THE CONCEPT THIS IMAGE MUST CARRY" : "THE SCENE THIS IMAGE MUST SHOW"} (image ${params.variantNo} of ${params.variantCount}):
${params.concept}
${
  params.siblingConcepts.length > 0
    ? `\nThe other images in this set take these${conceptual ? " concepts" : " scenes"}. Yours must be a different picture from each of them — a different moment, a different vantage, a different part of the work — while staying the same kind of scene as the reference. An editor is choosing between them, so overlap wastes a slot:\n${params.siblingConcepts.map((c) => `- ${c}`).join("\n")}\n`
    : ""
}
Visual brief (context — take the constraints from it, but take the concept from above): ${JSON.stringify(params.visualBrief)}
Model: ${params.model ?? "Not specified"}
Aspect ratio: ${params.aspectRatio ?? "1:1"}
Reference images: ${
    (params.referenceCount ?? 0) > 0
      ? `${params.referenceCount} attached. They are REAL photographs — the lead images of the sources this article cites, or openly licensed work matched to its subject.

How to use them, which is not how it sounds:
- Take MATERIAL from them: surface, texture, weight, wear, how light falls on the actual thing. That is what a generated image lacks and why it reads as synthetic.
- Take ACCURACY from them where the article names a real specimen, product, or interface — the proportions and details a description would only approximate.
- Do NOT take the composition. These are somebody else's photographs, and the frame you are specifying is a new one that carries the concept above. If the prompt could be satisfied by reproducing a reference, it is the wrong prompt.
- Say in the prompt which qualities are drawn from the references, so the model reads them as material rather than as a picture to repeat.`
      : "None. Nothing is attached, so do not claim exact fidelity to any real typeface, product, or interface — interpret instead."
  }

Respond with the image prompt only — one paragraph, no quotes, no preamble.`;
}

export function articleVisualBriefTask(params: {
  title: string;
  article: string;
  direction: import("@/lib/image/visual-brief").ImageDirection;
  hasReferenceImage: boolean;
  mode: import("@/lib/image/visual-brief").ImageMode;
}): string {
  const conceptual = params.mode === "conceptual";
  return `## Task: extract a visual brief from a finished article
${
  conceptual
    ? "Read the article and decide what its image should MEAN, then what it should show. Both come from the article; neither is a summary of it."
    : "Read the article and decide what REAL SCENE its image should show — the world the article is about, as a photograph taken in it."
}

${visualDirectionBlock(params.mode)}

${
  conceptual
    ? `The most important field is \`concept\`: the metaphor, contrast, or unexpected relationship the image turns on. Write it as an idea, not a scene — "permission granted and withdrawn", "a structure holding something that does not need holding", "precision that arrives at the wrong answer". Then let \`mainSubject\`, \`composition\` and \`mood\` realise it.

What that rules out: a picture of the thing the article is about. An article on colour contrast is not swatches; an article on design systems is not a component grid. If the brief could be satisfied by stock photography of the subject, the concept is not doing its job.`
    : `The most important field is \`concept\`, and here it holds A SCENE, not a metaphor: one sentence describing a real moment a photographer could have walked in on. "A designer at a desk, laptop open, sketching over a printout while a generated layout sits on the second screen." Name the person, what their hands are doing, where they are, and what is around them.

What that rules out: symbols and abstractions. An article about designers using AI is not a glowing brain, a robot hand, or a floating interface — it is a designer working. An article about type licensing is not a metaphor for permission; it is somebody at a screen with a foundry's licence page open, or a drawer of metal type in a workshop. If a reader could not say what is happening in the picture, the scene is not doing its job.

Two things the scene must be: about the article's real subject, and ordinary enough to be believable. A slightly untidy desk beats a styled one.`
}

${
  conceptual
    ? "Then write \`alternateConcepts\`: two or three OTHER ideas the same article could turn on, written the same way. They are not variations of the lead concept and not restatements of it — each must work by a different mechanism, so that images made from them look nothing alike. If the lead concept is a contrast, an alternate should be a substitution or an absence rather than another contrast. An editor will choose between the finished images, so two concepts that would produce similar frames are one wasted choice."
    : "Then write \`alternateConcepts\`: two or three OTHER real scenes from the same world, written the same way. Not the same moment from another angle — a different moment: a different part of the work, a different room, a different pair of hands, a different time of day. An editor is choosing between the finished photographs, so two scenes that would produce the same picture are one wasted choice."
}

Write \`photoQuery\`: three to six words to search a stock photo library with, describing the SCENE and nothing else — "designer working at desk laptop", "typographer inspecting metal type", "team reviewing wireframes on wall". No brand names, no abstract nouns, no adjectives about mood. This phrase is used to find the reference photograph the finished image will be matched against, so it must describe a situation a photographer would actually have shot.

Keep the article's real named subjects in \`namedSubjects\` even when the image is metaphorical — they constrain what the metaphor may claim, and they matter if a reference image is attached later.

${
  conceptual
    ? "In \`mood\` and \`visualCharacteristics\`, commit to a specific palette, material and light for THIS article. Controlled, not muted by default; a strong point of view is one of the criteria. Do not reach for a uniform beige studio look, and do not carry a palette over from other articles."
    : "In \`mood\` and \`visualCharacteristics\`, describe the real conditions of the scene: the light the room would have at that hour, the materials actually on the desk, the colours the setting would really be. Not a palette chosen for effect — the one that is there."
}

Requested framing: ${params.direction}
Reference image available: ${params.hasReferenceImage ? "yes" : "no"}
Finished title: ${params.title}

Finished article:
---
${params.article}
---

Framing rules — these govern the composition, never the literalness:
- auto: choose the framing that carries the concept best.
- editorial_cover: one conceptual hero image.
- subject_collage: several objects placed in a deliberate relationship to each other.
- conceptual_illustration: the central idea as metaphor, most abstract of the set.
- realistic_scene: a staged, art-directed scene — composed for the camera, never documentary.
- minimal_graphic: one idea, heavy negative space.

Return articleStructure as one of roundup, resources, releases, comparison, explainer, profile, or trend. ${
  conceptual
    ? "Return \`concept\` and one sentence in \`conceptReason\` explaining what it lets the image say that a literal picture could not."
    : "Return \`concept\` and one sentence in \`conceptReason\` explaining what a reader learns about the article from seeing this scene."
} Return \`alternateConcepts\` and \`photoQuery\` as described above.

For typography, UI, websites, branding, or products, note in \`referenceGuidance\` when a real specimen or screenshot would be needed for accuracy. In \`mustAvoid\`, exclude readable generated text, invented logos, counterfeit interfaces, generic offices, charts, rockets, lightbulbs, handshakes, robots, and glowing-grid technology imagery.`;
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
