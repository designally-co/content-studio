/**
 * Canonical Content Core Pillars for Designally's article platform.
 *
 * This is the single source of truth for the four pillars, their purpose, the
 * content directions that live under each, and example headlines used to steer
 * topic suggestions. The DB (pillars + categories tables) is seeded from this;
 * prompts read pillar context by looking a content direction back up here.
 */

export type ContentPillar = {
  /** Stable slug used to relate content directions back to their pillar. */
  slug: string;
  /** Display order (01–04 in the pillar doc). */
  order: number;
  name: string;
  /** The pillar's one-line promise, e.g. "Everything starts with a strong foundation." */
  tagline: string;
  /** Why this pillar exists — threaded into the article prompt as editorial intent. */
  purpose: string;
  /** Content directions (the selectable sub-categories under the pillar). */
  directions: string[];
  /** Example headlines, used as few-shot guidance when suggesting topics. */
  examples: string[];
};

export const CONTENT_PILLARS: ContentPillar[] = [
  {
    slug: "design",
    order: 1,
    name: "Design",
    tagline: "Everything starts with a strong foundation.",
    purpose:
      "Share design knowledge that helps audiences understand the principles behind design, building a strong foundation for better thinking — not just better outcomes.",
    directions: [
      "Branding Systems",
      "Visual Identity",
      "UX/UI",
      "Design Process",
      "Grid Systems",
      "Typography",
      "Design Psychology",
      "Case Study",
      "Design Critique",
      "Before / After",
    ],
    examples: [
      "Why Good Design Starts Before Sketching",
      "The Power of White Space Isn't About Looking Minimal",
      "Building Design Systems That Scale",
      "Why Most Brand Identities Fail After Launch",
      "Before You Design a Logo, Design the System",
    ],
  },
  {
    slug: "new-update",
    order: 2,
    name: "New Update",
    tagline: "Things worth paying attention to.",
    purpose:
      "Curate and explain industry news, trends, and emerging changes, helping audiences understand why they matter for brands and businesses.",
    directions: [
      "Industry Trends",
      "New Technology",
      "Marketing Shift",
      "Consumer Behavior",
      "Brand Launch",
      "Product Update",
      "Design Tools",
      "Industry Report",
    ],
    examples: [
      "What WWDC Means for Digital Experiences",
      "Why Every Brand Is Talking About AI Agents",
      "Canva Just Changed Brand Collaboration Again",
      "Figma's Latest Feature Explained",
      "What We Learned from This Month's Best Brand Launches",
    ],
  },
  {
    slug: "creative-things",
    order: 3,
    name: "Creative Things",
    tagline: "Why creative decisions work.",
    purpose:
      "Break down the thinking behind creative work, campaigns, and ideas to show that great creativity is always driven by purpose and strategy.",
    directions: [
      "Campaign Breakdown",
      "Packaging",
      "Motion",
      "Creative Direction",
      "Photography",
      "Brand Film",
      "Storytelling",
      "Creative Review",
    ],
    examples: [
      "Why Apple's Ads Feel So Human",
      "Breaking Down Coca-Cola's Creative System",
      "The Story Behind This Packaging Design",
      "Small Details That Changed This Brand",
      "Creative Decisions That Increased Trust",
    ],
  },
  {
    // Slug is a stable internal identifier (links content directions); the
    // display name was changed to "Design with AI" without renaming it.
    slug: "ai-with-design",
    order: 4,
    name: "Design with AI",
    tagline: "AI applied to creative thinking.",
    purpose:
      "Explore how AI can be applied to design and strategy, enabling smarter workflows, greater efficiency, and long-term value creation.",
    directions: [
      "AI Workflow",
      "Strategy + AI",
      "Research",
      "Brand Audit",
      "Productivity",
      "Automation",
      "AI Design",
      "Future of Design",
    ],
    examples: [
      "AI Won't Replace Designers. Weak Systems Will.",
      "Our AI Workflow for Brand Audits",
      "Using ChatGPT Beyond Content Writing",
      "AI as a Thinking Partner",
      "Building Better Creative Systems with AI",
    ],
  },
];

/** All content-direction names across every pillar, in display order. */
export const CONTENT_DIRECTIONS: { pillarSlug: string; name: string }[] =
  CONTENT_PILLARS.flatMap((pillar) =>
    pillar.directions.map((name) => ({ pillarSlug: pillar.slug, name }))
  );

/** Find the pillar a given content direction belongs to (case-insensitive). */
export function pillarForDirection(directionName: string): ContentPillar | null {
  const needle = directionName.trim().toLowerCase();
  return (
    CONTENT_PILLARS.find((pillar) =>
      pillar.directions.some((direction) => direction.toLowerCase() === needle)
    ) ?? null
  );
}

/** One scope line per pillar — its coverage summarised for editorial-scope rules. */
export const EDITORIAL_SCOPE_LINES = CONTENT_PILLARS.map(
  (pillar) => `${pillar.name} — ${pillar.tagline} Covers ${pillar.directions.join(", ")}.`
);
