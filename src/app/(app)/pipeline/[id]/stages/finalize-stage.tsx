"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Markdown } from "@/components/markdown";
import { CopyButton } from "@/components/copy-button";
import { LogoOverlayControls, LogoOverlayPreview } from "@/components/logo-overlay";
import { StageShell } from "./stage-shell";
import { countMetrics } from "@/lib/text";
import { markdownToPlainText } from "@/lib/plain";
import {
  generateImagePromptAction,
  reviewBrandAlignmentAction,
  finalizeProjectAction,
  saveDraftContentAction,
} from "../actions";
import {
  generateImagesAction,
  deleteGeneratedImageAction,
  setImageBrandingAction,
  uploadImageReferenceAction,
  type GeneratedImageView,
  type UploadedReferenceView,
} from "../image-actions";
import { IconSpark, IconDownload, IconCheck, IconTrash } from "@/components/icons";
import { MenuSelect } from "@/components/ui/menu-select";
import type { LogoOverlay } from "@/db/schema";
import type { ImageAspectRatio } from "@/lib/image/providers";
import type { BrandReviewResult } from "@/lib/brand-review";
import {
  ART_DIRECTION_PRESETS,
  IMAGE_DIRECTIONS,
  type ArticleVisualBrief,
  type ArtDirectionSelection,
  type ImageDirection,
} from "@/lib/image/visual-brief";

type ImageModelOption = {
  optionId: string;
  label: string;
  provider: string;
  model: string;
  strengths: string;
  capabilities: {
    aspectRatios: readonly ImageAspectRatio[];
    referenceImages: boolean;
    referenceImagesRequired?: boolean;
    maxReferenceImages: number;
    maxVariations: number;
  };
  indicativePricePerImage: number;
};

type BrandLogo = { hasLogo: boolean; defaultOverlay: LogoOverlay };

