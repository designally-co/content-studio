"use client";

import { useMemo } from "react";
import { Save } from "lucide-react";
import { TagInput, ChipSelect } from "@/components/tag-input";
import { saveBrandAction } from "./actions";
import type { InferSelectModel } from "drizzle-orm";
import type { brandProfiles } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Section } from "./section";
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
    <form action={saveBrandAction} className="space-y-14">
      <input type="hidden" name="id" value={brand.id} />

      {/* 1 — Identity */}
      <Section
        title="Brand identity"
        description="How the brand is identified across the app."
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

      {/* 2 — Writing guidelines */}
      <Section
        title="Writing guidelines"
        description="Applied alongside tone and terminology."
      >
        <div>
          <Field label="Additional writing guidance" htmlFor="strategy-additional">
            <Textarea
              id="strategy-additional"
              name="strategyAdditional"
              defaultValue={strategy.additionalGuidelines || strategy.voice}
              className="min-h-36"
              placeholder="Any voice, terminology, or editorial guidance not covered below…"
            />
          </Field>
        </div>
      </Section>

      {/* 3 — Tone of voice */}
      <Section
        title="Tone of voice"
        description="The personality and language the model follows."
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

      {/* 4 — Terminology & rules */}
      <Section
        title="Terminology and rules"
        description="Exact wording, preferred phrases, and boundaries."
      >
        <div className="space-y-5">
          <Field label="Terminology">
            <TagInput
              name="terminology"
              defaultValue={brand.terminology ?? []}
              placeholder="e.g. Designally (not Design Ally)"
            />
          </Field>
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Always do">
              <TagInput
                name="dos"
                defaultValue={brand.dos ?? []}
                placeholder="Add a rule"
              />
            </Field>
            <Field label="Never do">
              <TagInput
                name="donts"
                defaultValue={brand.donts ?? []}
                placeholder="Add a rule"
              />
            </Field>
          </div>
        </div>
      </Section>

      {/* 5 — Audience */}
      <Section
        title="Audience"
        description="Who the articles are written for."
      >
        <div>
          <Field label="Target audience" htmlFor="audience">
            <Textarea
              id="audience"
              name="audience"
              defaultValue={brand.audience}
              placeholder="e.g. SME owners in Thailand evaluating a website refresh"
            />
          </Field>
        </div>
      </Section>

      <div className="flex justify-end pt-2">
        <Button type="submit">
          <Save />
          Save brand
        </Button>
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
