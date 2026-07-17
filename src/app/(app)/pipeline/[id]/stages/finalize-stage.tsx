"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Markdown } from "@/components/markdown";
import { CopyButton } from "@/components/copy-button";
import { LogoOverlayControls, LogoOverlayPreview } from "@/components/logo-overlay";
import { StageShell } from "./stage-shell";
import { fmtUsd } from "@/lib/format";
import { countMetrics } from "@/lib/text";
import { markdownToPlainText } from "@/lib/plain";
import {
  generateImagePromptAction,
  finalizeProjectAction,
  saveDraftContentAction,
} from "../actions";
import {
  generateImagesAction,
  setImageBrandingAction,
  uploadImageReferenceAction,
  type GeneratedImageView,
  type UploadedReferenceView,
} from "../image-actions";
import { IconSpark, IconDownload, IconCheck } from "@/components/icons";
import type { ApprovalOutcome, LogoOverlay } from "@/db/schema";
import type { ImageAspectRatio } from "@/lib/image/providers";

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

type CostSummary = {
  byStage: { stage: string; tokensIn: number; tokensOut: number; costUsd: number }[];
  tokensIn: number;
  tokensOut: number;
  textCostUsd: number;
  imageCostUsd: number;
  totalCostUsd: number;
  imageCount: number;
};

const OUTCOMES: { value: ApprovalOutcome; label: string; desc: string }[] = [
  { value: "approved_first", label: "Approved as-is", desc: "First draft approved without edits" },
  { value: "approved_edited", label: "Approved after edits", desc: "Approved after refinement" },
  { value: "rejected", label: "Rejected", desc: "Not usable" },
];

