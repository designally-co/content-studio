export const ARTICLE_MODES = [
  { value: "editorial", label: "Editorial Discovery", description: "Research and curate fonts, tools, resources, projects, and creative-industry developments." },
  { value: "brand_insight", label: "Brand Insight", description: "Business-focused Designally thought leadership built from audience and brand strategy." },
] as const;

export const EDITORIAL_FORMATS = [
  { value: "roundup", label: "Monthly or timely roundup" },
  { value: "resources", label: "Curated resource list" },
  { value: "releases", label: "New releases" },
  { value: "comparison", label: "Tool comparison" },
  { value: "explainer", label: "Design explainer" },
  { value: "profile", label: "Project or studio profile" },
  { value: "trend", label: "Trend analysis" },
] as const;

export type ArticleMode = (typeof ARTICLE_MODES)[number]["value"];
export type EditorialFormat = (typeof EDITORIAL_FORMATS)[number]["value"];

export type EditorialCandidate = {
  id: string;
  name: string;
  creator: string;
  organization: string;
  officialUrl: string;
  sourceUrl: string;
  releaseEvidence: string;
  concreteDetails: string[];
  distinctive: string;
  whyItMatters: string;
  confidence: "confirmed" | "needs_review";
};