export function FinalizeStage({
  projectId,
  draftId,
  longForm,
  draftMd,
  images,
  imageConfig,
  options,
  finalized,
  initialView,
  anthropicReady,
  brandLogo,
}: {
  projectId: string;
  /** shown in the pipeline header; not needed inside this stage */
  title?: string;
  draftId: string;
  longForm: boolean;
  draftMd: string;
  images: GeneratedImageView[];
  imageConfig: { optionId: string; count: number; aspectRatio: string };
  options: ImageModelOption[];
  finalized: boolean;
  initialView: "images" | "complete";
  anthropicReady: boolean;
  brandLogo: BrandLogo;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedView = searchParams.get("view");
  const showCompletion = requestedView === "complete" || (!requestedView && initialView === "complete");

  function show(view: "images" | "complete") {
    router.replace(`/pipeline/${projectId}?stage=6&view=${view}`, { scroll: false });
  }

  return (
    <StageShell
      title="Generate images"
      description="Create optional companion images for the finished article."
      wide
      hideHeader={showCompletion}
    >
      {!showCompletion ? (
        <div>
          <ArticlePanel
            projectId={projectId}
            draftId={draftId}
            longForm={longForm}
            draftMd={draftMd}
            images={images}
            defaultOptionId={imageConfig.optionId}
            defaultCount={imageConfig.count}
            defaultAspectRatio={imageConfig.aspectRatio}
            options={options}
            anthropicReady={anthropicReady}
            brandLogo={brandLogo}
            tab="images"
            onNext={() => show("complete")}
          />
        </div>
      ) : (
        <div>
          <FinalizePanel projectId={projectId} finalized={finalized} />
          <BrandReviewPanel projectId={projectId} anthropicReady={anthropicReady} />
        </div>
      )}
    </StageShell>
  );
}

function ArticlePanel({
  projectId,
  draftId,
  longForm,
  draftMd,
  images,
  defaultOptionId,
  defaultCount,
  defaultAspectRatio,
  options,
  anthropicReady,
  brandLogo,
  tab,
  onNext,
}: {
  projectId: string;
  draftId: string;
  longForm: boolean;
  draftMd: string;
  images: GeneratedImageView[];
  defaultOptionId: string;
  defaultCount: number;
  defaultAspectRatio: string;
  options: ImageModelOption[];
  anthropicReady: boolean;
  brandLogo: BrandLogo;
  tab: "content" | "images";
  onNext: () => void;
}) {
  if (!draftMd) {
    return (
      <section className="cs-card overflow-hidden">
        <div className="border-b border-line px-5 py-3">
          <h3 className="font-semibold tracking-tight text-ink">Final content</h3>
        </div>
        <div className="px-6 py-5">
          <p className="text-sm text-ink-3">No draft was selected.</p>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      {tab === "content" ? (
        <>
      <ContentPanel draftId={draftId} draftMd={draftMd} longForm={longForm} />
          <div className="sticky bottom-0 flex justify-end border-t border-line bg-bg/95 py-4 backdrop-blur">
            <button type="button" onClick={onNext} className="cs-btn-primary">Continue to images</button>
          </div>
        </>
      ) : (
        <>
      <ImagePanel
        projectId={projectId}
        existing={images}
        defaultOptionId={defaultOptionId}
        defaultCount={defaultCount}
        defaultAspectRatio={defaultAspectRatio}
        options={options}
        anthropicReady={anthropicReady}
        brandLogo={brandLogo}
      />
          <div className="sticky bottom-0 flex justify-end border-t border-line bg-bg/95 py-4 backdrop-blur">
            <button type="button" onClick={onNext} className="cs-btn-primary">Review &amp; finalize</button>
          </div>
        </>
      )}
    </div>
  );
}

/** The whole piece in one block — read it rendered, or edit the raw Markdown. */
function ContentPanel({
  draftId,
  draftMd,
  longForm,
}: {
  draftId: string;
  draftMd: string;
  longForm: boolean;
}) {
  const [md, setMd] = useState(draftMd);
  const [mode, setMode] = useState<"preview" | "edit">("preview");
  const [dirty, setDirty] = useState(false);
  const [saving, startSave] = useTransition();

  // Debounced autosave of edited text back to the selected draft.
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => {
      startSave(() => saveDraftContentAction(draftId, md));
    }, 900);
    return () => clearTimeout(t);
  }, [md, dirty, draftId]);

  const metrics = countMetrics(md);
  // Draft's editor shows a read time beside the count. Thai has no word
  // spacing, so estimate from characters there and from words elsewhere.
  const readMins = Math.max(
    1,
    Math.round(metrics.isThai ? metrics.chars / 400 : metrics.words / 200)
  );

  return (
    <section className="cs-card overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-6 py-4">
        <span className="inline-flex h-6 items-center rounded-full bg-accent-soft px-2.5 font-heading text-xs font-semibold text-accent-press">
          Draft
        </span>
        <span className="num text-[length:var(--text-sm)] text-ink-3">
          {metrics.label} · ~{readMins} min read
        </span>
        <span className="text-xs text-ink-3" aria-live="polite">{saving ? "Saving…" : dirty ? "Saved" : ""}</span>
        <div className="flex flex-1 justify-end gap-2">
          <button
            type="button"
            onClick={() => setMode((m) => (m === "edit" ? "preview" : "edit"))}
            className="cs-btn !h-9 text-sm"
          >
            {mode === "edit" ? "Preview" : "Edit"}
          </button>
          <CopyButton text={md} label="Copy Markdown" className="cs-btn !h-9 text-sm" />
          <CopyButton
            text={markdownToPlainText(md)}
            label="Copy plain text"
            className="cs-btn !h-9 text-sm"
          />
        </div>
      </div>
      {mode === "edit" ? (
        <div className="px-5 py-5">
          <textarea
            value={md}
            onChange={(e) => {
              setMd(e.target.value);
              setDirty(true);
            }}
            className={`cs-textarea text-sm ${longForm ? "min-h-[36rem]" : "min-h-[16rem]"}`}
          />
        </div>
      ) : (
        <div className={`overflow-y-auto px-6 py-5 ${longForm ? "max-h-[46rem]" : "max-h-[32rem]"}`}>
          <Markdown>{md}</Markdown>
        </div>
      )}
    </section>
  );
}

