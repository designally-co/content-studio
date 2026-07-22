"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SelectedTopic } from "@/db/schema";
import { IconSpark } from "@/components/icons";
import { ApiNotReady, StageShell } from "./stage-shell";
import {
  generateTopicsAction,
  prepareSimpleArticleAction,
  selectTopicAndPrepareSimpleArticleAction,
} from "../actions";

export function SimpleDirectionStage({
  projectId,
  suggestions,
  selected,
  anthropicReady,
}: {
  projectId: string;
  suggestions: SelectedTopic[];
  selected: SelectedTopic | null;
  anthropicReady: boolean;
}) {
  const [topics, setTopics] = useState(suggestions);
  const [selectedTopic, setSelectedTopic] = useState(selected);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const autoStarted = useRef(false);
  const draftPreparationStarted = useRef(false);

  async function prepareDraft() {
    setError(null);
    try {
      await prepareSimpleArticleAction(projectId);
      // The action persists the outline + bumps the project to stage 4, but no
      // longer redirects (a server-action redirect throws NEXT_REDIRECT, which
      // this try/catch would swallow — leaving the page stuck). Navigate here.
      router.replace(`/pipeline/${projectId}?stage=4`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not prepare the draft.");
      draftPreparationStarted.current = false;
    }
  }

  async function loadTopics() {
    setLoadingTopics(true);
    setError(null);
    try {
      setTopics(await generateTopicsAction(projectId));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not generate topic ideas.");
    } finally {
      setLoadingTopics(false);
    }
  }

  useEffect(() => {
    if (!anthropicReady || selected || topics.length > 0 || autoStarted.current) return;
    autoStarted.current = true;
    void loadTopics();
    // Generation persists server-side and should only auto-start once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anthropicReady, selected]);

  useEffect(() => {
    if (!anthropicReady || !selected || draftPreparationStarted.current) return;
    draftPreparationStarted.current = true;
    void prepareDraft();
    // Preparation persists each completed phase server-side.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anthropicReady, projectId, selected]);

  function choose(topic: SelectedTopic) {
    const formData = new FormData();
    formData.set("projectId", projectId);
    formData.set("title", topic.title);
    formData.set("angle", topic.angle ?? "");
    formData.set("whyTimely", topic.whyTimely ?? "");
    formData.set("searchIntent", topic.searchIntent ?? "");
    formData.set("source", "suggested");
    setSelectedTopic(topic);
    setError(null);
    draftPreparationStarted.current = true;
    startTransition(async () => {
      try {
        await selectTopicAndPrepareSimpleArticleAction(formData);
        router.replace(`/pipeline/${projectId}?stage=4`);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Could not prepare the draft.");
        setSelectedTopic(null);
        draftPreparationStarted.current = false;
      }
    });
  }

  if (!anthropicReady) {
    return <StageShell title="Draft"><ApiNotReady /></StageShell>;
  }

  return (
    <StageShell
      title={selectedTopic ? "Draft" : "Choose a topic"}
      description={selectedTopic
        ? "Checking one current source and preparing your draft. If research is unavailable, drafting continues with a conservative plan."
        : "Choose an AI-generated direction for your content pillar."}
      wide
    >
      {error && <p className="mb-5 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">{error}</p>}

      {selectedTopic ? (
        <section className="mx-auto max-w-3xl py-8" aria-live="polite">
          <h3 className="text-[length:var(--text-h3)] text-ink">{selectedTopic.title}</h3>
          <div className="mt-6 flex items-center gap-3 border-y border-line py-4 text-sm">
            <span className="size-2 animate-pulse rounded-full bg-accent" />
            <div>
              <p className="font-medium text-ink">Checking a current source and preparing the draft</p>
              <p className="mt-1 text-xs text-ink-3">This check is time-limited and cannot block draft generation.</p>
            </div>
          </div>
          {error && <button type="button" onClick={() => { draftPreparationStarted.current = true; void prepareDraft(); }} className="cs-btn mt-5">Try again</button>}
        </section>
      ) : loadingTopics ? (
        <div className="mx-auto max-w-4xl space-y-3" aria-label="Generating topic ideas">
          {[0, 1, 2].map((item) => <div key={item} className="h-32 animate-pulse rounded-xl border border-line bg-sunken/50" />)}
        </div>
      ) : topics.length > 0 ? (
        <div className="mx-auto grid max-w-4xl gap-3">
          {topics.map((topic, index) => (
            <article key={`${topic.title}-${index}`} className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                {index === 0 && <p className="mb-1 text-xs font-semibold uppercase tracking-[var(--tracking-caps)] text-accent-ink">Recommended</p>}
                <h3 className="font-semibold tracking-tight text-ink">{topic.title}</h3>
                {topic.angle && <p className="mt-2 text-sm leading-relaxed text-ink-3">{topic.angle}</p>}
              </div>
              <button type="button" onClick={() => choose(topic)} disabled={pending} className={index === 0 ? "cs-btn-primary shrink-0" : "cs-btn shrink-0"}>Use topic</button>
            </article>
          ))}
          <button type="button" onClick={loadTopics} disabled={loadingTopics || pending} className="cs-btn mt-2 justify-self-start"><IconSpark width={16} height={16} />Generate different ideas</button>
        </div>
      ) : (
        <button type="button" onClick={loadTopics} className="cs-btn-primary"><IconSpark width={16} height={16} />Generate topic ideas</button>
      )}
    </StageShell>
  );
}
