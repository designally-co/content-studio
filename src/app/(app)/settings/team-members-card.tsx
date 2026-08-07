"use client";

import { useActionState } from "react";
import {RotateCcw, Trash2, UserPlus, UserRoundCheck, UserRoundX} from "lucide-react";
import { manageTeamMemberAction, type TeamActionState } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Section, Plate } from "./section";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
};

export function TeamMembersCard({ members, currentUserId }: { members: TeamMember[]; currentUserId: string }) {
  const [state, formAction, pending] = useActionState<TeamActionState, FormData>(manageTeamMemberAction, {});

  return (
    <Section
      title="Team members"
      description="Create accounts and manage access to Content Studio."
    >
      <div className="space-y-4">
        <Plate>
        <form action={formAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1.2fr_1fr_auto_auto] lg:items-end">
          <input type="hidden" name="intent" value="create" />
          <div className="grid gap-2">
            <Label htmlFor="member-name">Name</Label>
            <Input id="member-name" name="name" autoComplete="off" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="member-email">Email</Label>
            <Input id="member-email" name="email" type="email" autoComplete="off" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="member-password">Initial password</Label>
            <Input id="member-password" name="password" type="password" minLength={8} autoComplete="new-password" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="member-role">Role</Label>
            <Select name="role" defaultValue="member">
              <SelectTrigger id="member-role"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={pending}><UserPlus data-icon="inline-start" />Add user</Button>
        </form>

        {state.error && <p className="mt-4 text-sm text-danger-ink" role="alert">{state.error}</p>}
        {state.success && <p className="mt-4 text-sm text-ok-ink" role="status">{state.success}</p>}
        </Plate>

        <Plate className="divide-y divide-line">
          {members.map((member) => {
            const isCurrent = member.id === currentUserId;
            return (
              <div key={member.id} className="py-5 first:pt-0 last:pb-0">
                {/* Identity on its own line, controls beneath. They shared a row
                    before, going horizontal at the lg VIEWPORT breakpoint while
                    the real column is ~616px — the rigid controls took all of
                    it, flex-1 collapsed the name to zero width, and the name
                    text spilled out over the role select. */}
                <div className="space-y-3.5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-ink">{member.name}</p>
                      {isCurrent && <Badge variant="secondary">You</Badge>}
                      {!member.active && <Badge variant="destructive">Disabled</Badge>}
                    </div>
                    <p className="mt-0.5 truncate text-sm text-ink-3">{member.email}</p>
                  </div>

                  <div className="flex flex-wrap items-end gap-2">
                  <form action={formAction} className="flex items-end gap-2">
                    <input type="hidden" name="intent" value="role" />
                    <input type="hidden" name="userId" value={member.id} />
                    <div className="grid gap-1.5">
                      <Label htmlFor={`role-${member.id}`} className="text-xs">Role</Label>
                      <Select name="role" defaultValue={member.role} disabled={isCurrent || pending}>
                        <SelectTrigger id={`role-${member.id}`} className="w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="member">Member</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button type="submit" variant="outline" disabled={isCurrent || pending}>Update</Button>
                  </form>

                  <details className="group w-full sm:w-auto">
                    <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-full px-4 text-sm font-semibold text-ink hover:bg-sunken focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                      <RotateCcw className="size-4" />Reset password
                    </summary>
                    <form action={formAction} className="mt-3 flex w-full flex-col gap-2 rounded-lg bg-sunken p-3 sm:flex-row sm:items-end">
                      <input type="hidden" name="intent" value="password" />
                      <input type="hidden" name="userId" value={member.id} />
                      <div className="grid min-w-0 flex-1 gap-1.5">
                        <Label htmlFor={`password-${member.id}`} className="text-xs">New password</Label>
                        <Input id={`password-${member.id}`} name="password" type="password" minLength={8} autoComplete="new-password" required />
                      </div>
                      <Button type="submit" variant="outline" disabled={pending}>Set password</Button>
                    </form>
                  </details>

                  <form
                    action={formAction}
                    onSubmit={(event) => {
                      if (member.active && !window.confirm(`Disable ${member.name}'s account? They will be signed out and unable to sign in.`)) event.preventDefault();
                    }}
                  >
                    <input type="hidden" name="intent" value="toggle-active" />
                    <input type="hidden" name="userId" value={member.id} />
                    <Button type="submit" variant="ghost" disabled={isCurrent || pending}>
                      {member.active ? <UserRoundX data-icon="inline-start" /> : <UserRoundCheck data-icon="inline-start" />}
                      {member.active ? "Disable" : "Restore"}
                    </Button>
                  </form>

                  <form
                    action={formAction}
                    onSubmit={(event) => {
                      if (!window.confirm(`Permanently delete ${member.name}? Their articles will be reassigned to you. This cannot be undone.`)) event.preventDefault();
                    }}
                  >
                    <input type="hidden" name="intent" value="delete" />
                    <input type="hidden" name="userId" value={member.id} />
                    <Button type="submit" variant="destructive" disabled={isCurrent || pending}>
                      <Trash2 data-icon="inline-start" />Delete
                    </Button>
                  </form>
                  </div>
                </div>
              </div>
            );
          })}
        </Plate>
      </div>
    </Section>
  );
}
