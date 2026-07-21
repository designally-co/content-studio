"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Markdown } from "@/components/markdown";
import { CopyButton } from "@/components/copy-button";
import { IconArrowRight, IconCheck, IconSpark } from "@/components/icons";
import { streamNdjson } from "@/lib/ndjson-client";
import { markdownToPlainText } from "@/lib/plain";
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
      for await (const event of streamNdjson<{ t: string; d?: string; draftId?: string; metricLabel?: string; m?: string }>(
        `/api/pipeline/${projectId}/draft`,
        { variation: 1 }
      )) {
        if (event.t === "delta" && event.d) {
          content += event.d;
          setDraft((current) => ({ ...current, contentMd: content }));
        } else if (event.t === "done") {
          setDraft((current) => ({ ...current, id: event.draftId ?? current.id, metricLabel: event.metricLabel, streaming: false }));
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
      for await (const event of streamNdjson<{ t: string; d?: string; m?: string }>(
        `/api/pipeline/${projectId}/refine`,
        { message: instruction }
      )) {
        if (event.t === "delta" && event.d) {
          content += event.d;
          setDraft((current) => ({ ...current, contentMd: content }));
        } else if (event.t === "done") {
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
      <div className={`grid items-start gap-5 ${drawerOpen ? "lg:grid-cols-[minmax(0,1fr)_20rem]" : ""}`}>
        <article className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3 sm:px-7">
            <div>
              <p className="text-sm font-medium text-ink">Article draft</p>
              <p className="mt-0.5 text-xs text-ink-3" aria-live="polite">
                {draft.streaming ? "Writing draft…" : revising ? "Applying revision…" : dirty || pending ? "Saving…" : draft.contentMd ? `Saved · Target ${targetLength}` : `Target ${targetLength}`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={toggleEditing} disabled={!draft.contentMd || draft.streaming || revising} className="cs-btn">{editing ? "Preview" : "Edit"}</button>
              <button type="button" onClick={() => setDrawerOpen((value) => !value)} disabled={!draft.id || draft.streaming} className="cs-btn" aria-expanded={drawerOpen}>{drawerOpen ? "Close revisions" : `Revise & history${revisions.length ? ` (${revisions.length})` : ""}`}</button>
              <button type="button" onClick={regenerate} disabled={draft.streaming || revising || dirty || pending} className="cs-btn">{draft.streaming ? "Writing…" : "Regenerate"}</button>
            </div>
          </div>

          {draft.error && <p className="m-5 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">{draft.error}</p>}

          {editing ? (
            <div className="p-5 sm:p-8">
              <textarea value={draft.contentMd} onChange={(event) => { setDraft((current) => ({ ...current, contentMd: event.target.value })); setDirty(true); }} className="cs-textarea min-h-[38rem] text-sm leading-relaxed" aria-label="Article Markdown" />
            </div>
          ) : (
            <div className="mx-auto min-h-[38rem] max-w-[76ch] px-5 py-8 sm:px-8 sm:py-12">
              {draft.contentMd ? <Markdown>{draft.contentMd}</Markdown> : <p className="py-16 text-center text-sm text-ink-3">Preparing the article…</p>}
              {(draft.streaming || revising) && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-accent align-text-bottom" />}
            </div>
          )}

          <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-line bg-surface/95 px-5 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <div className="flex flex-wrap gap-2">
              <CopyButton text={draft.contentMd} label="Copy Markdown" className="cs-btn" />
              <CopyButton text={markdownToPlainText(draft.contentMd)} label="Copy plain text" className="cs-btn" />
            </div>
            <button type="button" onClick={continueToImages} disabled={!draft.id || !draft.contentMd || draft.streaming || revising || dirty || pending} className="cs-btn-primary">Continue to images <IconArrowRight width={16} height={16} /></button>
          </div>
        </article>

        {drawerOpen && (
          <aside className="rounded-xl border border-line bg-surface lg:sticky lg:top-5" aria-label="AI revisions and version history">
            <div className="border-b border-line px-5 py-4">
              <h3 className="font-semibold text-ink">Revise article</h3>
              <p className="mt-1 text-xs text-ink-3">Ask for one focused change at a time.</p>
            </div>
            <div className="space-y-4 p-4">
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((suggestion) => <button key={suggestion} type="button" onClick={() => void revise(suggestion)} disabled={revising || dirty || pending} className="rounded-full border border-line bg-bg px-3 py-2 text-xs text-ink-2 hover:border-accent hover:text-accent-ink disabled:opacity-50">{suggestion}</button>)}
              </div>
              <form onSubmit={(event) => { event.preventDefault(); void revise(input); }} className="space-y-2">
                <label htmlFor="revision-instruction" className="cs-label">Revision instruction</label>
                <textarea id="revision-instruction" value={input} onChange={(event) => setInput(event.target.value)} className="cs-textarea min-h-24 text-sm" placeholder="Make the typeface descriptions more specific…" />
                <button type="submit" disabled={revising || dirty || pending || !input.trim()} className="cs-btn-primary w-full"><IconSpark width={16} height={16} />{revising ? "Applying…" : "Apply revision"}</button>
              </form>
            </div>
            {revisions.length > 0 && (
              <div className="max-h-[28rem] overflow-y-auto border-t border-line px-4 py-4">
                <h4 className="text-xs font-semibold text-ink-3">Version history</h4>
                <ol className="mt-3 space-y-2">
                  {[...revisions].reverse().map((revision) => (
                    <li key={revision.id} className="rounded-lg bg-sunken px-3 py-3">
                      <p className="text-sm text-ink-2">{revision.userMessage}</p>
                      <button type="button" onClick={() => restore(revision)} disabled={dirty || pending || !revision.resultMd} className="mt-2 inline-flex min-h-9 items-center gap-1 text-xs font-medium text-accent-ink hover:underline"><IconCheck width={13} height={13} />Restore this version</button>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </aside>
        )}
      </div>
    </StageShell>
  );
}
