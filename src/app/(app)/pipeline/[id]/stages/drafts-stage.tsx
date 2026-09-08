"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Markdown } from "@/components/markdown";
import { streamNdjson } from "@/lib/ndjson-client";
import { ApiNotReady, StageShell } from "./stage-shell";
import { goToFinalizeAction, saveDraftContentAction } from "../actions";

const SUGGESTIONS = [
  "Make the introduction shorter",
  "Add more concrete visual details",
  "Make the explanations more practical",
  "Tighten repetitive sections",
];

type Revision = { id: string; userMessage: string; resultMd: string };
type DraftView = {
  id: string | null;
  contentMd: string;
  metricLabel?: string;
  streaming: boolean;
  error?: string | null;
};

export function DraftsStage({
  projectId,
  drafts,
  refinements,
  targetLength,
  anthropicReady,
}: {
  projectId: string;
  drafts: { id: string; variationNo: number; contentMd: string; isSelected: boolean }[];
  refinements: Revision[];
  targetLength: string;
  anthropicReady: boolean;
}) {
  const existing = drafts.find((draft) => draft.isSelected) ?? drafts[0];
  const [draft, setDraft] = useState<DraftView>({
    id: existing?.id ?? null,
    contentMd: existing?.contentMd ?? "",
    streaming: false,
    error: null,
  });
  const [revisions, setRevisions] = useState(refinements);
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");
  const [dirty, setDirty] = useState(false);
  const [revising, setRevising] = useState(false);
  const [pending, startTransition] = useTransition();
  const autoStarted = useRef(false);
  const editSnapshotSaved = useRef(false);
  const editBase = useRef(existing?.contentMd ?? "");

  function addLocalRevision(label: string, content: string) {
    if (!content.trim()) return;
    setRevisions((current) => [...current, { id: crypto.randomUUID(), userMessage: label, resultMd: content }]);
  }

  async function generateDraft(regenerating = false) {
    const previous = draft.contentMd;
    if (regenerating && previous.trim()) addLocalRevision("Version before regeneration", previous);
    setDraft((current) => ({ ...current, contentMd: "", streaming: true, error: null, metricLabel: undefined }));
    try {
      let content = "";
      for await (const event of streamNdjson<{ t: string; d?: string; draftId?: string; metricLabel?: string; content?: string; m?: string }>(
        `/api/pipeline/${projectId}/draft`,
        {}
      )) {
        if (event.t === "delta" && event.d) {
          content += event.d;
          setDraft((current) => ({ ...current, contentMd: content }));
        } else if (event.t === "done") {
          // The server may return a sanitized final (e.g. em dashes removed); adopt it.
          if (event.content != null) content = event.content;
          setDraft((current) => ({ ...current, id: event.draftId ?? current.id, contentMd: content, metricLabel: event.metricLabel, streaming: false }));
          editBase.current = content;
        } else if (event.t === "error") {
          setDraft((current) => ({ ...current, contentMd: previous, streaming: false, error: event.m ?? "Draft generation failed." }));
        }
      }
    } catch (reason) {
      setDraft((current) => ({ ...current, contentMd: previous, streaming: false, error: reason instanceof Error ? reason.message : "Draft generation failed." }));
    }
  }

  useEffect(() => {
    if (!anthropicReady || existing || autoStarted.current) return;
    autoStarted.current = true;
    void generateDraft();
    // Initial generation persists server-side and must start once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anthropicReady, existing]);

  useEffect(() => {
    if (!dirty || !draft.id || draft.streaming || revising) return;
    const timer = setTimeout(() => {
      const preserve = !editSnapshotSaved.current;
      if (preserve) {
        addLocalRevision("Version before manual edits", editBase.current);
        editSnapshotSaved.current = true;
      }
      startTransition(() => saveDraftContentAction(draft.id!, draft.contentMd, preserve, "Version before manual edits"));
      setDirty(false);
    }, 900);
    return () => clearTimeout(timer);
  }, [dirty, draft.contentMd, draft.id, draft.streaming, revising]);

  function toggleEditing() {
    setEditing((current) => {
      const next = !current;
      if (next) {
        editBase.current = draft.contentMd;
        editSnapshotSaved.current = false;
      }
      return next;
    });
  }

  async function revise(message: string) {
    const instruction = message.trim();
    if (!instruction || revising || draft.streaming || dirty || pending || !draft.id) return;
    const previous = draft.contentMd;
    addLocalRevision(`Version before AI revision: ${instruction}`, previous);
    setInput("");
    setRevising(true);
    setDraft((current) => ({ ...current, error: null }));
    try {
      let content = "";
      for await (const event of streamNdjson<{ t: string; d?: string; content?: string; m?: string }>(
        `/api/pipeline/${projectId}/refine`,
        { message: instruction }
      )) {
        if (event.t === "delta" && event.d) {
          content += event.d;
          setDraft((current) => ({ ...current, contentMd: content }));
        } else if (event.t === "done") {
          if (event.content != null) content = event.content;
          setDraft((current) => ({ ...current, contentMd: content }));
          addLocalRevision(instruction, content);
          editBase.current = content;
        } else if (event.t === "error") {
          setDraft((current) => ({ ...current, contentMd: previous, error: event.m ?? "Revision failed." }));
        }
      }
    } catch (reason) {
      setDraft((current) => ({ ...current, contentMd: previous, error: reason instanceof Error ? reason.message : "Revision failed." }));
    } finally {
      setRevising(false);
    }
  }

  /**
   * Show a version. Not "restore" it.
   *
   * Restoring took a snapshot of whatever was on screen first, filed as
   * "Version before restore", so looking at an older draft ADDED a row to the
   * list you were looking through — and reading three versions left three
   * entries nobody wrote. Every version in this list is already saved; moving
   * between them is a change of view, and needs to record nothing.
   *
   * `preservePrevious: false` is what says that: set the draft to this text
   * and write no new revision.
   */
  function showVersion(revision: Revision) {
    if (!draft.id || dirty || pending || !revision.resultMd || revision.resultMd === draft.contentMd) return;
    setDraft((value) => ({ ...value, contentMd: revision.resultMd }));
    editBase.current = revision.resultMd;
    startTransition(() => saveDraftContentAction(draft.id!, revision.resultMd, false));
  }

  function regenerate() {
    if (draft.contentMd && !window.confirm("Regenerate this draft? The current version will remain available in revision history.")) return;
    void generateDraft(true);
  }

  function continueToImages() {
    const formData = new FormData();
    formData.set("projectId", projectId);
    startTransition(() => goToFinalizeAction(formData));
  }

  if (!anthropicReady) return <StageShell title="Draft & edit"><ApiNotReady /></StageShell>;

  return (
    <StageShell title="Draft & edit" wide>
      {/* THE SAME TWO COLUMNS AS PUBLISH — minmax(0,1fr) and a 360px rail — so
          the action sits in one place across the pipeline instead of moving
          from a bar under the article to a panel beside it between stages.

          The rail is permanent. It used to appear only when the revisions
          drawer opened, which meant asking to see revisions reflowed the whole
          page and narrowed the article you were reading. Revisions drop INTO
          the rail now; the layout does not move. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-8">
        {/* Tray and plate. The article is the product on this screen, so it is
            seated as an object rather than boxed by a header and footer strip. */}
        <article className="cs-bezel motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-4 motion-safe:duration-500">
          <div className="cs-bezel-core">
            <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-5 pb-4 pt-5 sm:px-8 sm:pt-6">
              <div className="min-w-0">
                <p className="font-heading text-[length:var(--text-h3)] font-semibold tracking-tight text-ink">Article draft</p>
                <p className="mt-1 text-sm text-ink-2" aria-live="polite">
                  {draft.streaming ? "Writing draft…" : revising ? "Applying revision…" : dirty || pending ? "Saving…" : draft.contentMd ? `Saved · Target ${targetLength}` : `Target ${targetLength}`}
                </p>
              </div>
              {/* ONE ACTION ON THE ARTICLE, and it is the one that changes how
                  you are looking at it. Revisions and Regenerate were sitting
                  here too, so the panel's toolbar held a view toggle, a drawer
                  latch and a destructive rewrite at identical weight. Both of
                  the others act on the DRAFT rather than the view, and both now
                  live in the rail where the drafting tools are. */}
              <button type="button" onClick={toggleEditing} disabled={!draft.contentMd || draft.streaming || revising} className="cs-tool" aria-pressed={editing}>
                {editing ? "Preview" : "Edit"}
              </button>
            </header>

            {draft.error && <p className="mx-5 mb-2 rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger sm:mx-8" role="alert">{draft.error}</p>}

            {editing ? (
              <div className="px-5 pb-8 sm:px-8">
                <textarea value={draft.contentMd} onChange={(event) => { setDraft((current) => ({ ...current, contentMd: event.target.value })); setDirty(true); }} className="cs-textarea min-h-[38rem] rounded-2xl text-sm leading-relaxed" aria-label="Article Markdown" />
              </div>
            ) : (
              <div className="mx-auto min-h-[38rem] max-w-[74ch] px-5 pb-16 pt-6 sm:px-8 sm:pb-24 sm:pt-10">
                {draft.contentMd ? <Markdown>{draft.contentMd}</Markdown> : <p className="py-20 text-center text-sm text-ink-2">Preparing the article…</p>}
                {(draft.streaming || revising) && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-full bg-accent align-text-bottom motion-reduce:animate-none" />}
              </div>
            )}
          </div>
        </article>

        {/* top-32, the offset Publish already used. At top-6 the rail
            slid under the sticky stepper before it caught, which reads as
            the column moving rather than holding. */}
        {/* 72px: clear of the stepper, which occupies 0–60 when stuck, and
            still ABOVE where this column naturally starts (108). An offset
            below that start — top-32 was 128 — makes sticky snap the rail down
            twenty pixels at rest, so the two columns begin on different lines
            before anything has been scrolled. */}
        <div className="space-y-6 lg:sticky lg:top-[4.5rem]">
          <section className="cs-bezel">
            <div className="cs-bezel-core p-5">
              <h3 className="font-heading text-[length:var(--text-h3)] font-semibold tracking-tight text-ink">
                Next step
              </h3>
              {/* Says why it is unavailable rather than just being grey. The
                  sticky bar could only sit there disabled, which reads as
                  broken when you cannot see that a save is still in flight. */}
              <p className="mt-1 text-sm leading-relaxed text-ink-2">
                {draft.streaming
                  ? "Waiting for the draft to finish writing."
                  : revising
                    ? "Waiting for the revision to apply."
                    : dirty || pending
                      ? "Saving your edits."
                      : !draft.contentMd
                        ? "There is no draft to carry forward yet."
                        : "Images come next. The draft is saved."}
              </p>
              <button
                type="button"
                onClick={continueToImages}
                disabled={!draft.id || !draft.contentMd || draft.streaming || revising || dirty || pending}
                className="cs-cta mt-4 w-full"
              >
                Continue to images
              </button>
            </div>
          </section>

          {/* SHOWN, NOT LATCHED. Revising is what this stage is FOR — the
              article is already written by the time you arrive — so the tools
              for it were behind a toggle that had to be found first, and the
              rail beside the article sat empty until you did. */}
          <aside
            className="cs-bezel"
            aria-label="AI revisions and version history"
          >
            <div className="cs-bezel-core">
              <div className="px-5 pb-4 pt-5">
                <h3 className="font-heading text-[length:var(--text-h3)] font-semibold tracking-tight text-ink">Revise</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-2">One focused change at a time.</p>
              </div>

              <div className="space-y-4 px-5 pb-5">
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => void revise(suggestion)}
                      disabled={revising || dirty || pending}
                      className="rounded-full bg-sunken px-3 py-2 text-left text-xs font-medium text-ink-2 transition-colors duration-(--duration-fast) ease-(--ease-spring) hover:bg-accent-soft hover:text-accent-press focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
                <form onSubmit={(event) => { event.preventDefault(); void revise(input); }} className="space-y-2.5">
                  <label htmlFor="revision-instruction" className="sr-only">Revision instruction</label>
                  <textarea id="revision-instruction" value={input} onChange={(event) => setInput(event.target.value)} className="cs-textarea min-h-24 rounded-2xl text-sm" placeholder="Make the typeface descriptions more specific…" />
                  {/* SECONDARY. One orange button to a page, and on this page
                      it is Continue to images — the thing that moves the
                      article forward. Applying a revision keeps you exactly
                      where you are, however often you do it, so it takes the
                      outlined treatment the rest of this rail uses. Two filled
                      oranges made the page ask twice which one was the point. */}
                  <button type="submit" disabled={revising || dirty || pending || !input.trim()} className="cs-btn w-full justify-center">
                    {revising ? "Applying…" : "Apply revision"}
                  </button>
                </form>
              </div>

              {revisions.length > 0 && (
                <div className="max-h-[26rem] overflow-y-auto border-t border-line px-5 py-5">
                  <h4 className="text-sm font-semibold text-ink">Version history</h4>
                  {/* CHIPS, LIKE THE SUGGESTIONS ABOVE THEM. Each version was a
                      block of instruction text with a Restore link that
                      appeared on hover underneath it — a two-step reveal for a
                      list whose whole purpose is to be picked from, and a row
                      three times the height of what it says. They are the same
                      shape as the suggestion chips now: one press, and the one
                      you are on is filled. */}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {[...revisions].reverse().map((revision) => {
                      const showing = revision.resultMd === draft.contentMd;
                      return (
                        <button
                          key={revision.id}
                          type="button"
                          onClick={() => showVersion(revision)}
                          disabled={dirty || pending || !revision.resultMd}
                          aria-pressed={showing}
                          title={revision.userMessage}
                          className={`max-w-full truncate rounded-full px-3 py-2 text-left text-xs transition-colors duration-(--duration-fast) ease-(--ease-out) focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)] disabled:cursor-not-allowed disabled:opacity-40 ${
                            showing
                              ? "bg-chrome-active font-medium text-ink"
                              : "bg-sunken font-medium text-ink-2 hover:bg-deep hover:text-ink"
                          }`}
                        >
                          {revision.userMessage}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {/* Last, and separated: everything above changes the draft you
                  have, and this throws it away for a new one. */}
              <div className="border-t border-line px-5 py-4">
                <button
                  type="button"
                  onClick={regenerate}
                  disabled={draft.streaming || revising || dirty || pending}
                  /* Outlined, like Apply revision above it and Run brand
                     check on the next stage. A panel's actions look the same;
                     what marks this one as different in kind is the rule it
                     sits under, not a lighter button. */
                  className="cs-btn w-full justify-center"
                >
                  {draft.streaming ? "Writing…" : "Regenerate the draft"}
                </button>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </StageShell>
  );
}
