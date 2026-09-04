/**
 * Limits that both the stage and the server action have to agree on.
 *
 * Not in `image-actions.ts` with the action that enforces it: a `"use server"`
 * module may only export async functions, so a constant shared with the client
 * has to live outside it. Not in `reference-sources.ts` either — that module is
 * `server-only`, and the dock needs this number to decide whether to offer the
 * search at all.
 */

/**
 * How many references one search may attach to an article.
 *
 * Well below what the editing models accept (fourteen and ten). Those models
 * preserve what they are shown, so a large set does not ground the image, it
 * dilutes it: every extra reference is another subject competing to survive
 * into the frame. Four is enough to stop a cover reading as generic, and few
 * enough that an editor can look at each one and decide whether it belongs.
 */
export const MAX_FOUND_REFERENCES = 4;
