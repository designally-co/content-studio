"use client";

import { useMemo } from "react";
import { TagInput, ChipSelect } from "@/components/tag-input";
import { saveBrandAction } from "./actions";
import type { InferSelectModel } from "drizzle-orm";
import type { brandProfiles } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Section } from "./section";
import { SettingsPanel } from "./panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { parseBrandStrategy } from "@/lib/designally-strategy";

/** The brand row minus its image bytes, which never leave the server. */
export type BrandForEditor = Omit<
  InferSelectModel<typeof brandProfiles>,
  "profileImageUrl" | "profileImageData" | "profileImageMime" | "logoData" | "logoMime"
> & { hasLogo: boolean };

type Brand = BrandForEditor;

const TONE_PRESETS = [
  "professional",
  "friendly",
  "playful",
  "authoritative",
  "warm",
  "concise",
  "witty",
  "inspirational",
  "technical",
  "conversational",
];

export function BrandEditor({ brand }: { brand: Brand }) {
  const strategy = useMemo(() => parseBrandStrategy(brand.guidelineText), [brand.guidelineText]);

  return (
    /* PLAIN SECTIONS, AND ONE PANEL. Folding all five turned a form into a list
       of five shut doors — four of them hiding a single field, which is more
       work to reach than it ever was to scroll past. A panel earns its fold by
       holding something that costs a step to edit or takes real room; the rest
       are just fields, and fields belong on the page.
    
       Terminology is the one that qualifies: three tag inputs, each needing a
       word typed and committed with Enter rather than simply filled in. It sits
       last, where the routine sheet keeps its advanced settings. */
    <form action={saveBrandAction} className="space-y-14">
      <input type="hidden" name="id" value={brand.id} />

      <Section
        title="Brand identity"
        description="Name and internal description"
      >
        <div className="space-y-5">
          <Field label="Name" htmlFor="brand-name" required>
            <Input id="brand-name" name="name" defaultValue={brand.name} required placeholder="e.g. Designally" />
          </Field>
          <Field label="Description" htmlFor="brand-description">
            <Textarea
              id="brand-description"
              name="description"
              defaultValue={brand.description}
              placeholder="Internal note describing this profile"
            />
          </Field>
        </div>
      </Section>

      <Section
        title="Writing guidelines"
        description="Applied with tone and terms"
      >
        {/* NO FIELD LABEL. "Writing guidelines", then "Applied alongside tone
            and terminology", then "Additional writing guidance" — three lines
            of naming stacked above ONE textarea, the first and third of them
            saying the same thing. A section holding a single field is already
            labelled by its own heading; the label is only carried for screen
            readers, which would otherwise hear the field announced as nothing
            at all. */}
        <Textarea
          id="strategy-additional"
          name="strategyAdditional"
          aria-label="Writing guidelines"
          defaultValue={strategy.additionalGuidelines || strategy.voice}
          className="min-h-36"
          placeholder="Any voice, terminology, or editorial guidance not covered below…"
        />
      </Section>

      <Section
        title="Tone of voice"
        description="The personality and language"
      >
        <div className="space-y-5">
          <Field label="Descriptors">
            <ChipSelect
              name="toneDescriptors"
              options={TONE_PRESETS}
              defaultValue={brand.tone.descriptors ?? []}
            />
          </Field>
          <Field label="Voice notes" htmlFor="tone-free-text">
            <Textarea
              id="tone-free-text"
              name="toneFreeText"
              defaultValue={brand.tone.freeText}
              placeholder="e.g. Speak like a knowledgeable peer. Avoid hype. Short sentences."
            />
          </Field>
        </div>
      </Section>

      <Section
        title="Audience"
        description="Who the articles are for"
      >
        {/* "Audience" over "Target audience" was the same word twice. */}
        <Textarea
          id="audience"
          name="audience"
          aria-label="Audience"
          defaultValue={brand.audience}
          placeholder="e.g. SME owners in Thailand evaluating a website refresh"
        />
      </Section>

      <SettingsPanel
        title="Terminology and rules"
        description="Exact wording and boundaries"
      >
        {/* Stacked, not two columns. Half-width tag fields put a growing list
            of rules in a narrow well beside another one, so each wrapped after
            two or three words while the sheet had room to spare. */}
        <Field label="Terminology">
          <TagInput
            name="terminology"
            label="Terminology"
            defaultValue={brand.terminology ?? []}
            placeholder="e.g. Designally (not Design Ally)"
          />
        </Field>
        <Field label="Always do">
          <TagInput name="dos" label="Always do" defaultValue={brand.dos ?? []} placeholder="Add a rule" />
        </Field>
        <Field label="Never do">
          <TagInput name="donts" label="Never do" defaultValue={brand.donts ?? []} placeholder="Add a rule" />
        </Field>
      </SettingsPanel>

      <div className="flex justify-end pt-1">
        <Button type="submit">Save brand</Button>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      {children}
    </div>
  );
}
