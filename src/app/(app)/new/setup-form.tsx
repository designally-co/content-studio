"use client";

import { useRef, useState } from "react";
import type { SelectedTopic } from "@/db/schema";
import { createProjectAction, generateTopicIdeasAction } from "./actions";
import { PillarDirectionPicker } from "./pillar-direction-picker";
import { Sparkles, PenLine, FileText } from "lucide-react";
import OrbitingCirclesGlobe from "@/components/ui/orbiting-circles-02";

export type PillarGroup = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  directions: { id: string; name: string }[];
};

export function SetupForm({ pillars, anthropicReady }: { pillars: PillarGroup[]; anthropicReady: boolean }) {
  const [pending, setPending] = useState(false);
  const [startMode, setStartMode] = useState<"topic" | "brief" | "discover">("topic");
  // Content is English-only; language is fixed and no longer user-selectable.
  const language = "en" as const;
  const firstPillar = pillars[0];
  const [selection, setSelection] = useState<{ pillarId: string; directionId: string }>({
    pillarId: firstPillar?.id ?? "",
    directionId: firstPillar?.directions[0]?.id ?? "",
  });
  const [topics, setTopics] = useState<SelectedTopic[]>([]);
  const [generatingTopics, setGeneratingTopics] = useState(false);
  const [topicError, setTopicError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const chosenTopicRef = useRef<HTMLInputElement>(null);
  const chosenAngleRef = useRef<HTMLInputElement>(null);
  const chosenWhyTimelyRef = useRef<HTMLInputElement>(null);
  const chosenSearchIntentRef = useRef<HTMLInputElement>(null);
  const chosenResearchSourcesRef = useRef<HTMLInputElement>(null);

  async function generateTopics() {
    setGeneratingTopics(true);
    setTopicError(null);
    try {
      const result = await generateTopicIdeasAction({
        categoryId: selection.directionId || undefined,
        language,
      });
      if (result.length === 0) throw new Error("No topic ideas were returned. Try another direction.");
      setTopics(result);
    } catch (reason) {
      setTopicError(reason instanceof Error ? reason.message : "Could not generate topic ideas.");
    } finally {
      setGeneratingTopics(false);
    }
  }

  function chooseTopic(topic: SelectedTopic) {
    if (chosenTopicRef.current) chosenTopicRef.current.value = topic.title;
    if (chosenAngleRef.current) chosenAngleRef.current.value = topic.angle || "";
    if (chosenWhyTimelyRef.current) chosenWhyTimelyRef.current.value = topic.whyTimely || "";
    if (chosenSearchIntentRef.current) chosenSearchIntentRef.current.value = topic.searchIntent || "";
    if (chosenResearchSourcesRef.current) chosenResearchSourcesRef.current.value = JSON.stringify(topic.researchSources || []);
    formRef.current?.requestSubmit();
  }

  // The content direction (pillar + direction) is the first step and required —
  // it becomes the article's category and publishing tags, and in "No idea yet"
  // it's the basis for the generated topic ideas (so changing it clears them).
  const directionPicker = (
    <div>
      <span className="cs-label">Content pillar &amp; direction</span>
      <PillarDirectionPicker
        pillars={pillars}
        pillarId={selection.pillarId}
        directionId={selection.directionId}
        onChange={(next) => {
          setSelection(next);
          setTopics([]);
        }}
      />
    </div>
  );

  return (
    <form ref={formRef} action={createProjectAction} onSubmit={() => setPending(true)} className="mx-auto w-full max-w-7xl px-4 pb-16 pt-6 sm:px-6 sm:pb-20 sm:pt-8 lg:px-12 lg:pb-24 xl:px-16">
      <div className="mx-auto max-w-3xl">
      <input type="hidden" name="articleMode" value="editorial" />
      <input type="hidden" name="language" value="en" />
      <input ref={chosenTopicRef} type="hidden" name="chosenTopic" />
      <input ref={chosenAngleRef} type="hidden" name="chosenAngle" />
      <input ref={chosenWhyTimelyRef} type="hidden" name="chosenWhyTimely" />
      <input ref={chosenSearchIntentRef} type="hidden" name="chosenSearchIntent" />
      <input ref={chosenResearchSourcesRef} type="hidden" name="chosenResearchSources" />
      {!anthropicReady && (
        <div className="mb-8 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3.5 text-sm text-ink-2">
          <strong>No Anthropic API key is configured.</strong> Article generation will be unavailable until `ANTHROPIC_API_KEY` is configured.
        </div>
      )}

      {directionPicker}

      <fieldset className="mt-8">
        <legend className="cs-label">What do you have?</legend>
        <div className="grid grid-cols-3 gap-2">
          {([
            ["topic", "A topic", PenLine],
            ["brief", "A brief", FileText],
            ["discover", "No idea yet", Sparkles],
          ] as const).map(([value, label, Icon]) => {
            const active = startMode === value;
            return (
              <label
                key={value}
                className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-3 text-center text-sm font-semibold transition-colors sm:flex-row sm:gap-2 sm:px-3 ${
                  active ? "border-accent bg-accent-soft text-accent-press" : "border-line bg-surface text-ink hover:border-line-strong"
                }`}
              >
                <input type="radio" name="startMode" value={value} checked={active} onChange={() => setStartMode(value)} className="sr-only" />
                <Icon aria-hidden className={`size-4 shrink-0 ${active ? "text-accent-press" : "text-ink-3"}`} strokeWidth={1.8} />
                {label}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-7 space-y-6">
        {startMode === "topic" && (
          <Field label="Topic or working title" htmlFor="exact-topic">
            <input id="exact-topic" name="exactTopic" className="cs-input" placeholder="e.g. The best new typefaces for July 2026 — be specific when timing matters" required />
          </Field>
        )}
        {startMode === "brief" && (
          <Field label="Article brief" htmlFor="project-brief">
            <textarea id="project-brief" name="brief" rows={7} className="cs-textarea text-base leading-relaxed" placeholder="Describe the subject, useful context, and what the finished article should cover." required />
          </Field>
        )}
        {startMode === "discover" && (
          <div className="space-y-4">
            {generatingTopics ? (
              <div className="space-y-3" aria-label="Generating topic ideas">
                {[0, 1, 2].map((item) => (
                  <div key={item} className="h-24 animate-pulse rounded-xl border border-line bg-sunken/50" />
                ))}
              </div>
            ) : topics.length === 0 ? (
              <div className="overflow-hidden rounded-2xl border border-line bg-sunken/50 text-center">
                <div className="px-6 pt-8">
                  <h3 className="font-heading text-lg font-bold tracking-tight text-ink">Find timely topic ideas</h3>
                  <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-ink-3">
                    AI researches your content direction and suggests on-brand topics worth writing right now.
                  </p>
                  <button type="button" onClick={generateTopics} disabled={!anthropicReady} className="cs-btn-primary mt-5">
                    <Sparkles width={16} height={16} />
                    Generate topic ideas
                  </button>
                </div>
                {/* Full-width, flush to the card's bottom edge — the globe sits on the base. */}
                <div className="mt-6">
                  <OrbitingCirclesGlobe />
                </div>
              </div>
            ) : (
              <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-ink">Pick a topic to draft</span>
                  <button type="button" onClick={generateTopics} disabled={!anthropicReady} className="cs-btn shrink-0 !h-9 text-sm">
                    <Sparkles width={15} height={15} />
                    Regenerate
                  </button>
                </div>
                <div className="divide-y divide-line border-y border-line">
                  {topics.map((topic, index) => (
                    <article key={`${topic.title}-${index}`} className="flex flex-col gap-4 py-5 sm:flex-row sm:items-start">
                      <div className="min-w-0 flex-1">
                        {index === 0 && <p className="mb-1 text-xs font-semibold text-accent-ink">Recommended</p>}
                        <h3 className="font-semibold tracking-tight text-ink">{topic.title}</h3>
                        {topic.angle && <p className="mt-2 text-sm leading-relaxed text-ink-3">{topic.angle}</p>}
                      </div>
                      <button type="button" onClick={() => chooseTopic(topic)} disabled={pending} className={index === 0 ? "cs-btn-primary shrink-0" : "cs-btn shrink-0"}>Select topic</button>
                    </article>
                  ))}
                </div>
              </div>
            )}
            {topicError && !generatingTopics && (
              <p className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">{topicError}</p>
            )}
          </div>
        )}
      </div>

      <div className="mt-8 flex justify-end">
        {startMode !== "discover" && (
          <button type="submit" disabled={pending} className="cs-btn-primary h-12 w-full px-6 text-base sm:w-auto">
            {pending ? "Creating article…" : "Continue to draft"}
          </button>
        )}
      </div>
      </div>
    </form>
  );
}

function Field({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="cs-label" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <p className="mt-1.5 text-sm text-ink-3">{hint}</p>}
    </div>
  );
}
