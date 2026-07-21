"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { SelectedTopic } from "@/db/schema";
import { IconArrowRight, IconCheck, IconSpark } from "@/components/icons";
import { ApiNotReady, StageShell } from "./stage-shell";
import {
  approveOutlineAction,
  clearDirectionAction,
  generateOutlineAction,
  generateTopicsAction,
  saveOutlineAction,
  selectTopicAction,
} from "../actions";

export function DirectionStage({
  projectId,
  suggestions,
  selected,
  brief,
  markdown,
  longForm,
  anthropicReady,
}: {
  projectId: string;
  suggestions: SelectedTopic[];
  selected: SelectedTopic | null;
  brief: string;
  markdown: string;
  longForm: boolean;
  anthropicReady: boolean;
}) {
  const [topics, setTopics] = useState(suggestions);
  const [outline, setOutline] = useState(markdown);
  const [customTitle, setCustomTitle] = useState(selected?.title ?? "");
  const [loading, setLoading] = useState<"topics" | "outline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const autoStarted = useRef(false);

  async function loadTopics() {
    setLoading("topics");
    setError(null);
    try {
      setTopics(await generateTopicsAction(projectId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not develop directions.");
    } finally {
      setLoading(null);
    }
  }

  async function loadOutline() {
    setLoading("outline");
    setError(null);
    try {
      setOutline(await generateOutlineAction(projectId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build the article plan.");
    } finally {
      setLoading(null);
    }
  }

  useEffect(() => {
    if (!anthropicReady || autoStarted.current) return;
    if (!selected && topics.length === 0) {
      autoStarted.current = true;
      const timer = setTimeout(() => void loadTopics(), 0);
      return () => clearTimeout(timer);
    }
    if (selected && !outline) {
      autoStarted.current = true;
      const timer = setTimeout(() => void loadOutline(), 0);
      return () => clearTimeout(timer);
    }
    // Automatic generation is persisted server-side, so it must run once only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anthropicReady, selected?.title]);

  function choose(topic: SelectedTopic) {
    const formData = new FormData();
    formData.set("projectId", projectId);
    formData.set("title", topic.title);
    formData.set("angle", topic.angle ?? "");
    formData.set("whyTimely", topic.whyTimely ?? "");
    formData.set("searchIntent", topic.searchIntent ?? "");
    formData.set("source", topic.source === "suggested" ? "suggested" : "edited");
    startTransition(() => selectTopicAction(formData));
  }

  function chooseCustom() {
    if (!customTitle.trim()) return;
    choose({ title: customTitle.trim(), source: brief ? "brief" : "custom" });
  }

  function save() {
    const formData = new FormData();
    formData.set("projectId", projectId);
    formData.set("markdown", outline);
    startTransition(async () => {
      await saveOutlineAction(formData);
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    });
  }

  function approve() {
    const formData = new FormData();
    formData.set("projectId", projectId);
    formData.set("markdown", outline);
    startTransition(() => approveOutlineAction(formData));
  }

  if (!anthropicReady) {
    return <StageShell title="Direction"><ApiNotReady /></StageShell>;
  }

  const recommended = topics[0];
  const alternatives = topics.slice(1);

  return (
    <StageShell
      title="Direction"
      description="Start with one clear editorial direction. Adjust it here before the article is written."
      wide
    >
      {error && <p className="mb-5 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">{error}</p>}

      {!selected ? (
        <div className="mx-auto max-w-4xl">
          {loading === "topics" ? (
            <div className="cs-card h-72 animate-pulse bg-sunken/40" aria-label="Developing recommended direction" />
          ) : recommended ? (
            <>
              <article className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
                <div className="border-b border-line bg-sunken/40 px-5 py-3 sm:px-7">
                  <span className="text-xs font-semibold uppercase tracking-[var(--tracking-caps)] text-accent-ink">Recommended direction</span>
                </div>
                <div className="px-5 py-6 sm:px-7 sm:py-8">
                  <h3 className="max-w-3xl text-[length:var(--text-h2)] text-ink">{recommended.title}</h3>
                  {recommended.angle && <p className="mt-4 max-w-[68ch] text-base leading-(--leading-body) text-ink-2">{recommended.angle}</p>}
                  <dl className="mt-6 grid gap-4 border-t border-line pt-5 text-sm sm:grid-cols-2">
                    {recommended.whyTimely && <div><dt className="font-medium text-ink">Why now</dt><dd className="mt-1 text-ink-3">{recommended.whyTimely}</dd></div>}
                    {recommended.searchIntent && <div><dt className="font-medium text-ink">Reader intent</dt><dd className="mt-1 text-ink-3">{recommended.searchIntent}</dd></div>}
                  </dl>
                </div>
                <div className="flex justify-end border-t border-line px-5 py-4 sm:px-7">
                  <button onClick={() => choose(recommended)} disabled={pending} className="cs-btn-primary">Use this direction <IconArrowRight width={16} height={16} /></button>
                </div>
              </article>

              {alternatives.length > 0 && (
                <details className="mt-4 rounded-xl border border-line bg-surface">
                  <summary className="cursor-pointer px-5 py-4 text-sm font-medium text-ink-2 hover:text-ink">{alternatives.length} alternative direction{alternatives.length === 1 ? "" : "s"}</summary>
                  <div className="divide-y divide-line border-t border-line">
                    {alternatives.map((topic, index) => (
                      <div key={`${topic.title}-${index}`} className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-start">
                        <div className="min-w-0 flex-1"><h4 className="font-medium text-ink">{topic.title}</h4>{topic.angle && <p className="mt-1 text-sm text-ink-3">{topic.angle}</p>}</div>
                        <button onClick={() => choose(topic)} disabled={pending} className="cs-btn shrink-0">Choose</button>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </>
          ) : (
            <button onClick={loadTopics} disabled={loading !== null} className="cs-btn-primary"><IconSpark width={16} height={16} />Develop directions</button>
          )}

          <div className="mt-8 border-t border-line pt-6">
            <label htmlFor="custom-direction" className="cs-label">Have an exact topic?</label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input id="custom-direction" value={customTitle} onChange={(event) => setCustomTitle(event.target.value)} className="cs-input flex-1" placeholder="Enter the article topic or working title" />
              <button onClick={chooseCustom} disabled={pending || !customTitle.trim()} className="cs-btn">Use my topic</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-4xl">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div><p className="text-xs font-semibold uppercase tracking-[var(--tracking-caps)] text-accent-ink">Selected direction</p><h3 className="mt-1 text-[length:var(--text-h3)] text-ink">{selected.title}</h3>{selected.angle && <p className="mt-2 max-w-[68ch] text-sm text-ink-3">{selected.angle}</p>}</div>
            <button type="button" onClick={() => startTransition(() => clearDirectionAction(projectId))} disabled={pending} className="cs-btn">Change direction</button>
          </div>

          {loading === "outline" ? (
            <div className="cs-card h-96 animate-pulse bg-sunken/40" aria-label="Building article plan" />
          ) : (
            <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3 sm:px-7">
                <div><h4 className="font-semibold text-ink">Article plan</h4><p className="text-xs text-ink-3">Edit the structure before drafting.</p></div>
                <div className="flex gap-2"><button onClick={loadOutline} disabled={loading !== null || pending} className="cs-btn"><IconSpark width={15} height={15} />Regenerate</button><button onClick={save} disabled={pending || !outline.trim()} className="cs-btn">{saved && <IconCheck width={15} height={15} />}{saved ? "Saved" : "Save"}</button></div>
              </div>
              <div className="p-5 sm:p-7"><textarea value={outline} onChange={(event) => setOutline(event.target.value)} className="cs-textarea min-h-[26rem] font-mono text-sm leading-relaxed" placeholder={`Build the ${longForm ? "article outline" : "content plan"} here…`} /></div>
              <div className="sticky bottom-0 flex justify-end border-t border-line bg-surface/95 px-5 py-4 backdrop-blur sm:px-7">
                <button onClick={approve} disabled={pending || !outline.trim()} className="cs-btn-primary">Approve direction &amp; write draft <IconArrowRight width={16} height={16} /></button>
              </div>
            </section>
          )}
        </div>
      )}
    </StageShell>
  );
}
