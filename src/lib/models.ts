/**
 * The text models this product offers, most capable first.
 *
 * IN CODE, NOT IN THE PRICING TABLE. The settings dropdown used to list
 * whatever `pricing` happened to hold, which put a cost-reference table in
 * charge of what the product supports: on any database where pricing was
 * unseeded or trimmed, the control opened to ZERO options and could not even
 * display the model already configured. Which models exist is a fact about the
 * code; what they cost is a fact about the account, and they are not the same
 * fact.
 *
 * ITS OWN MODULE, IMPORTING NOTHING. These first lived in lib/anthropic, which
 * opens a database connection and constructs the SDK client — so the moment the
 * settings form (a client component) imported one string from it, Turbopack
 * pulled drizzle and the whole db layer toward the browser bundle and failed to
 * compile. A constant shared across the server/client line has to sit somewhere
 * that carries no weight.
 */
export const TEXT_MODELS = [
  "claude-opus-5",
  "claude-sonnet-5",
  "claude-haiku-4-5",
] as const;

export const DEFAULT_RESEARCH_MODEL = "claude-haiku-4-5";
export const DEFAULT_DRAFTING_MODEL = "claude-sonnet-5";
