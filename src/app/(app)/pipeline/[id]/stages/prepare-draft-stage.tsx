"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SelectedTopic } from "@/db/schema";
import { ApiNotReady, StageShell } from "./stage-shell";
import { prepareSimpleArticleAction } from "../actions";

/**
 * The pause between choosing a topic and reading a draft: one source check and
 * an outline, then straight on to stage 4.
 *
 * This used to carry a second copy of the topic picker as well. Topics are now
 * chosen on the home surface before a project exists, so every project arrives
 * here already holding one and that branch was unreachable — verified against
 * the database before removing it. The stepper folds this into Draft & edit
 * rather than numbering it, because it is automatic and cannot be returned to.
 */
export function PrepareDraftStage({
  projectId,
  selected,
  anthropicReady,
}: {
  projectId: string;
  selected: SelectedTopic | null;
  anthropicReady: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const started = useRef(false);

  async function prepareDraft() {
    setError(null);
    try {
      await prepareSimpleArticleAction(projectId);
      // The action persists the outline and bumps the project to stage 4, but
      // no longer redirects — a server-action redirect throws NEXT_REDIRECT,
      // which this try/catch would swallow and leave the page stuck.
      router.replace(`/pipeline/${projectId}?stage=4`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not prepare the draft.");
      started.current = false;
    }
  }

  useEffect(() => {
    if (!anthropicReady || !selected || started.current) return;
    started.current = true;
    void prepareDraft();
    // Preparation persists each completed phase server-side.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anthropicReady, projectId, selected]);

  if (!anthropicReady) return <StageShell title="Draft"><ApiNotReady /></StageShell>;

  // Defensive only: no project reaches this stage without a topic, but a blank
  // screen would be the worst possible way to find out otherwise.
  if (!selected) {
    return (
      <StageShell title="Draft" description="This article has no topic yet.">
        <p className="text-sm leading-relaxed text-ink-2">
          Start it again from Create and it will come straight through to the draft.
        </p>
      </StageShell>
    );
  }

  return (
    <StageShell
      title="Draft"
      description="Checking one current source and preparing your draft. If research is unavailable, drafting continues with a conservative plan."
      wide
    >
      {error && (
        <p className="mb-5 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <section className="mx-auto max-w-3xl py-8" aria-live="polite">
        <h3 className="font-heading text-[length:var(--text-h3)] font-bold tracking-tight text-ink">{selected.title}</h3>
        <div className="mt-6 flex items-center gap-3 border-y border-line py-4 text-sm">
          <span className="size-2 animate-pulse rounded-full bg-accent motion-reduce:animate-none" />
          <div>
            <p className="font-medium text-ink">Checking a current source and preparing the draft</p>
            <p className="mt-1 text-xs text-ink-3">This check is time-limited and cannot block draft generation.</p>
          </div>
        </div>
        {error && (
          <button
            type="button"
            onClick={() => {
              started.current = true;
              void prepareDraft();
            }}
            className="cs-btn mt-5"
          >
            Try again
          </button>
        )}
      </section>
    </StageShell>
  );
}
