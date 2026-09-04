export const IMAGE_DIRECTIONS = [
  { value: "auto", label: "Recommended", description: "Choose the strongest framing from the article." },
  { value: "editorial_cover", label: "Editorial cover", description: "A single conceptual hero image." },
  { value: "subject_collage", label: "Subject collage", description: "Several objects in one composed relationship." },
  { value: "conceptual_illustration", label: "Conceptual illustration", description: "Express the article’s central idea as a metaphor." },
  { value: "realistic_scene", label: "Staged scene", description: "An art-directed scene, deliberately composed rather than documentary." },
  { value: "minimal_graphic", label: "Minimal graphic", description: "One strong visual idea, heavy negative space." },
] as const;

export type ImageDirection = (typeof IMAGE_DIRECTIONS)[number]["value"];

/*
 * ONE VISUAL DIRECTION, NOT SEVEN.
 *
 * This file used to carry seven named art-direction presets — editorial studio,
 * retro-futurist, tactile flat-lay, a Designally house style, and so on — each
 * a different look, chosen per article. That produced variety between articles
 * at the cost of the thing variety is supposed to serve: a recognisable
 * character. Two pieces could look like they came from different publications.
 *
 * The brand now specifies a single direction, Conceptual Editorial, and gets
 * its range from subject and composition rather than from switching styles.
 * That is the "Flexibility" criterion below: one visual language that adapts,
 * not a menu of languages.
 */

export const VISUAL_DIRECTION = {
  name: "Conceptual Editorial",
  summary:
    "Surreal, art-directed imagery that transforms abstract ideas into unexpected visual stories.",
} as const;

/** The four criteria the finished image is judged against. */
export const IMAGE_CRITERIA = [
  {
    id: "01",
    name: "Strategy",
    principle:
      "Create concept-driven visuals that communicate an idea through metaphor, contrast, or unexpected relationships.",
  },
  {
    id: "02",
    name: "Aesthetic",
    principle:
      "Develop a distinctive editorial art direction with surreal compositions, refined styling, controlled color, and a strong visual point of view.",
  },
  {
    id: "03",
    name: "Elaboration",
    principle:
      "Build visual depth through thoughtful composition, unexpected scale, layered details, and meaningful visual relationships.",
  },
  {
    id: "04",
    name: "Flexibility",
    principle:
      "Create a visual language that can adapt across different subjects, compositions, and formats while maintaining a consistent brand character.",
  },
] as const;

/** What the direction actually looks like, in the order it should be applied. */
export const IMAGE_CHARACTERISTICS = [
  {
    name: "Conceptual, Not Literal",
    rule: "Use visual metaphors and unexpected associations rather than directly illustrating the subject.",
  },
  {
    name: "Surreal but Controlled",
    rule: "Introduce unusual elements while maintaining a deliberate composition and clear visual hierarchy.",
  },
  {
    name: "Unexpected Scale",
    rule: "Play with proportion and scale to create visual tension and curiosity.",
  },
  {
    name: "Strong Composition",
    rule: "Use negative space, focal points, and intentional framing to create an editorial feel.",
  },
  {
    name: "Art-Directed Styling",
    rule: "Carefully control styling, setting, lighting, materials, and poses.",
  },
  {
    name: "Slightly Uncanny",
    rule: "Create a sense of intrigue through subtle visual unfamiliarity without becoming chaotic or disturbing.",
  },
  {
    name: "Editorial, Not Commercial",
    rule: "Aim for the quality and visual language of a creative magazine or fashion editorial rather than conventional advertising or stock photography.",
  },
] as const;

export const OVERALL_PRINCIPLE =
  "AI-generated visuals should feel editorial, conceptual, and art-directed — not artificial.";

/** The direction as a prompt block, so every stage states it identically. */
export const visualDirectionBlock = (): string =>
  [
    `Visual direction: ${VISUAL_DIRECTION.name} — ${VISUAL_DIRECTION.summary}`,
    "",
    "Key characteristics:",
    ...IMAGE_CHARACTERISTICS.map((c) => `- ${c.name} — ${c.rule}`),
    "",
    `Overall principle: ${OVERALL_PRINCIPLE}`,
  ].join("\n");

export type ArticleVisualBrief = {
  articleType: "typography" | "ux_ui" | "tools" | "design_principles" | "branding" | "websites" | "trend" | "other";
  articleStructure: "roundup" | "resources" | "releases" | "comparison" | "explainer" | "profile" | "trend";
  /** The metaphor the image turns on — the "concept, not literal" decision. */
  concept: string;
  conceptReason: string;
  /**
   * Other metaphors the same article could turn on, each distinct in mechanism
   * from `concept` and from each other.
   *
   * These exist so that asking for four images produces four ideas rather than
   * four renders of one idea. Generation used to send a single prompt N times
   * and let the sampler differ; that yields near-copies, which is no choice at
   * all for an editor picking one cover.
   */
  alternateConcepts: string[];
  imageRole: string;
  mainSubject: string;
  namedSubjects: string[];
  visualCharacteristics: string[];
  composition: string;
  mood: string;
  mustInclude: string[];
  mustAvoid: string[];
  referenceGuidance: string;
};

/** One image prompt and the concept it realises. */
export type ImagePromptVariant = {
  concept: string;
  prompt: string;
};

export type DraftedImagePrompt = {
  /** `variants[0].prompt` — the one shown in the editable field. */
  prompt: string;
  brief: ArticleVisualBrief;
  /** One entry per requested variation, each a different concept. */
  variants: ImagePromptVariant[];
};

/** Never write more prompts than the providers will render in one go. */
export const MAX_PROMPT_VARIANTS = 4;

/**
 * Restate the direction and the brief's hard constraints on a finished prompt.
 *
 * The image model never sees the task that wrote the prompt — only this string
 * — so anything the direction requires has to survive into it. The concept
 * leads, because the whole point of the direction is that the image is not a
 * picture of the subject.
 *
 * Every variant is finished identically, so the difference between them is the
 * concept and nothing else.
 */
export const finishImagePrompt = (
  written: string,
  brief: ArticleVisualBrief,
  concept: string
): string =>
  `${written.trim()}\n\n${visualDirectionBlock()}\n\nConcept the image must carry: ${concept}. Anchor subject: ${brief.mainSubject}. Must include: ${brief.mustInclude.join(", ") || brief.mainSubject}. Avoid: ${brief.mustAvoid.join(", ") || "readable text, invented logos, stock-photography framing"}.`;