function ImagePanel({
  projectId,
  existing,
  defaultOptionId,
  defaultCount,
  defaultAspectRatio,
  options,
  anthropicReady,
  brandLogo,
}: {
  projectId: string;
  existing: GeneratedImageView[];
  defaultOptionId: string;
  defaultCount: number;
  defaultAspectRatio: string;
  options: ImageModelOption[];
  anthropicReady: boolean;
  brandLogo: BrandLogo;
}) {
  const requestedOption = options.find((option) => option.optionId === defaultOptionId);
  const initialOption = requestedOption ?? options[0];
  const initialOptionId = initialOption?.optionId ?? "";
  const requestedInitialRatio = (defaultAspectRatio || "1:1") as ImageAspectRatio;
  const initialRatio = initialOption?.capabilities.aspectRatios.includes(requestedInitialRatio)
    ? requestedInitialRatio
    : initialOption?.capabilities.aspectRatios[0] ?? "1:1";
  const [prompt, setPrompt] = useState("");
  const [direction, setDirection] = useState<ImageDirection>("auto");
  // Designally house style is the official default; users can override it below.
  const [artDirection, setArtDirection] = useState<ArtDirectionSelection>("designally_ci");
  const [visualBrief, setVisualBrief] = useState<ArticleVisualBrief | null>(null);
  const [optionId, setOptionId] = useState(initialOptionId);
  const [count, setCount] = useState(
    Math.min(Math.max(defaultCount, 1), initialOption?.capabilities.maxVariations ?? 1)
  );
  const [aspectRatio, setAspectRatio] = useState<ImageAspectRatio>(initialRatio);
  const [reference, setReference] = useState<UploadedReferenceView | null>(null);
  const [uploading, setUploading] = useState(false);
  const [imgs, setImgs] = useState<GeneratedImageView[]>(existing);
  const [busy, setBusy] = useState<"prompt" | "gen" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedOption = useMemo(
    () => options.find((option) => option.optionId === optionId) ?? options[0],
    [optionId, options]
  );

  function selectModel(nextOptionId: string) {
    const next = options.find((option) => option.optionId === nextOptionId);
    setOptionId(nextOptionId);
    if (!next) return;
    if (!next.capabilities.aspectRatios.includes(aspectRatio)) {
      setAspectRatio(next.capabilities.aspectRatios[0] ?? "1:1");
    }
    if (!next.capabilities.referenceImages) setReference(null);
    setCount((current) => Math.min(current, next.capabilities.maxVariations));
  }

  async function uploadReference(file: File) {
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      setReference(await uploadImageReferenceAction(projectId, formData));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reference upload failed.");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } finally {
      setUploading(false);
    }
  }

  async function draftPrompt() {
    setBusy("prompt");
    setError(null);
    try {
      const result = await generateImagePromptAction(projectId, {
        model: selectedOption?.model,
        aspectRatio,
        hasReferenceImage: Boolean(reference),
        direction,
        artDirection,
      });
      setPrompt(result.prompt);
      setVisualBrief(result.brief);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to draft prompt.");
    } finally {
      setBusy(null);
    }
  }

  async function generate() {
    if (!prompt.trim() || !optionId) return;
    setBusy("gen");
    setError(null);
    try {
      const result = await generateImagesAction(projectId, {
        prompt,
        optionId,
        aspectRatio,
        variationCount: count,
        referenceIds: reference ? [reference.id] : [],
      });
      setImgs((prev) => [...result, ...prev]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Image generation failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="cs-card p-5">
      <h3 className="font-semibold tracking-tight text-ink">Companion images</h3>
      {options.length === 0 ? (
        <p className="mt-2 rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-sm text-ink-2">
          No image providers are configured. Add a key in Settings → Image
          providers to enable image generation.
        </p>
      ) : (
        <>
          <div className="mt-3 space-y-3">
            <p className="text-sm leading-relaxed text-ink-2">
              Images use the Designally house style by default — one bold subject on a calm field with a single orange accent. Draft the prompt, review it, then generate. Change the visual style under Advanced controls.
            </p>
            <div className="space-y-1.5">
              <label htmlFor="image-model" className="text-xs font-medium text-ink-2">Image model</label>
              <MenuSelect
                id="image-model"
                ariaLabel="Image model"
                className="w-full text-sm"
                value={optionId}
                onChange={selectModel}
                options={options.map((o) => ({ value: o.optionId, label: o.label }))}
              />
              {selectedOption && <p className="text-xs text-ink-3">{selectedOption.strengths}</p>}
            </div>

            <details className="rounded-lg border border-line bg-sunken px-4 py-3 text-sm">
              <summary className="cursor-pointer font-medium text-ink-2">
                Advanced controls
                {(artDirection !== "designally_ci" || direction !== "auto") && <span className="ml-2 font-normal text-accent-ink">Customized</span>}
              </summary>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="art-direction" className="text-xs font-medium text-ink-2">Visual style override</label>
                  <MenuSelect
                    id="art-direction"
                    ariaLabel="Visual style override"
                    className="w-full text-sm"
                    value={artDirection}
                    onChange={(value) => {
                      setArtDirection(value as ArtDirectionSelection);
                      setVisualBrief(null);
                      setPrompt("");
                    }}
                    options={ART_DIRECTION_PRESETS.map((item) => ({ value: item.value, label: item.label }))}
                  />
                  <p className="text-xs text-ink-3">{ART_DIRECTION_PRESETS.find((item) => item.value === artDirection)?.description}</p>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="image-direction" className="text-xs font-medium text-ink-2">Composition override</label>
                  <MenuSelect
                    id="image-direction"
                    ariaLabel="Composition override"
                    className="w-full text-sm"
                    value={direction}
                    onChange={(value) => {
                      setDirection(value as ImageDirection);
                      setVisualBrief(null);
                      setPrompt("");
                    }}
                    options={IMAGE_DIRECTIONS.map((item) => ({ value: item.value, label: item.label }))}
                  />
                  <p className="text-xs text-ink-3">{IMAGE_DIRECTIONS.find((item) => item.value === direction)?.description}</p>
                </div>
              </div>
            </details>

            <div className="space-y-1.5">
              <p id="reference-image-label" className="text-xs font-medium text-ink-2">
                Reference image{" "}
                <span className="font-normal text-ink-3">
                  ({selectedOption?.capabilities.referenceImagesRequired ? "required" : "optional"})
                </span>
              </p>
              {selectedOption?.capabilities.referenceImages ? (
                <div className="space-y-3">
                  {reference ? (
                  <div className="flex items-center gap-3 rounded-lg border border-line bg-sunken p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={reference.url}
                      alt="Reference"
                      width={56}
                      height={56}
                      decoding="async"
                      className="h-14 w-14 rounded-md object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{reference.name}</p>
                      <p className="num text-xs text-ink-3">{reference.width} × {reference.height}</p>
                    </div>
                    <button type="button" className="cs-btn !h-8 text-xs" onClick={() => {
                      setReference(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}>Remove</button>
                  </div>
                  ) : (
                  <label className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-line-strong bg-sunken px-4 py-4 text-sm text-ink-2 hover:border-accent hover:text-accent-ink">
                    {uploading ? "Uploading…" : "Upload PNG, JPEG, or WebP · max 2 MB"}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={uploading}
                      aria-labelledby="reference-image-label"
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void uploadReference(file);
                      }}
                    />
                  </label>
                  )}
                </div>
              ) : (
                <p className="rounded-lg bg-sunken px-3 py-2 text-xs text-ink-3">This model supports text-to-image only.</p>
              )}
            </div>

            <fieldset className="space-y-1.5">
              <legend className="text-xs font-medium text-ink-2">Aspect ratio</legend>
              <div className="flex flex-wrap gap-2">
                {selectedOption?.capabilities.aspectRatios.map((ratio) => (
                  <button
                    key={ratio}
                    type="button"
                    onClick={() => setAspectRatio(ratio)}
                    aria-pressed={aspectRatio === ratio}
                    className={aspectRatio === ratio ? "cs-btn-primary !h-9 text-sm" : "cs-btn !h-9 text-sm"}
                  >{ratio}</button>
                ))}
              </div>
            </fieldset>

            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <label htmlFor="image-variations" className="text-xs font-medium text-ink-2">Variations</label>
                <MenuSelect
                  id="image-variations"
                  ariaLabel="Number of variations"
                  className="!w-auto text-sm"
                  value={String(count)}
                  onChange={(value) => setCount(Number(value))}
                  options={Array.from(
                    { length: selectedOption?.capabilities.maxVariations ?? 1 },
                    (_, index) => index + 1
                  ).map((value) => ({ value: String(value), label: `${value} variation${value > 1 ? "s" : ""}` }))}
                />
              </div>
              <button
                onClick={draftPrompt}
                disabled={busy !== null || !anthropicReady}
                aria-describedby={!anthropicReady ? "auto-draft-requirement" : undefined}
                className="cs-btn !py-1.5 text-sm"
              >
                <IconSpark width={15} height={15} />
                {busy === "prompt" ? "Drafting…" : "Auto-draft prompt"}
              </button>
              {!anthropicReady && (
                <p id="auto-draft-requirement" className="basis-full text-xs text-ink-3">
                  Configure `ANTHROPIC_API_KEY` in the server environment to use Auto-draft.
                </p>
              )}
            </div>
            <label htmlFor="image-prompt" className="text-xs font-medium text-ink-2">Image prompt</label>
            <textarea
              id="image-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the image, or auto-draft one from the article…"
              className="cs-textarea min-h-[5rem] text-sm"
            />
            {visualBrief && (
              <details className="rounded-lg bg-sunken px-4 py-3 text-sm">
                <summary className="cursor-pointer font-medium text-ink-2">Article-aware visual brief</summary>
                <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
                  <div><dt className="font-medium text-ink">Main subject</dt><dd className="mt-1 text-ink-3">{visualBrief.mainSubject}</dd></div>
                  <div><dt className="font-medium text-ink">Visual style</dt><dd className="mt-1 text-ink-3">{ART_DIRECTION_PRESETS.find((item) => item.value === visualBrief.artDirection)?.label ?? visualBrief.artDirection}</dd></div>
                  <div className="sm:col-span-2"><dt className="font-medium text-ink">Why this style</dt><dd className="mt-1 text-ink-3">{visualBrief.artDirectionReason}</dd></div>
                  <div><dt className="font-medium text-ink">Image role</dt><dd className="mt-1 text-ink-3">{visualBrief.imageRole}</dd></div>
                  <div><dt className="font-medium text-ink">Composition</dt><dd className="mt-1 text-ink-3">{visualBrief.composition}</dd></div>
                  <div><dt className="font-medium text-ink">Reference guidance</dt><dd className="mt-1 text-ink-3">{visualBrief.referenceGuidance}</dd></div>
                </dl>
              </details>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <button
                onClick={generate}
                disabled={
                  busy !== null ||
                  !prompt.trim() ||
                  !optionId ||
                  Boolean(selectedOption?.capabilities.referenceImagesRequired && !reference)
                }
                aria-describedby={selectedOption?.capabilities.referenceImagesRequired && !reference ? "generate-requirement" : undefined}
                className="cs-btn-primary"
              >
                {busy === "gen" ? "Generating…" : `Generate ${count} variation${count > 1 ? "s" : ""}`}
              </button>
            </div>
            {selectedOption?.capabilities.referenceImagesRequired && !reference && (
              <p id="generate-requirement" className="text-xs text-ink-3">
                Upload a reference image to generate with this model.
              </p>
            )}
          </div>

          <p className="sr-only" aria-live="polite">
            {busy === "prompt" ? "Drafting image prompt" : busy === "gen" ? "Generating images" : ""}
          </p>
          {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}

          {imgs.length > 0 && (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {imgs.map((img) => (
                <BrandableImage key={img.id} img={img} brandLogo={brandLogo} onDeleted={() => setImgs((current) => current.filter((item) => item.id !== img.id))} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function BrandableImage({ img, brandLogo, onDeleted }: { img: GeneratedImageView; brandLogo: BrandLogo; onDeleted: () => void }) {
  const [branding, setBranding] = useState<LogoOverlay | null>(img.branding);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const branded = branding !== null;
  const downloadUrl = branded ? `/api/images/${img.id}/branded` : img.url;

  function save(next: LogoOverlay | null) {
    setBranding(next);
    startTransition(() => setImageBrandingAction(img.id, next));
  }

  function toggleBranding(on: boolean) {
    if (!on) setAdjustOpen(false);
    save(on ? (branding ?? brandLogo.defaultOverlay) : null);
  }

  async function remove() {
    if (!window.confirm(`Delete generated image variation ${img.variationNo}? This cannot be undone.`)) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteGeneratedImageAction(img.id);
      onDeleted();
    } catch (reason) {
      setDeleteError(reason instanceof Error ? reason.message : "The image could not be deleted.");
      setDeleting(false);
    }
  }

  return (
    <figure className="overflow-hidden rounded-lg border border-line">
      <div className="relative">
        {branded ? (
          <LogoOverlayPreview
            baseSrc={img.url}
            logoSrc="/api/brand-logo"
            overlay={branding}
            aspectRatio={img.aspectRatio}
            className="rounded-none border-0"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={img.url}
            alt={`Generated companion image, variation ${img.variationNo}`}
            loading="lazy"
            decoding="async"
            className="w-full object-cover"
            style={{ aspectRatio: img.aspectRatio.replace(":", " / ") }}
          />
        )}
        <a
          href={downloadUrl}
          download
          className="absolute bottom-2 right-2 grid size-11 place-items-center rounded-md bg-surface/90 text-ink shadow-sm hover:bg-surface focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-label={branded ? `Download branded variation ${img.variationNo}` : `Download variation ${img.variationNo}`}
        >
          <IconDownload width={16} height={16} />
        </a>
      </div>

      <figcaption className="flex items-center gap-3 border-t border-line px-3 py-2 text-xs text-ink-3">
        <span className="min-w-0 flex-1 truncate">{img.model} · {img.aspectRatio} · Variation {img.variationNo}</span>
        <button type="button" onClick={remove} disabled={deleting} className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md px-2 text-danger-ink hover:bg-danger-soft focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-danger/20 disabled:opacity-50">
          <IconTrash width={14} height={14} /> {deleting ? "Deleting…" : "Delete"}
        </button>
      </figcaption>

      {deleteError && <p className="border-t border-line px-3 py-2 text-xs text-danger" role="alert">{deleteError}</p>}

      {brandLogo.hasLogo && (
        <div className="space-y-3 px-3 py-2.5">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={branded}
                onChange={(e) => toggleBranding(e.target.checked)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              Brand logo
            </label>
            {branded && (
              <button
                type="button"
                onClick={() => setAdjustOpen((o) => !o)}
                className="rounded-sm text-xs font-medium text-accent-ink hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {adjustOpen ? "Done" : "Adjust"}
              </button>
            )}
          </div>
          {branded && adjustOpen && (
            <LogoOverlayControls value={branding} onChange={save} />
          )}
        </div>
      )}
    </figure>
  );
}

function FinalizePanel({
  projectId,
  finalized: initiallyFinalized,
}: {
  projectId: string;
  finalized: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [finalized, setFinalized] = useState(initiallyFinalized);

  function finalize() {
    const fd = new FormData();
    fd.set("projectId", projectId);
    startTransition(async () => {
      await finalizeProjectAction(fd);
      setFinalized(true);
    });
  }

  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-[length:var(--text-h2)] text-ink">{finalized ? "Article saved" : "Save article"}</h2>
        <p className="mt-1.5 max-w-[52ch] text-sm leading-relaxed text-ink-3">
          {finalized ? "This article is available in your Library." : "Save the finished article to your Library. Run the optional review below if you want one final check."}
        </p>
      </div>
      <button onClick={finalize} disabled={pending || finalized} className="cs-btn-primary min-w-36 shrink-0">
        {finalized && <IconCheck width={16} height={16} />}
        {pending ? "Saving…" : finalized ? "Saved" : "Save article"}
      </button>
      {finalized && <span className="sr-only" role="status">Article saved to your Library.</span>}
    </div>
  );
}

function BrandReviewPanel({
  projectId,
  anthropicReady,
}: {
  projectId: string;
  anthropicReady: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [review, setReview] = useState<BrandReviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reviewArticle() {
    setError(null);
    startTransition(async () => {
      try {
        setReview(await reviewBrandAlignmentAction(projectId));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "The brand review could not be completed.");
      }
    });
  }

  const findings = review?.checks.filter((check) => check.status === "review") ?? [];

  return (
    <section aria-labelledby="article-review-heading" className="mt-10 border-t border-line pt-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 id="article-review-heading" className="text-[length:var(--text-h3)] text-ink">Review article</h3>
          <p className="mt-1.5 max-w-[58ch] text-sm leading-relaxed text-ink-3">
            Check facts, sources, and editorial consistency before saving.
          </p>
        </div>
        <button
          type="button"
          onClick={reviewArticle}
          disabled={pending || !anthropicReady}
          className="cs-btn shrink-0"
        >
          <IconSpark width={16} height={16} />
          {pending ? "Reviewing…" : review ? "Review again" : "Review article"}
        </button>
      </div>
      {!anthropicReady && <p className="mt-3 text-sm text-ink-3">Configure Anthropic to run the brand review.</p>}
      {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}
      {review && (
        <div className="mt-6" aria-live="polite">
          <p className={`text-sm font-medium ${findings.length ? "text-ink" : "text-ok"}`}>
            {findings.length ? review.summary : "Review complete — no issues need attention."}
          </p>
          {findings.length > 0 && (
            <ul className="mt-3 divide-y divide-line border-y border-line">
              {findings.map((check, index) => (
                <li key={`${check.criterion}-${index}`} className="py-4">
                  <p className="text-sm font-semibold text-ink">{check.criterion}</p>
                  <p className="mt-1 text-sm leading-relaxed text-ink-2">{check.finding}</p>
                  <p className="mt-1.5 text-sm font-medium text-accent-ink">Suggested edit: {check.suggestion}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
