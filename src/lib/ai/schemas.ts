import { z } from "zod";

/**
 * Thrown when a structured model response fails Zod validation even after one
 * corrective retry. Callers should surface this rather than silently returning
 * partial output. See runJson in src/lib/anthropic.ts.
 */
export class SchemaValidationError extends Error {
  readonly stage: string;
  readonly issues: string;
  constructor(stage: string, issues: string) {
    super(`Structured output for "${stage}" failed validation: ${issues}`);
    this.name = "SchemaValidationError";
    this.stage = stage;
    this.issues = issues;
  }
}

/** Thai (and Lao, which shares the block edge) Unicode range. */
const THAI = /[฀-๿]/;

export function containsThai(value: string): boolean {
  return THAI.test(value);
}

/**
 * Image prompts must always be English regardless of article language — the
 * Fal image models are English-trained. Enforced in the prompt AND here as a
 * hard refinement so a Thai prompt is rejected rather than sent downstream.
 */
export const englishImagePrompt = z
  .string()
  .min(1, "image prompt is empty")
  .refine((value) => !containsThai(value), {
    message: "image prompt must be English (Thai characters found)",
  });

/** Research candidate shape (spec §5): what the research stage returns per item. */
export const researchTopicSchema = z.object({
  topic: z.string().min(1),
  angle: z.string().min(1),
  rationale: z.string().min(1),
  sourceHint: z.string().optional().default(""),
});

export const researchTopicsSchema = z.object({
  topics: z.array(researchTopicSchema).min(1),
});

export type ResearchTopics = z.infer<typeof researchTopicsSchema>;
