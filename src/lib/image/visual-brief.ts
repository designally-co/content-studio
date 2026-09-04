/**
 * One job: find a photograph of the scene, then make a picture like it.
 *
 * This file used to carry two visual directions, six composition presets,
 * four judging criteria, seven style characteristics, and a fourteen-field
 * brief. Every one of them was a decision the editor had to make or the model
 * had to weigh, and together they buried the only thing that turned out to
 * matter: a real photograph of the situation, and an image of the same kind.
 *
 * What is left is that, and nothing else. An article about designers working
 * with AI finds a photograph of a designer at a desk and produces a picture of
 * a designer at a desk — a different person, a different room, the same kind
 * of picture. No metaphor, no framing preset, no mode to choose.
 */

/** What the finished image is: a photograph, not an illustration or a render. */
export const IMAGE_DIRECTION = {
  name: "Grounded Editorial",
  summary:
    "A real, believable scene from the world the article describes, photographed rather than imagined.",
} as const;

/**
 * The rules the prompt writer works to.
 *
 * Six lines, not six paragraphs. These reach Claude, never the image model —
 * see `finishImagePrompt` for what the image model is actually sent, and why
 * the difference matters.
 */
export const IMAGE_RULES = [
  "Show the real subject: the people, tools and places the article is actually about, doing the thing it describes.",
  "Match the reference photograph in kind — same sort of subject, setting, activity, framing and light. A different person in a different room on a different day, recognisably the same kind of picture.",
  "Photographic, not rendered: one light source that makes sense, natural falloff, believable depth of field, honest skin and surface texture.",
  "An ordinary moment: a person mid-task rather than posed, hands doing something, the small untidiness of a real desk.",
  "The colours the setting would really have. No neon, no gradient backdrop, no teal-and-orange grade.",
  "Nothing surreal, symbolic, floating, or impossible. If it could not exist in the room, it does not belong.",
] as const;

/** Never write more prompts than the providers will render in one go. */
export const MAX_PROMPT_VARIANTS = 4;

/**
 * What the model reads the article for.
 *
 * Four fields. Everything the old brief carried besides these — article type,
 * structure, image role, mood, composition, visual characteristics, named
 * subjects, reference guidance, the reason for the concept — was either never
 * read by anything downstream or read only to be shown back to the editor in a
 * panel nobody acted on.
 */
export type ArticleVisualBrief = {
  /**
   * What the attached reference photograph actually shows, in one sentence.
   * Empty when nothing is attached.
   */
  referenceScene: string;
  /** The scene this article's image should show — a moment, not a metaphor. */
  scene: string;
  /** Other real scenes from the same world, one per extra variation. */
  alternateScenes: string[];
  /**
   * Three to six words to search a stock library with, describing the
   * situation: "designer working at desk laptop". Not the topic — the picture.
   */
  photoQuery: string;
};

/** One image prompt and the scene it shows. */
export type ImagePromptVariant = {
  scene: string;
  prompt: string;
};

export type DraftedImagePrompt = {
  /** `variants[0].prompt` — the one shown in the editable field. */
  prompt: string;
  brief: ArticleVisualBrief;
  /** One entry per requested variation, each a different scene. */
  variants: ImagePromptVariant[];
};

/**
 * What the image model is sent: the picture, then a short style line.
 *
 * This once appended the whole rule set. Measured on a real brief, the result
 * was 2,088 characters of which 269 described the picture — 13%. The rest was
 * instruction written for the model that WRITES the prompt, handed to the model
 * that draws it, where it is not reasoning but text to represent. On an editing
 * endpoint it is worse: a wall of description competes with the attached
 * photograph and the model generates from the words instead of working from the
 * image, which is exactly the failure this whole file exists to fix.
 *
 * So the rules stay with Claude, and this stays short. The instruction to match
 * the photograph comes last, because last is what gets read.
 */
export const finishImagePrompt = (written: string): string =>
  `${written.trim()}\n\nPhotograph. Natural available light, real materials, ordinary untidiness, believable hands and faces. Not an illustration, not a render, not a stock pose. No readable text or logos. Match the attached photograph: same kind of subject, setting, activity and light. Do not copy it.`;
