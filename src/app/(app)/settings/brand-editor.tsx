"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ImagePlus, Save, Upload, X } from "lucide-react";
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
  "profileImageData" | "profileImageMime" | "logoData" | "logoMime"
> & { hasImage: boolean; hasLogo: boolean };

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
  const [imageUrl, setImageUrl] = useState(brand.profileImageUrl ?? "");
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!filePreview) return;
    return () => URL.revokeObjectURL(filePreview);
  }, [filePreview]);

  const storedSrc = brand.hasImage ? `/api/brand-image/${brand.id}` : "";
  const displaySrc = filePreview
    ? filePreview
    : removeImage
      ? ""
      : storedSrc || imageUrl;

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setFileError("That file isn't an image.");
      event.target.value = "";
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setFileError("Image is larger than 2 MB. Please choose a smaller file.");
      event.target.value = "";
      return;
    }
    setFileError(null);
    setRemoveImage(false);
    setFilePreview(URL.createObjectURL(file));
  }

  function onClearImage() {
    setFilePreview(null);
    setFileError(null);
    setImageUrl("");
    setRemoveImage(brand.hasImage);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // ---- brand logo (for image overlays) ----
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
      <input type="hidden" name="removeImage" value={removeImage ? "1" : ""} />
      <input type="hidden" name="removeLogo" value={removeLogo ? "1" : ""} />
      <input type="hidden" name="logoOverlay" value={JSON.stringify(overlay)} />

      {/* 1 — Identity */}
      <Card>
        <CardHeader>
          <CardTitle>Brand Identity</CardTitle>
          <CardDescription>
            Basic details and the image used to recognize this brand across the
            app.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Preserve any existing image URL without exposing an editable field */}
          <input type="hidden" name="profileImageUrl" value={imageUrl} />

          {/* Profile picture on top */}
          <Card size="sm" className="bg-muted/25">
            <CardContent className="flex flex-col items-center gap-4 pt-2 text-center">
              <Avatar className="size-24 rounded-2xl">
                {displaySrc ? <AvatarImage src={displaySrc} alt="" /> : null}
                <AvatarFallback className="rounded-2xl text-2xl font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-1">
                <div className="flex items-center justify-center gap-1.5 text-sm font-medium text-foreground">
                  <ImagePlus className="size-4" />
                  Profile picture
                </div>
                <p className="text-xs leading-5 text-muted-foreground">
                  Upload a logo or avatar image (PNG, JPG, SVG — up to 2&nbsp;MB).
                </p>
              </div>
              <input
                ref={fileInputRef}
                id="profile-image-file"
                type="file"
                name="profileImage"
                accept="image/*"
                className="sr-only"
                onChange={onFileChange}
              />
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload />
                  {displaySrc ? "Replace" : "Upload image"}
                </Button>
                {displaySrc ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onClearImage}
                  >
                    <X />
                    Remove
                  </Button>
                ) : null}
              </div>
              {fileError ? (
                <p className="text-xs font-medium text-destructive">{fileError}</p>
              ) : null}
            </CardContent>
          </Card>

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

      {/* 2 — Brand logo for image overlays */}
      <Card>
        <CardHeader>
          <CardTitle>Brand Logo (on images)</CardTitle>
          <CardDescription>
            Overlaid onto generated companion images. A transparent PNG works
            best. Set the default placement here — you can still adjust it per
            image at the Finalize step.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-[repeating-conic-gradient(theme(colors.muted.DEFAULT)_0_25%,transparent_0_50%)] bg-[length:16px_16px]">
                  {logoSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={logoSrc}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <ImagePlus className="size-5 text-muted-foreground" />
                  )}
                </div>
                <input
                  ref={logoInputRef}
                  id="brand-logo-file"
                  type="file"
                  name="logo"
                  accept="image/*"
                  className="sr-only"
                  onChange={onLogoChange}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => logoInputRef.current?.click()}
                  >
                    <Upload />
                    {logoSrc ? "Replace logo" : "Upload logo"}
                  </Button>
                  {logoSrc ? (
                    <Button type="button" variant="ghost" size="sm" onClick={onClearLogo}>
                      <X />
                      Remove
                    </Button>
                  ) : null}
                </div>
              </div>
              {logoError ? (
                <p className="text-xs font-medium text-destructive">{logoError}</p>
              ) : null}

              <LogoOverlayControls
                value={overlay}
                onChange={setOverlay}
                disabled={!logoSrc}
              />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Default placement preview
              </p>
              <LogoOverlayPreview logoSrc={logoSrc || undefined} overlay={overlay} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3 — Tone of voice */}
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
