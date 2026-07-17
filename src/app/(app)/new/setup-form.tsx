"use client";

import { useState } from "react";
import { createProjectAction } from "./actions";
import { CategoryCombobox } from "./category-combobox";
import { IconArrowRight } from "@/components/icons";

type Cat = { id: string; name: string };
export function SetupForm({
  categories,
  anthropicReady,
}: {
  categories: Cat[];
  anthropicReady: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [startMode, setStartMode] = useState<"brief" | "topic" | "discover">("brief");

  return (
    <form
      action={createProjectAction}
      onSubmit={() => setPending(true)}
      className="mx-auto max-w-[var(--content-max)] px-4 pb-12 pt-10 sm:px-6 sm:pb-16 sm:pt-14 lg:px-8 lg:pt-16"
    >
      {!anthropicReady && (
        <Banner tone="warn">
          <strong>No Anthropic API key is configured.</strong> You can create projects,
          but generation stages will be unavailable until `ANTHROPIC_API_KEY` is
          configured in the server environment.
        </Banner>
      )}
      <div className="mb-8">
        <h1 className="text-[length:var(--text-h1)] font-bold">
          Start your article
        </h1>
        <p className="mt-3 text-[length:var(--text-lg)] text-ink-3">
          Choose the amount of direction you already have. You can refine it before anything is drafted.
        </p>
      </div>

      <fieldset>
        <legend className="cs-label">How would you like to begin?</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {([
            ["brief", "I have a brief", "Turn your context into one clear direction."],
            ["topic", "I know the topic", "Skip discovery and shape the article plan."],
            ["discover", "Help me discover", "Recommend a direction from the brand and category."],
          ] as const).map(([value, label, description]) => (
            <label key={value} className={`cursor-pointer rounded-xl border p-4 transition-colors ${startMode === value ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-line-strong"}`}>
              <input type="radio" name="startMode" value={value} checked={startMode === value} onChange={() => setStartMode(value)} className="sr-only" />
              <span className="block text-sm font-semibold text-ink">{label}</span>
              <span className="mt-1 block text-xs leading-relaxed text-ink-3">{description}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {startMode === "brief" && (
        <div className="mt-6"><Field label="Brief" htmlFor="project-brief" hint="A few sentences about the goal, audience, and key message are enough."><textarea id="project-brief" name="brief" rows={6} className="cs-textarea text-base leading-relaxed" placeholder="What should the article help the reader understand or do?" required /></Field></div>
      )}
      {startMode === "topic" && (
        <div className="mt-6"><Field label="Topic or working title" htmlFor="exact-topic"><input id="exact-topic" name="exactTopic" className="cs-input" placeholder="e.g. Why our best ideas never come from brainstorms" required /></Field></div>
      )}
      {startMode === "discover" && <p className="mt-5 rounded-xl bg-sunken px-4 py-3 text-sm text-ink-2">We&apos;ll recommend one direction first, with alternatives available if you want them.</p>}

      <Section title="Required">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Category" htmlFor="category-picker" hint="Search, pick, or type a new one to add it.">
            <CategoryCombobox categories={categories} />
          </Field>
          <Field label="Language" htmlFor="project-language">
            <select id="project-language" name="language" className="cs-select" defaultValue="en">
              <option value="en">English</option>
              <option value="th">Thai</option>
              <option value="both">Both (paired versions)</option>
            </select>
          </Field>
        </div>
      </Section>

      <details className="mt-10 border-t border-line pt-6">
        <summary className="cursor-pointer text-sm font-semibold text-ink-2 hover:text-ink">Add optional steering inputs</summary>
        <p className="mt-1.5 text-sm text-ink-3">Keywords, competitor context, search data, and one-off guidelines.</p>
        <div className="mt-6 space-y-6">
        <Field label="Keyword(s)" htmlFor="project-keywords">
          <input id="project-keywords" name="keyword" className="cs-input" placeholder="e.g. responsive web design, SEO Thailand" />
        </Field>
        <Field label="Competitor article URL" htmlFor="competitor-url" hint="The app fetches and summarizes it as reference — it never copies.">
          <input
            id="competitor-url"
            name="competitorUrl"
            type="url"
            className="cs-input"
            placeholder="https://example.com/their-article"
          />
        </Field>
        <Field
          label="Search Console data"
          htmlFor="search-console-data"
          hint="Paste a CSV or table (Query, Impressions, Clicks, Position). Parsed for query insights."
        >
          <textarea
            id="search-console-data"
            name="gsc"
            className="cs-textarea font-mono text-xs"
            placeholder={"Query,Clicks,Impressions,CTR,Position\nweb design bangkok,12,340,3.5%,4.2"}
          />
        </Field>
        <Field label="Extra guidelines for this project" htmlFor="extra-guidelines" hint="One-off guidance layered on top of the brand profile.">
          <textarea id="extra-guidelines" name="extraGuidelines" className="cs-textarea" />
        </Field>
        </div>
      </details>

      <div className="mt-10 flex items-center justify-end gap-2 border-t border-line pt-6 sm:mt-12 sm:pt-8">
        <button
          type="submit"
          disabled={pending}
          className="cs-btn-primary h-12 w-full px-6 text-base sm:w-auto"
        >
          {pending ? "Preparing direction…" : "Continue to direction"}
          {!pending && <IconArrowRight width={18} height={18} />}
        </button>
      </div>
    </form>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10 border-t border-line pt-8 sm:mt-12 sm:pt-10">
      <h2 className="text-xs font-semibold uppercase tracking-[var(--tracking-caps)] text-ink-3">
        {title}
      </h2>
      {subtitle && <p className="mt-1.5 text-sm text-ink-3">{subtitle}</p>}
      <div className="mt-6 space-y-6">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  htmlFor,
  required,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="cs-label" htmlFor={htmlFor}>
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-[length:var(--text-sm)] text-ink-3">{hint}</p>}
    </div>
  );
}

function Banner({
  tone,
  children,
}: {
  tone: "warn" | "danger";
  children: React.ReactNode;
}) {
  const cls =
    tone === "warn"
      ? "border-warn/30 bg-warn-soft"
      : "border-danger/30 bg-danger-soft";
  return (
    <div className={`mb-8 rounded-xl border px-4 py-3.5 text-sm text-ink-2 ${cls}`}>
      {children}
    </div>
  );
}
