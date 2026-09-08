"use client";

import { useState, useTransition } from "react";
import { Switch } from "@/components/switch";
import { toggleCategoryAction } from "./actions";

/**
 * Whether a content direction is offered when starting an article.
 *
 * THIS WAS A ROW OF TEXT BUTTONS SAYING "Deactivate" AND "Activate". Which is
 * the state and which is the action? The word on the button was the OPPOSITE of
 * what was true right now, so reading a list of thirty-four of them meant
 * inverting every line in your head — and two directions in different states
 * sat under two different words, so the column could not be scanned at all.
 *
 * A switch prints the state instead of the verb, and it is the control Routines
 * already uses for exactly this decision.
 *
 * THE STATE LIVES IN THE LIST, NOT IN THE SWITCH. As a page, this got its
 * `active` back from a server re-render after every write. In a sheet there is
 * no re-render to wait for: the row would flip, the write would land, and then
 * the switch would snap back to the value loaded when the sheet opened —
 * showing the opposite of what the database now held. The list owns the value
 * and this reports changes up to it, which also keeps the group's "8 of 10
 * active" honest as the switches move.
 */
export function CategoryToggle({
  id,
  name,
  active,
  onChanged,
}: {
  id: string;
  name: string;
  active: boolean;
  onChanged: (next: boolean) => void;
}) {
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();

  function toggle(next: boolean) {
    // Built from this render's value, before the optimistic flip — the action
    // inverts what it is given, so it has to be told the pre-toggle state.
    const form = new FormData();
    form.set("id", id);
    form.set("active", String(active));

    onChanged(next);
    setFailed(false);
    start(async () => {
      try {
        await toggleCategoryAction(form);
      } catch {
        // Snap back and say so. A control that silently keeps a state the
        // server rejected is worse than one that admits it failed.
        onChanged(active);
        setFailed(true);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      {failed && (
        <span className="text-xs text-danger-ink" role="alert">
          Didn&rsquo;t save
        </span>
      )}
      <Switch checked={active} onChange={toggle} label={name} disabled={pending} />
    </div>
  );
}
