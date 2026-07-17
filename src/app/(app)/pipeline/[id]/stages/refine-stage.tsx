"use client";

import { useEffect, useState, useTransition } from "react";
import { Markdown } from "@/components/markdown";
import { IconArrowRight, IconCheck, IconSpark } from "@/components/icons";
import { streamNdjson } from "@/lib/ndjson-client";
import { ApiNotReady, StageShell } from "./stage-shell";
import { goToFinalizeAction, saveDraftContentAction } from "../actions";

const SUGGESTIONS = [
  "Make the introduction shorter",
  "Use a more confident tone",
  "Add practical examples",
  "Tighten the final call to action",
];

type Revision = { id: string; userMessage: string; resultMd: string };

export function RefineStage({
  projectId,
  draft,
  refinements,
  anthropicReady,
}: {
  projectId: string;
  draft: { id: string; contentMd: string } | null;
  refinements: Revision[];
  anthropicReady: boolean;
}) {
  const [content, setContent] = useState(draft?.contentMd ?? "");
  const [revisions, setRevisions] = useState(refinements);
  const [input, setInput] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!dirty || !draft) return;
    const timer = setTimeout(() => {
      startTransition(() => saveDraftContentAction(draft.id, content));
      setDirty(false);
    }, 900);
    return () => clearTimeout(timer);
  }, [content, dirty, draft]);

  async function revise(message: string) {
    const instruction = message.trim();
    if (!instruction || streaming) return;
    setInput("");
    setError(null);
    setStreaming(true);
    try {
      let nextContent = "";
      for await (const event of streamNdjson<{ t: string; d?: string; m?: string }>(
        `/api/pipeline/${projectId}/refine`,
        { message: instruction }
      )) {
        if (event.t === "delta" && event.d) {
          nextContent += event.d;
          setContent(nextContent);
        } else if (event.t === "done") {
          setRevisions((current) => [
            ...current,
            { id: crypto.randomUUID(), userMessage: instruction, resultMd: nextContent },
          ]);
        } else if (event.t === "error") {
          setError(event.m ?? "Revision failed.");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revision failed.");
    } finally {
      setStreaming(false);
    }
  }

  function restore(revision: Revision) {
    if (!draft) return;
    setContent(revision.resultMd);
    startTransition(() => saveDraftContentAction(draft.id, revision.resultMd));
  }

  function finalize() {
    const formData = new FormData();
    formData.set("projectId", projectId);
    startTransition(() => goToFinalizeAction(formData));
  }

  if (!draft) {
    return <StageShell title="Review"><p className="text-sm text-ink-2">Choose a draft before starting review.</p></StageShell>;
  }

  return (
    <StageShell
      title="Review"
      description="Read the article as a complete document. Open revisions only when you want to change something."
      wide
    >
      {!anthropicReady ? (
        <ApiNotReady />
      ) : (
        <div className={`grid items-start gap-5 ${drawerOpen ? "lg:grid-cols-[minmax(0,1fr)_20rem]" : ""}`}>
          <article className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3 sm:px-7">
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold uppercase tracking-[var(--tracking-caps)] text-accent-ink">Article</span>
                <span className="text-xs text-ink-3" aria-live="polite">{streaming ? "Applying revision…" : dirty || pending ? "Saving…" : "Saved"}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setEditing((value) => !value)} className="cs-btn">{editing ? "Preview" : "Edit article"}</button>
                <button type="button" onClick={() => setDrawerOpen((value) => !value)} className="cs-btn" aria-expanded={drawerOpen}>{drawerOpen ? "Close revisions" : `Revisions${revisions.length ? ` (${revisions.length})` : ""}`}</button>
              </div>
            </div>

            {editing ? (
              <div className="p-5 sm:p-8">
                <textarea value={content} onChange={(event) => { setContent(event.target.value); setDirty(true); }} className="cs-textarea min-h-[38rem] text-sm leading-relaxed" />
              </div>
            ) : (
              <div className="mx-auto min-h-[38rem] max-w-[76ch] px-5 py-8 sm:px-8 sm:py-12">
                <Markdown>{content}</Markdown>
                {streaming && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-accent align-text-bottom" />}
              </div>
            )}

            <div className="sticky bottom-0 flex justify-end border-t border-line bg-surface/95 px-5 py-4 backdrop-blur sm:px-7">
              <button onClick={finalize} disabled={pending || streaming || dirty} className="cs-btn-primary">Continue to finalize <IconArrowRight width={16} height={16} /></button>
            </div>
          </article>

          {drawerOpen && (
            <aside className="rounded-2xl border border-line bg-surface lg:sticky lg:top-5" aria-label="Revision controls">
              <div className="border-b border-line px-5 py-4">
                <h3 className="font-semibold text-ink">Revise article</h3>
                <p className="mt-1 text-xs text-ink-3">Describe one change at a time.</p>
              </div>
              <div className="space-y-4 p-4">
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((suggestion) => (
                    <button key={suggestion} onClick={() => revise(suggestion)} disabled={streaming} className="rounded-full border border-line bg-bg px-3 py-2 text-xs text-ink-2 hover:border-accent hover:text-accent-ink disabled:opacity-50">{suggestion}</button>
                  ))}
                </div>
                <form onSubmit={(event) => { event.preventDefault(); void revise(input); }} className="space-y-2">
                  <label htmlFor="revision-instruction" className="cs-label">Revision instruction</label>
                  <textarea id="revision-instruction" value={input} onChange={(event) => setInput(event.target.value)} className="cs-textarea min-h-24 text-sm" placeholder="e.g. make section two more practical" />
                  <button type="submit" disabled={streaming || !input.trim()} className="cs-btn-primary w-full"><IconSpark width={16} height={16} />{streaming ? "Applying…" : "Apply revision"}</button>
                </form>
                {error && <p className="text-sm text-danger" role="alert">{error}</p>}
              </div>
              {revisions.length > 0 && (
                <div className="border-t border-line px-4 py-4">
                  <h4 className="text-xs font-semibold uppercase tracking-[var(--tracking-caps)] text-ink-3">History</h4>
                  <ol className="mt-3 space-y-2">
                    {[...revisions].reverse().map((revision) => (
                      <li key={revision.id} className="rounded-lg bg-sunken px-3 py-3">
                        <p className="text-sm text-ink-2">{revision.userMessage}</p>
                        <button onClick={() => restore(revision)} disabled={pending || !revision.resultMd} className="mt-2 inline-flex min-h-9 items-center gap-1 text-xs font-medium text-accent-ink hover:underline"><IconCheck width={13} height={13} />Restore this version</button>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </aside>
          )}
        </div>
      )}
    </StageShell>
  );
}
