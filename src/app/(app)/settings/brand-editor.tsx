"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Save, Upload, X } from "lucide-react";
import { TagInput, ChipSelect } from "@/components/tag-input";
import { LogoOverlayControls, LogoOverlayPreview } from "@/components/logo-overlay";
import { saveBrandAction } from "./actions";
import type { InferSelectModel } from "drizzle-orm";
import type { brandProfiles, LogoOverlay } from "@/db/schema";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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

const LANGUAGE_LABELS: Record<"en" | "th", string> = {
  en: "English",
  th: "Thai",
};

export function BrandEditor({ brand }: { brand: Brand }) {
  const [langs, setLangs] = useState<string[]>(brand.languages ?? ["en"]);
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

  function toggleLang(language: "th" | "en") {
    setLangs((prev) =>
      prev.includes(language)
        ? prev.filter((item) => item !== language)
        : [...prev, language]
    );
  }

  return (
    <form action={saveBrandAction} className="space-y-6">
      <input type="hidden" name="id" value={brand.id} />
      <input type="hidden" name="languages" value={JSON.stringify(langs)} />
      <input type="hidden" name="removeLogo" value={removeLogo ? "1" : ""} />
      <input type="hidden" name="logoOverlay" value={JSON.stringify(overlay)} />

      {/* 1 — Identity */}
      <Card>
        <CardHeader>
          <CardTitle>Brand Identity</CardTitle>
          <CardDescription>
            One logo represents this brand across the app and on generated images.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-6 border-b border-border pb-6 md:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)]">
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar className="size-24 rounded-2xl border border-border bg-muted/25">
                  {logoSrc ? <AvatarImage src={logoSrc} alt={`${brand.name} logo`} className="object-contain p-2" /> : null}
                  <AvatarFallback className="rounded-2xl text-2xl font-semibold">{initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 space-y-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">Brand logo</p>
                    <p className="mt-1 max-w-[48ch] text-sm text-muted-foreground">
                      Used as the brand profile image and as the optional logo overlay on generated images. Transparent PNG works best.
                    </p>
                  </div>
                  <input ref={logoInputRef} id="brand-logo-file" type="file" name="logo" accept="image/*" className="sr-only" onChange={onLogoChange} />
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => logoInputRef.current?.click()}>
                      <Upload />{logoSrc ? "Replace logo" : "Upload logo"}
                    </Button>
                    {logoSrc ? <Button type="button" variant="ghost" size="sm" onClick={onClearLogo}><X />Remove</Button> : null}
                  </div>
                  {logoError ? <p className="text-xs font-medium text-destructive">{logoError}</p> : null}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium text-foreground">Image-overlay defaults</p>
                <LogoOverlayControls value={overlay} onChange={setOverlay} disabled={!logoSrc} />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Generated-image preview</p>
              <LogoOverlayPreview logoSrc={logoSrc || undefined} overlay={overlay} />
              <p className="text-xs leading-5 text-muted-foreground">Placement can still be adjusted for each image during Finalize.</p>
            </div>
          </div>

          <Field label="Name" htmlFor="brand-name" required>
            <Input
              id="brand-name"
              name="name"
              defaultValue={brand.name}
              required
              placeholder="e.g. Designally"
            />
          </Field>
          <Field label="Description" htmlFor="brand-description">
            <Textarea
              id="brand-description"
              name="description"
              defaultValue={brand.description}
              placeholder="Internal note describing this profile"
            />
          </Field>

          <Field label="Default languages">
            <div className="flex flex-wrap gap-2">
              {(["en", "th"] as const).map((language) => {
                const active = langs.includes(language);
                return (
                  <Button
                    key={language}
                    type="button"
                    variant={active ? "default" : "outline"}
                    onClick={() => toggleLang(language)}
                  >
                    {active ? <Check /> : null}
                    {LANGUAGE_LABELS[language]}
                  </Button>
                );
              })}
            </div>
          </Field>
        </CardContent>
      </Card>

      {/* 2 — Tone of voice */}
      <Card>
        <CardHeader>
          <CardTitle>Tone Of Voice</CardTitle>
          <CardDescription>
            The personality and language constraints the model should follow.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
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
        </CardContent>
      </Card>

      {/* 3 — Terminology & rules */}
      <Card>
        <CardHeader>
          <CardTitle>Terminology & Rules</CardTitle>
          <CardDescription>
            Exact wording, preferred phrases, and boundaries for the brand.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
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
        </CardContent>
      </Card>

      {/* 4 — Audience & defaults */}
      <Card>
        <CardHeader>
          <CardTitle>Audience & Defaults</CardTitle>
          <CardDescription>
            Reusable context added to new projects for this brand.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Field label="Target audience" htmlFor="audience">
            <Textarea
              id="audience"
              name="audience"
              defaultValue={brand.audience}
              placeholder="e.g. SME owners in Thailand evaluating a website refresh"
            />
          </Field>
          <div className="grid gap-5 md:grid-cols-3">
            <Field label="Default CTA" htmlFor="default-cta">
              <Input
                id="default-cta"
                name="cta"
                defaultValue={brand.defaults.cta}
                placeholder="Book a consult"
              />
            </Field>
            <Field label="Links" htmlFor="default-links">
              <Input
                id="default-links"
                name="links"
                defaultValue={brand.defaults.links}
                placeholder="designally.co"
              />
            </Field>
            <Field label="Default hashtags" htmlFor="default-hashtags">
              <Input
                id="default-hashtags"
                name="hashtags"
                defaultValue={brand.defaults.hashtags}
                placeholder="#webdesign #SEO"
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      {/* 5 — Guidelines */}
      <Card>
        <CardHeader>
          <CardTitle>Brand Guidelines</CardTitle>
          <CardDescription>
            Paste guideline excerpts to inject into prompts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            name="guidelineText"
            defaultValue={brand.guidelineText}
            className="min-h-40"
            placeholder="Paste any brand guideline content here..."
          />
        </CardContent>
      </Card>

      <div className="flex justify-end border-t border-border pt-5">
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
