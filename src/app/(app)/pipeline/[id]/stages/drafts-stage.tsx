"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Markdown } from "@/components/markdown";
import { IconArrowRight, IconCheck, IconSpark } from "@/components/icons";
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
  const [drawerOpen, setDrawerOpen] = useState(false);
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

  function restore(revision: Revision) {
    if (!draft.id || dirty || pending || !revision.resultMd || revision.resultMd === draft.contentMd) return;
    const current = draft.contentMd;
    addLocalRevision("Version before restore", current);
    setDraft((value) => ({ ...value, contentMd: revision.resultMd }));
    editBase.current = revision.resultMd;
    startTransition(() => saveDraftContentAction(draft.id!, revision.resultMd, true, "Version before restore"));
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
    <StageShell title="Draft & edit" description="Generate, edit, and revise one article while every meaningful version stays restorable." wide>
      <div className={`grid items-start gap-6 ${drawerOpen ? "xl:grid-cols-[minmax(0,1fr)_22rem]" : ""}`}>
        {/* Tray and plate. The article is the product on this screen, so it is
            seated as an object rather than boxed by a header and footer strip. */}
        <article className="cs-bezel motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-4 motion-safe:duration-500">
          <div className="cs-bezel-core">
            <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-5 pb-4 pt-5 sm:px-8 sm:pt-6">
              <div className="min-w-0">
                <p className="font-heading text-[length:var(--text-h3)] font-bold tracking-tight text-ink">Article draft</p>
                <p className="mt-1 text-sm text-ink-2" aria-live="polite">
                  {draft.streaming ? "Writing draft…" : revising ? "Applying revision…" : dirty || pending ? "Saving…" : draft.contentMd ? `Saved · Target ${targetLength}` : `Target ${targetLength}`}
                </p>
              </div>
              {/* Quiet at rest, tonal while a mode is held open. Three equal
                  outlines gave a destructive action the same weight as a view
                  toggle. */}
              <div className="flex flex-wrap items-center gap-1">
                <button type="button" onClick={toggleEditing} disabled={!draft.contentMd || draft.streaming || revising} className="cs-tool" aria-pressed={editing}>
                  {editing ? "Preview" : "Edit"}
                </button>
                <button type="button" onClick={() => setDrawerOpen((value) => !value)} disabled={!draft.id || draft.streaming} className="cs-tool" aria-expanded={drawerOpen}>
                  Revisions{revisions.length ? <span className="text-ink-3">{revisions.length}</span> : null}
                </button>
                <button type="button" onClick={regenerate} disabled={draft.streaming || revising || dirty || pending} className="cs-tool">
                  {draft.streaming ? "Writing…" : "Regenerate"}
                </button>
              </div>
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

            <div className="sticky bottom-0 flex items-center justify-end border-t border-line bg-surface/90 px-5 py-4 backdrop-blur-xl sm:px-8">
              <button type="button" onClick={continueToImages} disabled={!draft.id || !draft.contentMd || draft.streaming || revising || dirty || pending} className="cs-cta group">
                Continue to images
                <span aria-hidden className="cs-cta-disc"><IconArrowRight width={15} height={15} /></span>
              </button>
            </div>
          </div>
        </article>

        {drawerOpen && (
          <aside
            className="cs-bezel motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-right-4 motion-safe:duration-500 xl:sticky xl:top-6"
            aria-label="AI revisions and version history"
          >
            <div className="cs-bezel-core">
              <div className="px-5 pb-4 pt-5">
                <h3 className="font-heading text-[length:var(--text-h3)] font-bold tracking-tight text-ink">Revise</h3>
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
                  <button type="submit" disabled={revising || dirty || pending || !input.trim()} className="cs-cta group w-full justify-between">
                    {revising ? "Applying…" : "Apply revision"}
                    <span aria-hidden className="cs-cta-disc"><IconSpark width={15} height={15} /></span>
                  </button>
                </form>
              </div>

              {revisions.length > 0 && (
                <div className="max-h-[26rem] overflow-y-auto border-t border-line px-5 py-5">
                  <h4 className="text-sm font-semibold text-ink">Version history</h4>
                  <ol className="mt-3 space-y-1">
                    {[...revisions].reverse().map((revision) => (
                      <li key={revision.id} className="group/rev rounded-2xl px-3 py-3 transition-colors duration-(--duration-fast) ease-(--ease-spring) hover:bg-sunken">
                        <p className="text-sm leading-snug text-ink-2">{revision.userMessage}</p>
                        <button
                          type="button"
                          onClick={() => restore(revision)}
                          disabled={dirty || pending || !revision.resultMd}
                          className="mt-1.5 inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-accent-ink transition-opacity duration-(--duration-fast) ease-(--ease-spring) hover:underline focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)] disabled:opacity-40 sm:opacity-0 sm:group-hover/rev:opacity-100 sm:group-focus-within/rev:opacity-100"
                        >
                          <IconCheck width={13} height={13} />Restore
                        </button>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </StageShell>
  );
}
