"use client";

import { useState, useTransition } from "react";
import type { SelectedTopic } from "@/db/schema";
import { StageShell, ApiNotReady } from "./stage-shell";
import { generateTopicsAction, selectTopicAction } from "../actions";
import { IconSpark, IconArrowRight } from "@/components/icons";

export function TopicsStage({
  projectId,
  suggestions,
  selected,
  hasBrief,
  anthropicReady,
}: {
  projectId: string;
  suggestions: SelectedTopic[];
  selected: SelectedTopic | null;
  hasBrief: boolean;
  anthropicReady: boolean;
}) {
  const [topics, setTopics] = useState<SelectedTopic[]>(suggestions);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [customTitle, setCustomTitle] = useState(selected?.title ?? "");
  const [pending, startTransition] = useTransition();

  async function fetchTopics() {
    setLoading(true);
    setError(null);
    try {
      const result = await generateTopicsAction(projectId);
      setTopics(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not fetch topics.");
    } finally {
      setLoading(false);
    }
  }

  function choose(topic: SelectedTopic) {
    const fd = new FormData();
    fd.set("projectId", projectId);
    fd.set("title", topic.title);
    fd.set("angle", topic.angle ?? "");
    fd.set("whyTimely", topic.whyTimely ?? "");
    fd.set("searchIntent", topic.searchIntent ?? "");
    fd.set("source", topic.source === "suggested" ? "suggested" : "edited");
    startTransition(() => selectTopicAction(fd));
  }

  function chooseCustom() {
    if (!customTitle.trim()) return;
    const fd = new FormData();
    fd.set("projectId", projectId);
    fd.set("title", customTitle.trim());
    fd.set("source", "custom");
    startTransition(() => selectTopicAction(fd));
  }

  return (
    <StageShell
      title="Topic & trend suggestions"
      description="The app searches current trends for your content direction and language market, then proposes timely angles. Pick one, edit it, or write your own."
      wide
    >
      {!anthropicReady ? (
        <ApiNotReady />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={fetchTopics}
              disabled={loading || pending}
              className="cs-btn-primary"
            >
              <IconSpark width={16} height={16} />
              {loading
                ? "Searching trends…"
                : topics.length
                  ? "Regenerate suggestions"
                  : "Suggest topics"}
            </button>
            {hasBrief && (
              <button onClick={skipWithBrief} disabled={pending} className="cs-btn">
                Skip — I provided a brief
              </button>
            )}
          </div>

          {error && (
            <p className="mt-4 rounded-lg border border-danger/30 bg-danger-soft px-4 py-2.5 text-sm text-danger" role="alert">
              {error}
            </p>
          )}

          {loading && (
            <div className="mt-6 grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="cs-card h-40 animate-pulse bg-sunken/40" />
              ))}
            </div>
          )}

          {!loading && topics.length > 0 && (
            <div className="mt-6 grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
              {topics.map((t, i) => (
                <div key={i} className="cs-card flex flex-col p-5">
                  <h3 className="font-semibold leading-snug tracking-tight text-ink">
                    {t.title}
                  </h3>
                  {t.angle && (
                    <p className="mt-2 text-sm leading-relaxed text-ink-2">{t.angle}</p>
                  )}
                  <dl className="mt-3 space-y-1.5 text-xs">
                    {t.whyTimely && (
                      <div>
                        <dt className="inline font-medium text-ink-3">Timely: </dt>
                        <dd className="inline text-ink-2">{t.whyTimely}</dd>
                      </div>
                    )}
                    {t.searchIntent && (
                      <div>
                        <dt className="inline font-medium text-ink-3">Intent: </dt>
                        <dd className="inline text-ink-2">{t.searchIntent}</dd>
                      </div>
                    )}
                  </dl>
                  <div className="mt-4 flex gap-2 pt-1">
                    <button
                      onClick={() => choose(t)}
                      disabled={pending}
                      className="cs-btn-primary flex-1 !py-1.5 text-sm"
                    >
                      Use this
                    </button>
                    <button
                      onClick={() => setCustomTitle(t.title)}
                      disabled={pending}
                      className="cs-btn !py-1.5 text-sm"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-8 border-t border-line pt-6">
            <label className="cs-label">Or write / edit your own topic</label>
            <div className="flex flex-wrap gap-2">
              <input
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                className="cs-input flex-1"
                placeholder="Type the exact topic/title you want to write about"
              />
              <button
                onClick={chooseCustom}
                disabled={pending || !customTitle.trim()}
                className="cs-btn-primary"
              >
                Use this topic
                <IconArrowRight width={16} height={16} />
              </button>
            </div>
          </div>
        </>
      )}
    </StageShell>
  );

  function skipWithBrief() {
    const fd = new FormData();
    fd.set("projectId", projectId);
    fd.set("title", "From brief");
    fd.set("source", "brief");
    startTransition(() => selectTopicAction(fd));
  }
}
