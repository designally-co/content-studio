import { redirect } from "next/navigation";

/** /settings has no content of its own — Brand is the first section. */
export default function SettingsIndex() {
  redirect("/settings/brand");
}
