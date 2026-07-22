import { EDITORIAL_SCOPE_LINES } from "@/lib/content-pillars";

export const MOMENTS = [
  { value: "creation", label: "Creation", description: "A business or offer taking shape for the first time." },
  { value: "growth", label: "Growth", description: "A capable business whose brand is holding momentum back." },
  { value: "transformation", label: "Transformation", description: "An established business that has outgrown who it was." },
] as const;

export const AUDIENCE_SEGMENTS = [
  { value: "transformation_mandate", label: "Transformation Mandate", reality: "We've outgrown who we were.", fear: "Failing publicly", message: "Make the case for change to family, board, and future customers." },
  { value: "growth_friction", label: "Growth Friction", reality: "Something is not working, but I can't pinpoint what.", fear: "Wasting money", message: "Make the brand do the selling work so the business can stop competing on price." },
  { value: "institutional_buyer", label: "Institutional Buyer", reality: "We're investing, but nothing is converting.", fear: "Career risk", message: "Deliver the professional result that makes the decision look right." },
  { value: "exacting_founder", label: "Exacting Founder", reality: "Nobody gets it well enough to build it.", fear: "Losing control", message: "Build the brand that matches the founder's level of ambition." },
] as const;

export const MESSAGE_PILLARS = [
  { value: "foundation", label: "Foundation Before Output", message: "Strategy first. Build from one clear root, not decoration on top of a brief." },
  { value: "every_moment", label: "We're There at Every Moment", message: "Creation, Growth, and Transformation with one long-term ally." },
  { value: "simple", label: "Simple Is How We Work", message: "No surprises. Make every stage clear before the next begins." },
  { value: "owners", label: "We Think Like Owners", message: "Choose what genuinely benefits the business, not what merely adds deliverables." },
] as const;

export const ARTICLE_OBJECTIVES = [
  { value: "educate", label: "Educate", description: "Help the reader understand a problem clearly." },
  { value: "authority", label: "Build authority", description: "Share a useful point of view without a sales pitch." },
  { value: "consideration", label: "Create consideration", description: "Help the reader recognize why change may be needed." },
  { value: "conversion", label: "Support conversion", description: "Lead naturally toward a low-risk next step." },
] as const;

// Editorial scope is derived from the four Content Core Pillars so the prompt
// and the app's selectable content directions can never drift apart.
export const EDITORIAL_SCOPE = EDITORIAL_SCOPE_LINES;

export const EDITORIAL_SCOPE_TEXT = EDITORIAL_SCOPE.map((item) => `- ${item}`).join("\n");

export type MomentOfChange = (typeof MOMENTS)[number]["value"];
export type AudienceSegment = (typeof AUDIENCE_SEGMENTS)[number]["value"];
export type MessagePillar = (typeof MESSAGE_PILLARS)[number]["value"];
export type ArticleObjective = (typeof ARTICLE_OBJECTIVES)[number]["value"];

export type BrandStrategy = {
  purpose: string;
  positioning: string;
  values: string;
  voice: string;
  audiences: string;
  messaging: string;
  additionalGuidelines: string;
};

export const DEFAULT_BRAND_STRATEGY: BrandStrategy = {
  purpose: "Translate ideas and dreams into reality by helping brands attune to their essence and build something that truly matters.",
  positioning: "Designally builds the strategic foundation businesses need to grow, not just work that looks good. We begin by understanding the person and business reality behind the brief.",
  values: "Simplicity Is Our Standard\nCreativity With Purpose\nUnderstanding Drives Everything\nBuilt to Last\nAlways offer only what really benefits the client.",
  voice: "Direct but warm. Confident, not loud. Empathy first. Simple, not simplistic. Honest, not salesy. Ally, not authority. Use short sentences and active voice. Name the problem before the solution. Start with the client's reality, never with Designally. Thai should sound owner-to-owner, not like a corporate report.",
  audiences: AUDIENCE_SEGMENTS.map((item) => `${item.label}: ${item.reality} Core fear: ${item.fear}. ${item.message}`).join("\n"),
  messaging: MESSAGE_PILLARS.map((item) => `${item.label}: ${item.message}`).join("\n"),
  additionalGuidelines: `Tagline: More Than Creative. We Build What Matters.
Thai: ไม่ใช่แค่ครีเอทีฟ — เราสร้างสิ่งที่ธุรกิจต้องการจริงๆ
Editorial territory follows the four Content Core Pillars: Design (design principles, systems, and craft); New Update (industry news, trends, and emerging changes); Creative Things (the thinking behind creative work and campaigns); and AI with Design (applying AI to design and strategy).
Avoid generic claims such as innovative or cutting-edge. Never fabricate proof, oversell results, or lead with credentials.`,
};

const FIELD_ORDER: (keyof BrandStrategy)[] = [
  "purpose",
  "positioning",
  "values",
  "voice",
  "audiences",
  "messaging",
  "additionalGuidelines",
];

const LABELS: Record<keyof BrandStrategy, string> = {
  purpose: "Purpose",
  positioning: "Positioning",
  values: "Values",
  voice: "Voice",
  audiences: "Audience Segments",
  messaging: "Message Pillars",
  additionalGuidelines: "Additional Guidelines",
};

export function serializeBrandStrategy(strategy: BrandStrategy): string {
  return FIELD_ORDER.map((key) => `## ${LABELS[key]}\n${strategy[key].trim()}`).join("\n\n");
}

export function parseBrandStrategy(value: string): BrandStrategy {
  if (!value.trim() || !value.includes("## Purpose")) {
    return { ...DEFAULT_BRAND_STRATEGY, additionalGuidelines: value.trim() || DEFAULT_BRAND_STRATEGY.additionalGuidelines };
  }
  const result = { ...DEFAULT_BRAND_STRATEGY };
  for (const key of FIELD_ORDER) {
    const label = LABELS[key].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = new RegExp(`## ${label}\\n([\\s\\S]*?)(?=\\n\\n## |$)`).exec(value);
    if (match) result[key] = match[1].trim();
  }
  return result;
}

export function strategySelectionContext(input: {
  moment?: MomentOfChange;
  audienceSegment?: AudienceSegment;
  messagePillar?: MessagePillar;
  articleObjective?: ArticleObjective;
}): string[] {
  const moment = MOMENTS.find((item) => item.value === input.moment);
  const audience = AUDIENCE_SEGMENTS.find((item) => item.value === input.audienceSegment);
  const pillar = MESSAGE_PILLARS.find((item) => item.value === input.messagePillar);
  const objective = ARTICLE_OBJECTIVES.find((item) => item.value === input.articleObjective);
  return [
    moment && `Moment of Change: ${moment.label} — ${moment.description}`,
    audience && `Primary audience: ${audience.label}. Their reality: “${audience.reality}” Their core fear: ${audience.fear}. Strategic message: ${audience.message}`,
    pillar && `Message pillar: ${pillar.label} — ${pillar.message}`,
    objective && `Article objective: ${objective.label} — ${objective.description}`,
    "Publishing path: Write a complete article for Designally's article platform. Social media will share the published article; do not turn the article into a social post.",
  ].filter((line): line is string => Boolean(line));
}
