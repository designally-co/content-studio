import { asc } from "drizzle-orm";
import { LogOut } from "lucide-react";
import { logoutAction } from "@/app/actions";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { TeamMembersCard } from "../team-members-card";
import { Button } from "@/components/ui/button";
import { Section, Plate } from "../section";

export default async function AccountSettingsPage() {
  const currentUser = await requireUser();
  const isAdmin = currentUser.role === "admin";
  const db = await getDb();
  const teamMembers = isAdmin
    ? await db
        .select({ id: users.id, name: users.name, email: users.email, role: users.role, active: users.active })
        .from(users)
        .orderBy(asc(users.name))
    : [];

  return (
    <>
      {isAdmin && <TeamMembersCard members={teamMembers} currentUserId={currentUser.id} />}
      <Section title="Account">
        <Plate className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">{currentUser.name}</p>
            <p className="mt-0.5 truncate text-sm text-ink-3">{currentUser.email}</p>
          </div>
          <form action={logoutAction}>
            <Button type="submit" variant="outline"><LogOut /> Sign out</Button>
          </form>
        </Plate>
      </Section>
    </>
  );
}
