export const IMAGE_DIRECTIONS = [
  { value: "auto", label: "Recommended", description: "Choose the strongest direction from the article." },
  { value: "editorial_cover", label: "Editorial cover", description: "A clear publication-style hero image." },
  { value: "subject_collage", label: "Subject collage", description: "Bring several featured resources or objects together." },
  { value: "conceptual_illustration", label: "Conceptual illustration", description: "Express the article’s central idea visually." },
  { value: "realistic_scene", label: "Realistic scene", description: "Place the real subject in a credible environment." },
  { value: "minimal_graphic", label: "Minimal graphic", description: "Use a restrained composition with one strong visual idea." },
] as const;

export type ImageDirection = (typeof IMAGE_DIRECTIONS)[number]["value"];

export const ART_DIRECTION_PRESETS = [
  {
    value: "auto",
    label: "Recommended from article",
    description: "Match the visual style to the finished article’s meaning.",
  },
  {
    value: "abstract_insight",
    label: "Abstract insight",
    description: "Bold conceptual art for trends, reports, and industry analysis.",
  },
  {
    value: "metaphorical_editorial",
    label: "Editorial metaphor",
    description: "Human, poetic illustration for principles, process, and creative challenges.",
  },
  {
    value: "editorial_studio",
    label: "Editorial studio",
    description: "35mm-style studio photography for profiles, showcases, and interviews.",
  },
  {
    value: "retro_futurist",
    label: "Retro-futurist technology",
    description: "Surreal art direction for AI, software, and the future of design.",
  },
  {
    value: "tactile_flat_lay",
    label: "Tactile flat-lay",
    description: "Styled, expressive product photography for fonts, tools, books, and resource collections.",
  },
  {
    value: "interface_showcase",
    label: "Interface showcase",
    description: "Layered editorial interface compositions for websites and digital products.",
  },
  {
    value: "designally_ci",
    label: "Designally house style",
    description: "One bold object on a calm field with a single orange accent — the Designally system.",
  },
] as const;

export type ArtDirectionSelection = (typeof ART_DIRECTION_PRESETS)[number]["value"];
export type ArtDirectionPreset = Exclude<ArtDirectionSelection, "auto">;

/**
 * Former fixed house palette. No longer applied to prompts — image color is
 * left free/expressive per article. Kept here for reference; re-inject it into
 * imagePromptTask / the final prompt if a consistent palette is ever wanted.
 */
export const DESIGNALLY_IMAGE_PALETTE =
  "warm off-white, charcoal black, muted terracotta orange, and restrained sage green";

/**
 * Art-direction guides in the spirit of a creative-industry publication
 * (Creative Boom / It's Nice That / Eye on Design): high variety across
 * pieces, expressive and story-specific color (bold OR muted as the subject
 * demands — never a fixed house palette), and real photographic or crafted
 * quality over trendy AI stylization. Each guide fixes the medium and intent
 * but deliberately leaves color, materials, and mood free for the article.
 */
export const ART_DIRECTION_GUIDE: Record<ArtDirectionPreset, string> = {
  abstract_insight:
    "Bold conceptual composition — sculptural 3D forms, cut-paper shapes, or graphic abstraction — expressing balance, structure, tension, or change. Commit to a striking, story-specific color choice (saturated or restrained, whatever the subject calls for); vary materials, lighting, and mood between pieces. Gallery-grade art direction, never literal charts or graph clip-art.",
  metaphorical_editorial:
    "One strong human-centered visual metaphor as contemporary editorial illustration. Range freely across styles — screenprint, risograph, cut-paper collage, bold flat color, gouache, textured grain — and choose color for impact, not restraint. Poetic and distinctive without becoming obscure.",
  editorial_studio:
    "Authentic editorial or documentary photography of a real creative subject, workspace, portrait, or object. 35mm/medium-format character, genuine light (natural, hard, or deliberately colored), tactile detail, real texture. Feels shot for a design magazine, not a stock library — no posed stock clichés.",
  retro_futurist:
    "Surreal, high-concept composition blending an organic or analogue creative object with a digital element; imaginative materials and confident color (pastel, neon, or bold — the subject decides), avant-garde and future-facing. No robots, holographic hands, neon-blue grids, or generic sci-fi UI.",
  tactile_flat_lay:
    "Styled product or flat-lay photography of the article's real creative objects — type specimens, books, tools, prints, swatches. Rich texture, intentional color styling (bold and playful or quiet and tonal as fits the set), directional light and real shadow. Lifestyle-magazine quality, not sterile catalogue minimalism.",
  interface_showcase:
    "Editorial composition of layered browser-like frames and modular interface surfaces in an expressive arrangement; real material texture, confident color, depth and soft studio light. Contemporary design-publication art direction. No readable UI text, invented logos, or generic device mockups.",
  designally_ci:
    "Designally house style: one single object or one clear idea per frame — never a collage — presented as a bold hero on a calm, flat field of near-black charcoal (#1B1D23), steel blue (#097EF6), or warm off-white (#F3F3F3). Real material and directional studio light; an intelligent, timeless, expansive mood with generous negative space and Swiss/geometric discipline. Introduce exactly ONE Designally-orange accent (#EF6148) as a deliberate 'cut' — a single thin line or one dot, never more. An optional brushed-silver / chrome element can add a premium editorial feel. No clutter, no busy patterns, no readable text, and no logos (the D. signature is composited separately).",
};

export type ArticleVisualBrief = {
  articleType: "typography" | "ux_ui" | "tools" | "design_principles" | "branding" | "websites" | "trend" | "other";
  articleStructure: "roundup" | "resources" | "releases" | "comparison" | "explainer" | "profile" | "trend";
  artDirection: ArtDirectionPreset;
  artDirectionReason: string;
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

export type DraftedImagePrompt = {
  prompt: string;
  brief: ArticleVisualBrief;
};
