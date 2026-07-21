"use client";

import { useRef, useState } from "react";
import type { SelectedTopic } from "@/db/schema";
import { createProjectAction, generateTopicIdeasAction } from "./actions";
import { CategoryCombobox, type CategorySelection } from "./category-combobox";
import { IconArrowRight, IconSpark } from "@/components/icons";

type Cat = { id: string; name: string };

export function SetupForm({ categories, anthropicReady }: { categories: Cat[]; anthropicReady: boolean }) {
  const [pending, setPending] = useState(false);
  const [startMode, setStartMode] = useState<"topic" | "brief" | "discover">("topic");
  const [language, setLanguage] = useState<"en" | "th" | "both">("en");
  const [category, setCategory] = useState<CategorySelection>(
    categories[0] ? { kind: "existing", id: categories[0].id, name: categories[0].name } : { kind: "new", name: "Creative resources" }
  );
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
        categoryId: category.kind === "existing" ? category.id : undefined,
        categoryName: category.kind === "new" ? category.name : undefined,
        language,
      });
      if (result.length === 0) throw new Error("No topic ideas were returned. Try another category.");
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

  return (
    <form ref={formRef} action={createProjectAction} onSubmit={() => setPending(true)} className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6 sm:px-6 sm:pb-20 sm:pt-8 lg:px-8 lg:pb-24">
      <input type="hidden" name="articleMode" value="editorial" />
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

      <fieldset>
        <legend className="cs-label">What do you have?</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {([
            ["topic", "A topic", "Research and draft the subject you already have."],
            ["brief", "A brief", "Turn your context into one researched article."],
            ["discover", "No idea yet", "Choose a category and generate timely topics."],
          ] as const).map(([value, label, description]) => (
            <label key={value} className={`cursor-pointer rounded-xl border p-4 transition-colors ${startMode === value ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-line-strong"}`}>
              <input type="radio" name="startMode" value={value} checked={startMode === value} onChange={() => setStartMode(value)} className="sr-only" />
              <span className="block text-sm font-semibold text-ink">{label}</span>
              <span className="mt-1 block text-xs leading-relaxed text-ink-3">{description}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-7 space-y-6">
        {startMode === "topic" && (
          <Field label="Topic or working title" htmlFor="exact-topic" hint="Be specific when timing matters, for example: The best new typefaces for July 2026.">
            <input id="exact-topic" name="exactTopic" className="cs-input" placeholder="The best new typefaces for July 2026" required />
          </Field>
        )}
        {startMode === "brief" && (
          <Field label="Article brief" htmlFor="project-brief" hint="Describe the subject, useful context, and what the finished article should cover.">
            <textarea id="project-brief" name="brief" rows={7} className="cs-textarea text-base leading-relaxed" placeholder="What should this article explore?" required />
          </Field>
        )}
        {startMode === "discover" && (
          <div className="space-y-5">
            <Field label="Creative category" htmlFor="category-picker" hint="AI will research timely topic ideas inside this category.">
              <CategoryCombobox categories={categories} onSelectionChange={(selection) => { setCategory(selection); setTopics([]); }} />
            </Field>
            <button type="button" onClick={generateTopics} disabled={generatingTopics || !anthropicReady} className="cs-btn-primary">
              <IconSpark width={16} height={16} />
              {generatingTopics ? "Finding timely ideas…" : topics.length ? "Generate different ideas" : "Generate topic ideas"}
            </button>
            {topicError && <p className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">{topicError}</p>}
            {generatingTopics && (
              <div className="space-y-3" aria-label="Generating topic ideas">
                {[0, 1, 2].map((item) => <div key={item} className="h-28 animate-pulse rounded-xl border border-line bg-sunken/50" />)}
              </div>
            )}
            {!generatingTopics && topics.length > 0 && (
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
            )}
          </div>
        )}
        <Field label="Language" htmlFor="project-language">
          <select id="project-language" name="language" className="cs-select" value={language} onChange={(event) => { setLanguage(event.target.value as typeof language); setTopics([]); }}>
            <option value="en">English</option>
            <option value="th">Thai</option>
            <option value="both">Thai + English</option>
          </select>
        </Field>
      </div>

      <div className="mt-10 flex justify-end border-t border-line pt-6">
        {startMode !== "discover" && (
          <button type="submit" disabled={pending} className="cs-btn-primary h-12 w-full px-6 text-base sm:w-auto">
            {pending ? "Creating article…" : "Continue to draft"}
            {!pending && <IconArrowRight width={18} height={18} />}
          </button>
        )}
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