export function FinalizeStage({
  projectId,
  draftId,
  longForm,
  draftMd,
  images,
  imageConfig,
  options,
  cost,
  approvalOutcome,
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
  cost: CostSummary;
  approvalOutcome: ApprovalOutcome | null;
  anthropicReady: boolean;
  brandLogo: BrandLogo;
}) {
  const [tab, setTab] = useState<"content" | "images" | "complete">("content");

  return (
    <StageShell
      title="Finalize"
      description="Prepare the article for handoff. Images are optional; completion records the outcome and cost."
      wide
    >
      <nav className="mb-6 flex overflow-x-auto border-b border-line" aria-label="Finalize sections">
        {(["content", "images", "complete"] as const).map((item, index) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            aria-current={tab === item ? "page" : undefined}
            className={`min-h-11 shrink-0 border-b-2 px-5 py-2 text-sm font-medium capitalize transition-colors ${
              tab === item ? "border-accent text-accent-ink" : "border-transparent text-ink-3 hover:text-ink"
            }`}
          >
            <span className="mr-2 text-xs">{index + 1}</span>{item}
          </button>
        ))}
      </nav>

      {tab !== "complete" ? (
        <div className="mx-auto max-w-5xl">
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
            tab={tab}
            onNext={() => setTab(tab === "content" ? "images" : "complete")}
            onBack={() => setTab("content")}
          />
        </div>
      ) : (
        <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <section className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[var(--tracking-caps)] text-accent-ink">Ready to complete</p>
            <h3 className="mt-2 text-[length:var(--text-h2)] text-ink">Record the article outcome</h3>
            <p className="mt-3 max-w-[60ch] text-sm leading-(--leading-body) text-ink-3">
              The article is saved automatically. Choose the outcome that best describes this version; you can still return to Content or Images before recording it.
            </p>
            <div className="mt-7"><ApprovalPanel projectId={projectId} current={approvalOutcome} /></div>
          </section>
          <div className="space-y-4"><CostPanel cost={cost} /><button type="button" onClick={() => setTab("images")} className="cs-btn w-full">Back to images</button></div>
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
  onBack,
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
  onBack: () => void;
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
          <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-line bg-bg/95 py-4 backdrop-blur sm:flex-row sm:justify-between">
            <button type="button" onClick={onBack} className="cs-btn">Back to content</button>
            <button type="button" onClick={onNext} className="cs-btn-primary">Continue without more images</button>
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
  const estimatedImageCost = (selectedOption?.indicativePricePerImage ?? 0) * count;

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
      setPrompt(await generateImagePromptAction(projectId, {
        model: selectedOption?.model,
        aspectRatio,
        hasReferenceImage: Boolean(reference),
      }));
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
            <div className="space-y-1.5">
              <label htmlFor="image-model" className="text-xs font-medium text-ink-2">Image model</label>
              <select
                id="image-model"
                value={optionId}
                onChange={(e) => selectModel(e.target.value)}
                className="cs-select w-full text-sm"
              >
                {options.map((o) => (
                  <option key={o.optionId} value={o.optionId}>{o.label}</option>
                ))}
              </select>
              {selectedOption && <p className="text-xs text-ink-3">{selectedOption.strengths}</p>}
            </div>

            <div className="space-y-1.5">
              <p id="reference-image-label" className="text-xs font-medium text-ink-2">
                Reference image{" "}
                <span className="font-normal text-ink-3">
                  ({selectedOption?.capabilities.referenceImagesRequired ? "required" : "optional"})
                </span>
              </p>
              {selectedOption?.capabilities.referenceImages ? (
                reference ? (
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
                )
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
                <select
                  id="image-variations"
                  aria-label="Number of variations"
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  className="cs-select !w-auto text-sm"
                >
                  {Array.from({ length: selectedOption?.capabilities.maxVariations ?? 1 }, (_, index) => index + 1).map((value) => (
                    <option key={value} value={value}>{value} variation{value > 1 ? "s" : ""}</option>
                  ))}
                </select>
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
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <button
                onClick={generate}
                disabled={
                  busy !== null ||
                  !prompt.trim() ||
                  !optionId ||
                  Boolean(selectedOption?.capabilities.referenceImagesRequired && !reference)
                }
                aria-describedby={selectedOption?.capabilities.referenceImagesRequired && !reference ? "generate-requirement" : "image-cost-estimate"}
                className="cs-btn-primary"
              >
                {busy === "gen" ? "Generating…" : `Generate ${count} variation${count > 1 ? "s" : ""}`}
              </button>
              <p id="image-cost-estimate" className="text-xs text-ink-3">
                Estimated image cost: <span className="num font-medium text-ink-2">{fmtUsd(estimatedImageCost)}</span>
              </p>
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
                <BrandableImage key={img.id} img={img} brandLogo={brandLogo} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function BrandableImage({ img, brandLogo }: { img: GeneratedImageView; brandLogo: BrandLogo }) {
  const [branding, setBranding] = useState<LogoOverlay | null>(img.branding);
  const [adjustOpen, setAdjustOpen] = useState(false);
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

      <figcaption className="border-t border-line px-3 py-2 text-xs text-ink-3">
        {img.model} · {img.aspectRatio} · Variation {img.variationNo}
      </figcaption>

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

function CostPanel({ cost }: { cost: CostSummary }) {
  return (
    <section className="cs-card p-5">
      <h3 className="font-semibold tracking-tight text-ink">Cost summary</h3>
      <dl className="mt-3 space-y-1.5">
        {cost.byStage.map((s) => (
          <div key={s.stage} className="flex justify-between text-sm">
            <dt className="text-ink-2">{s.stage}</dt>
            <dd className="num text-ink">{fmtUsd(s.costUsd)}</dd>
          </div>
        ))}
        {cost.imageCount > 0 && (
          <div className="flex justify-between text-sm">
            <dt className="text-ink-2">Images ({cost.imageCount})</dt>
            <dd className="num text-ink">{fmtUsd(cost.imageCostUsd)}</dd>
          </div>
        )}
      </dl>
      <div className="mt-3 border-t border-line pt-3">
        <div className="flex justify-between">
          <span className="text-sm font-medium text-ink">Total</span>
          <span className="num font-semibold text-ink">{fmtUsd(cost.totalCostUsd)}</span>
        </div>
        <p className="num mt-1 text-xs text-ink-3">
          {cost.tokensIn.toLocaleString()} in · {cost.tokensOut.toLocaleString()} out tokens
        </p>
      </div>
    </section>
  );
}

function ApprovalPanel({
  projectId,
  current,
}: {
  projectId: string;
  current: ApprovalOutcome | null;
}) {
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<ApprovalOutcome | null>(current);

  function record(outcome: ApprovalOutcome) {
    setSelected(outcome);
    const fd = new FormData();
    fd.set("projectId", projectId);
    fd.set("outcome", outcome);
    startTransition(() => finalizeProjectAction(fd));
  }

  return (
    <section className="cs-card p-5">
      <h3 className="font-semibold tracking-tight text-ink">Approval outcome</h3>
      <p className="mt-1 text-sm text-ink-2">
        This feeds the first-draft approval-rate dashboard.
      </p>
      <div className="mt-3 space-y-2">
        {OUTCOMES.map((o) => {
          const active = selected === o.value;
          return (
            <button
              key={o.value}
              onClick={() => record(o.value)}
              disabled={pending}
              className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                active
                  ? "border-accent bg-accent-soft"
                  : "border-line hover:bg-sunken"
              }`}
            >
              <span
                className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border ${
                  active ? "border-accent bg-accent text-white" : "border-line-strong"
                }`}
              >
                {active && <IconCheck width={11} height={11} />}
              </span>
              <span>
                <span className={`block text-sm font-medium ${active ? "text-accent-ink" : "text-ink"}`}>
                  {o.label}
                </span>
                <span className="block text-xs text-ink-3">{o.desc}</span>
              </span>
            </button>
          );
        })}
      </div>
      {selected && (
        <p className="mt-3 text-xs text-ok">
          Saved — project is in the Content Library.
        </p>
      )}
    </section>
  );
}
