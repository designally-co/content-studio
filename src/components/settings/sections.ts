/**
 * The settings sections, named once.
 *
 * Its own module because the loader, the sheet and the account menu all need
 * it: the sheet imports the loader, so a type declared in the sheet and read by
 * the loader would close a circle. Nothing here imports anything.
 */
export type SettingsSection = "brand" | "content" | "api";

export const SECTION_LABELS: Record<SettingsSection, string> = {
  brand: "Brand",
  content: "Content",
  api: "API & models",
};
