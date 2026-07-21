export type BrandReviewCheck = {
  criterion: string;
  status: "aligned" | "review";
  finding: string;
  suggestion: string;
};

export type BrandReviewResult = {
  summary: string;
  checks: BrandReviewCheck[];
};
