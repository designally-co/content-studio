import { LogOut } from "lucide-react";
import { logoutAction } from "@/app/actions";
import { requireUser } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Section, Plate } from "../section";

/**
 * Who you are, and the way out. Nothing else.
 *
 * This page used to manage the team: create an account, set a password, set a
 * role, disable, delete. All five went with password sign-in. Access is a
 * Designally Workspace account now, which means it is granted and revoked in
 * Google — an account this app could disable while the Workspace login still
 * worked would be a second, weaker answer to a question Google already owns.
 *
 * The name is gone from the line too. It came from whatever the provider
 * vouched for, which for the shared team account is the address itself, so the
 * card printed the same string twice. The email is the identity here.
 */
export default async function AccountSettingsPage() {
  const currentUser = await requireUser();

  return (
    <Section title="Account">
      <Plate className="flex flex-wrap items-center justify-between gap-4">
        <p className="min-w-0 truncate text-sm font-medium text-ink">{currentUser.email}</p>
        <form action={logoutAction}>
          <Button type="submit" variant="outline">
            <LogOut /> Sign out
          </Button>
        </form>
      </Plate>
    </Section>
  );
}
