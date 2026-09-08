"use client";

import { useState, useTransition } from "react";
import { Switch } from "@/components/switch";
import { toggleCategoryAction } from "./actions";

/**
 * Whether a content direction is offered when starting an article.
 *
 * THIS WAS A ROW OF TEXT BUTTONS SAYING "Deactivate" AND "Activate". Which is
 * the state and which is the action? The word on the button is the OPPOSITE of
 * what is true right now, so reading a list of thirty-four of them meant
 * inverting every line in your head — and two directions in different states
 * sat under two different words, so the column could not be scanned at all.
 *
 * A switch prints the state instead of the verb. Thirty-four of them read as
 * one column of on and off, which is the question actually being asked, and it
 * is the control Routines already uses for exactly this decision.
 *
 * OPTIMISTIC, because the switch has to move under the finger. The round trip
 * writes a row and re-renders the page; waiting for that leaves the thumb
 * sitting on the old side long enough to feel broken. If the write fails the
 * switch snaps back and says so, which is the honest outcome — a control that
 * silently keeps a state the server rejected is worse than a slow one.
 */
export function CategoryToggle({
  id,
  name,
  active,
}: {
  id: string;
  name: string;
  active: boolean;
}) {
  const [optimistic, setOptimistic] = useState(active);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();

  // The server is the truth between interactions: once a revalidation lands,
  // the prop moves and any optimistic guess is discarded.
  const checked = pending || failed ? optimistic : active;

  function toggle(next: boolean) {
    setOptimistic(next);
    setFailed(false);
    const form = new FormData();
    form.set("id", id);
    form.set("active", String(active));
    start(async () => {
      try {
        await toggleCategoryAction(form);
      } catch {
        setOptimistic(active);
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
      <Switch checked={checked} onChange={toggle} label={name} disabled={pending} />
    </div>
  );
}
