"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Save, Upload, X } from "lucide-react";
import { TagInput, ChipSelect } from "@/components/tag-input";
import { LogoOverlayControls, LogoOverlayPreview } from "@/components/logo-overlay";
import { saveBrandAction } from "./actions";
import type { InferSelectModel } from "drizzle-orm";
import type { brandProfiles, LogoOverlay } from "@/db/schema";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Section, Plate } from "./section";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { parseBrandStrategy } from "@/lib/designally-strategy";

type Brand = Omit<
  InferSelectModel<typeof brandProfiles>,
  "profileImageUrl" | "profileImageData" | "profileImageMime" | "logoData" | "logoMime"
> & { hasLogo: boolean };

const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // keep in sync with actions.ts

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
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<LogoOverlay>(brand.logoOverlay);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!logoPreview) return;
    return () => URL.revokeObjectURL(logoPreview);
  }, [logoPreview]);

  const storedLogo = brand.hasLogo ? "/api/brand-logo" : "";
  const logoSrc = logoPreview ? logoPreview : removeLogo ? "" : storedLogo;
  const strategy = useMemo(() => parseBrandStrategy(brand.guidelineText), [brand.guidelineText]);

  function onLogoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setLogoError("That file isn't an image.");
      event.target.value = "";
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setLogoError("Logo is larger than 2 MB. Please choose a smaller file.");
      event.target.value = "";
      return;
    }
    setLogoError(null);
    setRemoveLogo(false);
    setLogoPreview(URL.createObjectURL(file));
  }

  function onClearLogo() {
    setLogoPreview(null);
    setLogoError(null);
    setRemoveLogo(brand.hasLogo);
    if (logoInputRef.current) logoInputRef.current.value = "";
  }

  const initials = useMemo(() => {
    const source = brand.name || "Brand";
    return source
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("");
  }, [brand.name]);


  return (
    <form action={saveBrandAction} className="space-y-14">
      <input type="hidden" name="id" value={brand.id} />
      <input type="hidden" name="removeLogo" value={removeLogo ? "1" : ""} />
      <input type="hidden" name="logoOverlay" value={JSON.stringify(overlay)} />

      {/* 1 — Identity */}
      <Section
        title="Brand identity"
        description="How the brand is identified across the app and on generated images."
      >
        <Plate className="space-y-6">
          <div className="flex flex-wrap items-center gap-5">
            <Avatar className="size-20 rounded-2xl bg-sunken">
              {logoSrc ? <AvatarImage src={logoSrc} alt={`${brand.name} logo`} className="object-contain p-2.5" /> : null}
              <AvatarFallback className="rounded-2xl bg-sunken text-2xl font-semibold text-ink-3">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 space-y-2.5">
              <div>
                <p className="text-sm font-medium text-ink">Brand logo</p>
                <p className="mt-0.5 max-w-[46ch] text-sm text-ink-3">
                  Shown across the app and available as an overlay on generated images. Transparent PNG works best.
                </p>
              </div>
              <input ref={logoInputRef} id="brand-logo-file" type="file" name="logo" accept="image/*" className="sr-only" onChange={onLogoChange} />
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => logoInputRef.current?.click()}>
                  <Upload />{logoSrc ? "Replace" : "Upload logo"}
                </Button>
                {logoSrc ? <Button type="button" variant="ghost" size="sm" onClick={onClearLogo}><X />Remove</Button> : null}
              </div>
              {logoError ? <p className="text-xs font-medium text-danger-ink">{logoError}</p> : null}
            </div>
          </div>

          {/* The overlay controls act on a logo, and the preview has nothing to
              show without one — disabled sliders beside an empty frame was the
              largest dead area on the page. Both arrive with the logo. */}
          {logoSrc && (
            <div className="grid gap-6 border-t border-line pt-6 md:grid-cols-[minmax(0,1fr)_minmax(15rem,0.7fr)]">
              <div>
                <p className="mb-2.5 text-sm font-medium text-ink">Image-overlay defaults</p>
                <LogoOverlayControls value={overlay} onChange={setOverlay} disabled={!logoSrc} />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-ink">Preview</p>
                <LogoOverlayPreview logoSrc={logoSrc || undefined} overlay={overlay} />
                <p className="text-xs leading-5 text-ink-3">Placement is still adjustable per image during Finalize.</p>
              </div>
            </div>
          )}

          <div className="grid gap-5 border-t border-line pt-6 sm:grid-cols-2">
            <Field label="Name" htmlFor="brand-name" required>
              <Input id="brand-name" name="name" defaultValue={brand.name} required placeholder="e.g. Designally" />
            </Field>
          </div>
          <Field label="Description" htmlFor="brand-description">
            <Textarea
              id="brand-description"
              name="description"
              defaultValue={brand.description}
              placeholder="Internal note describing this profile"
            />
          </Field>
        </Plate>
      </Section>

      {/* 2 — Writing guidelines */}
      <Section
        title="Writing guidelines"
        description="Optional brand-specific writing guidance applied alongside tone and terminology."
      >
        <Plate>
          <Field label="Additional writing guidance" htmlFor="strategy-additional">
            <Textarea
              id="strategy-additional"
              name="strategyAdditional"
              defaultValue={strategy.additionalGuidelines || strategy.voice}
              className="min-h-36"
              placeholder="Any voice, terminology, or editorial guidance not covered below…"
            />
          </Field>
        </Plate>
      </Section>

      {/* 3 — Tone of voice */}
      <Section
        title="Tone of voice"
        description="The personality and language constraints the model should follow."
      >
        <Plate className="space-y-5">
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
        </Plate>
      </Section>

      {/* 4 — Terminology & rules */}
      <Section
        title="Terminology and rules"
        description="Exact wording, preferred phrases, and boundaries for the brand."
      >
        <Plate className="space-y-5">
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
        </Plate>
      </Section>

      {/* 5 — Audience */}
      <Section
        title="Audience"
        description="Who the articles are written for. Added to every generation."
      >
        <Plate>
          <Field label="Target audience" htmlFor="audience">
            <Textarea
              id="audience"
              name="audience"
              defaultValue={brand.audience}
              placeholder="e.g. SME owners in Thailand evaluating a website refresh"
            />
          </Field>
        </Plate>
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
