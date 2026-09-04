"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ExternalLink, ImagePlus, LoaderCircle, Maximize2, Minimize2, Send, Sparkles, X } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { CopyButton } from "@/components/copy-button";
import { StageShell } from "./stage-shell";
import { countMetrics } from "@/lib/text";
import { markdownToPlainText } from "@/lib/plain";
import { type PublishMetadata } from "@/lib/publish-meta";
import {
  generateImagePromptAction,
  reviewBrandAlignmentAction,
  saveDraftContentAction,
} from "../actions";
import { publishToHubAction, ensurePublishDekAction } from "../publish-actions";
import { HubArticlePreview, HubPreviewFrame } from "./hub-article-preview";
import {
  generateImagesAction,
  deleteGeneratedImageAction,
  deleteImageReferenceAction,
  findReferenceImagesAction,
  setCoverImageAction,
  uploadImageReferenceAction,
  type GeneratedImageView,
  type UploadedReferenceView,
} from "../image-actions";
import { IconSpark, IconDownload, IconCheck, IconTrash } from "@/components/icons";
import { ChipSelect } from "@/components/ui/chip-select";
import { AccentOrb } from "@/components/accent-orb";
import type { ImageAspectRatio } from "@/lib/image/providers";
import { MAX_FOUND_REFERENCES } from "@/lib/image/reference-policy";
import type { BrandReviewResult } from "@/lib/brand-review";
import { type ArticleVisualBrief, type ImagePromptVariant } from "@/lib/image/visual-brief";

type ImageModelOption = {
  optionId: string;
  label: string;
  provider: string;
  model: string;
  /** Pairs a text-to-image entry with the editing entry in the same line. */
  family: string;
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

/**
 * How tall the image prompt grows before it scrolls and offers to expand.
 * Lower than the home composer's, because this dock is anchored to the bottom
 * of a page whose subject is the images above it — an auto-drafted prompt is
 * long enough to take a third of the viewport at the shared cap. Must match the
 * `max-h-40` on the field itself.
 */
const PROMPT_COLLAPSED_MAX = 160;

/**
 * How tall a lone generated image is allowed to be.
 *
 * Applied as a max-*width* derived from the image's own ratio, not as a
 * max-height: a height cap fights the aspect-ratio box, and with `object-cover`
 * it crops — so a square was being trimmed at exactly the moment the editor is
 * deciding whether to publish it. Driving from height also keeps a 1:1 and a
 * 16:9 at the same visual weight instead of one towering over the other.
 */
const FEATURE_MAX_HEIGHT = 460;

export function PublishStage({
  projectId,
  title,
  publish,
  draftId,
  longForm,
  draftMd,
  coverImageUrl,
  coverAspectRatio,
  coverImageId,
  initialDek,
  published,
  images,
  imageReferences,
  imageConfig,
  options,
  initialView,
  anthropicReady,
  hubConfigured,
  publishedHubUrl,
}: {
  projectId: string;
  /** Article title — the masthead headline in the Hub preview. */
  title: string;
  /** Category (pillar) + tags (direction) for the external platform. */
  publish: PublishMetadata;
  draftId: string;
  longForm: boolean;
  draftMd: string;
  /** Cover image (first generated image) shown in the preview, if any. */
  coverImageUrl: string | null;
  /** Cover width / height — drives the hero's 50% overflow in the preview. */
  coverAspectRatio: number;
  /** The image that will travel to the Hub, already resolved by the route. */
  coverImageId: string | null;
  /** Cached dek, if one was generated on a previous visit. */
  initialDek: string | null;
  /** Whether the article is live on the Knowledge Hub. */
  published: boolean;
  images: GeneratedImageView[];
  /** References already attached to this article, from an earlier visit. */
  imageReferences: UploadedReferenceView[];
  imageConfig: { optionId: string; count: number; aspectRatio: string };
  options: ImageModelOption[];
  initialView: "images" | "complete";
  anthropicReady: boolean;
  /** Whether HUB_BASE_URL + HUB_API_KEY are set on the server. */
  hubConfigured: boolean;
  /** Existing Knowledge Hub URL if this article was already published there. */
  publishedHubUrl?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedView = searchParams.get("view");
  const showCompletion = requestedView === "complete" || (!requestedView && initialView === "complete");

  function show(view: "images" | "complete") {
    router.replace(`/pipeline/${projectId}?stage=6&view=${view}`, { scroll: false });
  }

  if (showCompletion) {
    return (
      <StageShell title="Publish" wide hideHeader>
        <PublishComposer
          projectId={projectId}
          title={title}
          publish={publish}
          draftMd={draftMd}
          coverImageUrl={coverImageUrl}
          coverAspectRatio={coverAspectRatio}
          initialDek={initialDek}
          published={published}
          anthropicReady={anthropicReady}
          hubConfigured={hubConfigured}
          publishedHubUrl={publishedHubUrl}
        />
      </StageShell>
    );
  }

  return (
    <StageShell title="Generate images" wide flushBottom>
      <div>
        <ArticlePanel
          projectId={projectId}
          title={title}
          draftId={draftId}
          longForm={longForm}
          draftMd={draftMd}
          images={images}
          imageReferences={imageReferences}
          defaultOptionId={imageConfig.optionId}
          defaultCount={imageConfig.count}
          defaultAspectRatio={imageConfig.aspectRatio}
          options={options}
          anthropicReady={anthropicReady}
          coverImageId={coverImageId}
          tab="images"
          onNext={() => show("complete")}
        />
      </div>
    </StageShell>
  );
}

function ArticlePanel({
  projectId,
  title,
  draftId,
  longForm,
  draftMd,
  images,
  imageReferences,
  defaultOptionId,
  defaultCount,
  defaultAspectRatio,
  options,
  anthropicReady,
  coverImageId,
  tab,
  onNext,
}: {
  projectId: string;
  title: string;
  draftId: string;
  longForm: boolean;
  draftMd: string;
  images: GeneratedImageView[];
  imageReferences: UploadedReferenceView[];
  defaultOptionId: string;
  defaultCount: number;
  defaultAspectRatio: string;
  options: ImageModelOption[];
  anthropicReady: boolean;
  coverImageId: string | null;
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
        title={title}
        existing={images}
        initialReferences={imageReferences}
        defaultOptionId={defaultOptionId}
        defaultCount={defaultCount}
        defaultAspectRatio={defaultAspectRatio}
        options={options}
        anthropicReady={anthropicReady}
        coverImageId={coverImageId}
        onNext={onNext}
      />
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
  title,
  existing,
  initialReferences,
  defaultOptionId,
  defaultCount,
  defaultAspectRatio,
  options,
  anthropicReady,
  coverImageId,
  onNext,
}: {
  projectId: string;
  title: string;
  existing: GeneratedImageView[];
  initialReferences: UploadedReferenceView[];
  defaultOptionId: string;
  defaultCount: number;
  defaultAspectRatio: string;
  options: ImageModelOption[];
  anthropicReady: boolean;
  coverImageId: string | null;
  onNext: () => void;
}) {
  const requestedOption = options.find((option) => option.optionId === defaultOptionId);
  const initialOption = requestedOption ?? options[0];
  const initialOptionId = initialOption?.optionId ?? "";
  const requestedInitialRatio = (defaultAspectRatio || "1:1") as ImageAspectRatio;
  const initialRatio = initialOption?.capabilities.aspectRatios.includes(requestedInitialRatio)
    ? requestedInitialRatio
    : initialOption?.capabilities.aspectRatios[0] ?? "1:1";
  const [prompt, setPrompt] = useState("");
  /*
   * The set Auto-draft produced, and the exact text it put in the field.
   *
   * Keeping both is what lets the editor's own words win: while the field still
   * holds `draftedPrompt`, the whole set is sent and each image carries a
   * different concept. The moment they change a word, that edit is the brief
   * and it governs every image — silently generating three other concepts
   * beside it would be ignoring what they just wrote.
   */
  const [variants, setVariants] = useState<ImagePromptVariant[]>([]);
  const [draftedPrompt, setDraftedPrompt] = useState("");
  // Designally house style is the official default; users can override it below.
  const [visualBrief, setVisualBrief] = useState<ArticleVisualBrief | null>(null);
  const [optionId, setOptionId] = useState(initialOptionId);
  const [count, setCount] = useState(
    Math.min(Math.max(defaultCount, 1), initialOption?.capabilities.maxVariations ?? 1)
  );
  const [aspectRatio, setAspectRatio] = useState<ImageAspectRatio>(initialRatio);
  /*
   * A set, not one image.
   *
   * The edit models accept ten and fourteen; this stage offered one, which was
   * the whole of what an editor could ground a generation in. Now that
   * references can also be FOUND — from the sources the article cites, and
   * from an open-licence pool — a set is the natural unit, and each member has
   * to be individually removable because nobody chose them by hand.
   */
  const [references, setReferences] = useState<UploadedReferenceView[]>(initialReferences);
  const [uploading, setUploading] = useState(false);
  const [finding, setFinding] = useState(false);
  /*
   * Which photograph the generation matches.
   *
   * Null means "the first", so the set works before anybody chooses and keeps
   * working when the chosen one is removed. Storing an id rather than an index
   * survives removal without silently pointing at a different picture.
   */
  const [chosenReferenceId, setChosenReferenceId] = useState<string | null>(null);
  const [findNote, setFindNote] = useState<string | null>(null);
  const [imgs, setImgs] = useState<GeneratedImageView[]>(existing);
  const [busy, setBusy] = useState<"prompt" | "gen" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [promptNeedsExpansion, setPromptNeedsExpansion] = useState(false);
  // Optimistic: the route resolves the cover on reload, but the choice has to
  // register the instant it is clicked or the control feels broken.
  const [chosenCoverId, setChosenCoverId] = useState<string | null>(coverImageId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const selectedOption = useMemo(
    () => options.find((option) => option.optionId === optionId) ?? options[0],
    [optionId, options]
  );
  /*
   * What this model will actually accept.
   *
   * The set belongs to the article; how much of it can be sent belongs to the
   * model. A text-to-image entry takes none of it, and the editing entries cap
   * at ten and fourteen. Slicing here rather than at the server keeps what the
   * editor is told and what is sent as the same number.
   */
  /*
   * ONE photograph, never four.
   *
   * The editing endpoints accept ten and fourteen because they are built to
   * COMPOSITE — hand them four unrelated photographs and they blend the
   * subjects. That is the opposite of "make a picture like this one", where a
   * single clear example is the entire instruction. The rest of the set stays
   * attached and visible; it is simply not sent, and the dock says so.
   */
  const chosenReference = useMemo(
    () => references.find((item) => item.id === chosenReferenceId) ?? references[0] ?? null,
    [references, chosenReferenceId]
  );
  const usableReferences = useMemo(
    () =>
      selectedOption?.capabilities.referenceImages && chosenReference ? [chosenReference] : [],
    [chosenReference, selectedOption]
  );
  /** The chosen photograph — credited whether or not this model can send it. */
  const activeReference = chosenReference;
  /** The editing entry in the same model line, which is the one that takes references. */
  const referenceCapableSibling = useMemo(
    () =>
      options.find(
        (option) =>
          option.family === selectedOption?.family && option.capabilities.referenceImages
      ) ?? options.find((option) => option.capabilities.referenceImages),
    [options, selectedOption]
  );
  // Untouched since Auto-draft wrote it, so the other concepts still apply.
  const usingDraftedSet = variants.length > 1 && prompt === draftedPrompt;
  // Drafted for fewer images than are now requested — the extra slots repeat
  // the first concept unless the set is written again.
  const conceptsBehindCount = usingDraftedSet && count > variants.length;

  // Measured from the value, not from `onInput`. Auto-draft sets the prompt
  // programmatically, and `onInput` only fires for user typing — so the longest
  // prompts on this stage, the generated ones, never triggered a measurement and
  // the expand control never appeared. Keying on `prompt` covers both sources.
  // The write happens inside the frame callback rather than the effect body, so
  // it is not a synchronous setState in an effect.
  useEffect(() => {
    const field = promptRef.current;
    if (!field) return;
    const frame = requestAnimationFrame(() => {
      field.style.height = "auto";
      const needsExpansion = field.scrollHeight > PROMPT_COLLAPSED_MAX;
      setPromptNeedsExpansion(needsExpansion);
      field.style.height = `${promptExpanded ? field.scrollHeight : Math.min(field.scrollHeight, PROMPT_COLLAPSED_MAX)}px`;
    });
    return () => cancelAnimationFrame(frame);
  }, [prompt, promptExpanded]);

  function selectModel(nextOptionId: string) {
    const next = options.find((option) => option.optionId === nextOptionId);
    setOptionId(nextOptionId);
    if (!next) return;
    if (!next.capabilities.aspectRatios.includes(aspectRatio)) {
      setAspectRatio(next.capabilities.aspectRatios[0] ?? "1:1");
    }
    // The references are not deleted — they stay on the article, and picking a
    // model that can use them again brings them straight back. Silently
    // discarding found material because of a dropdown would be the wrong
    // trade.
    if (!next.capabilities.referenceImages) setFindNote(null);
    setCount((current) => Math.min(current, next.capabilities.maxVariations));
  }

  async function uploadReference(file: File) {
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const uploaded = await uploadImageReferenceAction(projectId, formData);
      setReferences((current) => [...current, uploaded]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reference upload failed.");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } finally {
      setUploading(false);
    }
  }

  /**
   * Attach references drawn from the article's own cited sources, and from an
   * open-licence pool where those come up short.
   *
   * Switching the model afterwards is deliberate. Only the editing endpoints
   * accept a reference, so finding four images and leaving a text-to-image
   * model selected would present the editor with material the next click
   * silently ignores. The swap is announced rather than hidden.
   */
  async function findReferences() {
    setFinding(true);
    setError(null);
    setFindNote(null);
    try {
      const result = await findReferenceImagesAction(projectId, {
        // `photoQuery` describes the SITUATION — "designer working at desk
        // laptop" — which is what a stock library can actually answer. The
        // subject and named subjects returned pictures OF the topic: a logo, a
        // screenshot, a product page. Falls back to them only when no brief has
        // been drafted yet.
        query:
          visualBrief?.photoQuery?.trim() || undefined,
      });
      setReferences(result.references);
      const notes: string[] = [];
      if (result.note) notes.push(result.note);
      if (
        result.references.length > 0 &&
        !selectedOption?.capabilities.referenceImages &&
        referenceCapableSibling
      ) {
        setOptionId(referenceCapableSibling.optionId);
        setCount((current) => Math.min(current, referenceCapableSibling.capabilities.maxVariations));
        notes.push(`Switched to ${referenceCapableSibling.label}, which is the model that reads references.`);
      }
      setFindNote(notes.join(" ") || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not look for reference images.");
    } finally {
      setFinding(false);
    }
  }

  async function removeReference(id: string) {
    const previous = references;
    setReferences((current) => current.filter((item) => item.id !== id));
    // Back to "the first" rather than to a photograph that no longer exists.
    if (chosenReferenceId === id) setChosenReferenceId(null);
    try {
      await deleteImageReferenceAction(id);
    } catch (e) {
      setReferences(previous);
      setError(e instanceof Error ? e.message : "Could not remove that reference.");
    }
  }

  async function draftPrompt() {
    setBusy("prompt");
    setError(null);
    try {
      const result = await generateImagePromptAction(projectId, {
        variationCount: count,
        referenceId: chosenReference?.id,
      });
      setPrompt(result.prompt);
      setDraftedPrompt(result.prompt);
      setVariants(result.variants);
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
        referenceIds: usableReferences.map((item) => item.id),
        variantPrompts: usingDraftedSet ? variants.map((variant) => variant.prompt) : undefined,
      });
      setImgs((prev) => [...result.images, ...prev]);
      if (result.failedCount > 0) {
        setError(
          `${result.failedCount} of ${count} images failed. ${result.failureReason ?? ""}`.trim()
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Image generation failed.");
    } finally {
      setBusy(null);
    }
  }

  if (options.length === 0) {
    return (
      <p className="rounded-2xl bg-warn-soft px-5 py-4 text-sm leading-relaxed text-ink-2">
        <strong className="font-semibold text-ink">No image providers are configured.</strong>{" "}
        Add a key in Settings → Image providers to enable image generation.
      </p>
    );
  }

  const selectedCoverId = imgs.some((image) => image.id === chosenCoverId)
    ? chosenCoverId
    : imgs[0]?.id ?? null;

  function chooseCover(imageId: string) {
    setChosenCoverId(imageId);
    void setCoverImageAction(projectId, imageId).catch((reason) => {
      setChosenCoverId(coverImageId);
      setError(reason instanceof Error ? reason.message : "Could not set the cover image.");
    });
  }

  const referenceMissing = Boolean(
    selectedOption?.capabilities.referenceImagesRequired && usableReferences.length === 0
  );
  const hasPrompt = prompt.trim().length > 0;
  // Blocked for a reason the editor cannot fix by typing — as opposed to simply
  // not having written a prompt yet, which is a resting state, not a fault.
  const generateBlocked = busy !== null || !optionId || referenceMissing;
  return (
    // Always as tall as the space below the pipeline header, and a flex column
    // so the composer can be pushed to the end of it. Sticky alone only pins
    // while the page overflows, so with one or two images the dock stopped
    // wherever the content ended and appeared to move between visits.
    // `gap` rather than `space-y`: the composer's `mt-auto` has to win, and a
    // `space-y` margin on the same axis fights it.
    <div className="flex min-h-[calc(100svh-7rem)] flex-col gap-8 sm:min-h-[calc(100svh-8rem)]">
      {/* Results lead. Only one of these travels to the Hub, so choosing it is
          the real decision on this stage — and a decision belongs above the
          controls that produce more options, not buried under them. */}
      {/* Title and forward action on one row: they are the same altitude, and a
          14px count heading beside a 48px button was a label being shouted over.
          The count sits under the title and only appears when there is actually
          a choice — with one image the tile's own badge already says it. */}
      <header className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3">
        <div className="min-w-0 flex-1">
          <h2 className="max-w-[46ch] text-balance font-heading text-[length:var(--text-h2)] font-bold leading-tight tracking-tight text-ink">
            {title}
          </h2>
          {imgs.length > 1 && (
            <p className="mt-1.5 text-sm text-ink-2">
              {imgs.length} images — choose the one to publish.
            </p>
          )}
        </div>
        <button type="button" onClick={onNext} className="cs-cta group shrink-0">
          Continue to publish
          <span aria-hidden className="cs-cta-disc"><IconCheck width={15} height={15} /></span>
        </button>
      </header>

      {imgs.length > 0 && (
        <section aria-label="Generated images">
          {/* Four across at full width. Two made a wall of a page out of six
              images; the tiles carry their own controls now, so they can be
              small without losing anything. */}
          {/* The grid follows the count rather than imposing one shape on it: a
              single image has nothing to compare against, so it gets the room;
              a pair reads best side by side. Only past three does a fixed grid
              beat giving each one space. */}
          <ul
            className={`grid gap-4 ${
              imgs.length === 1
                ? "grid-cols-1"
                : imgs.length === 2
                  ? "grid-cols-2"
                  : imgs.length === 3
                    ? "grid-cols-2 lg:grid-cols-3"
                    : "grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            }`}
          >
            {imgs.map((img) => (
              <li key={img.id}>
                <GeneratedImage
                  img={img}
                  feature={imgs.length === 1}
                  selected={img.id === selectedCoverId}
                  onSelect={() => chooseCover(img.id)}
                  onDeleted={() => setImgs((current) => current.filter((item) => item.id !== img.id))}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="space-y-2">
        {!anthropicReady && (
          <p id="auto-draft-requirement" className="text-sm text-ink-2">
            Configure <code>ANTHROPIC_API_KEY</code> in the server environment to use Auto-draft.
          </p>
        )}
        {referenceMissing && (
          <p id="generate-requirement" className="text-sm text-ink-2">
            This model needs a reference image before it can generate.
          </p>
        )}
        {!selectedOption?.capabilities.referenceImages && (
          <p className="text-sm text-ink-3">This model supports text-to-image only.</p>
        )}
        {/* What the editor is about to get is not obvious from a single prompt
            field: the field shows one prompt, but a drafted set sends a
            different concept to each image. Said plainly, and only when it
            changes the outcome. */}
        {usingDraftedSet && !conceptsBehindCount && (
          <p className="text-sm text-ink-2">
            {count} images, {count} different scenes — drafted from the article.
          </p>
        )}
        {conceptsBehindCount && (
          <p className="text-sm text-ink-2">
            {variants.length} of the {count} images will show different scenes. Auto-draft again
            for {count}.
          </p>
        )}
        {variants.length > 0 && !usingDraftedSet && count > 1 && (
          <p className="text-sm text-ink-2">Your edited prompt will be used for all {count} images.</p>
        )}
        {findNote && <p className="text-sm text-ink-2">{findNote}</p>}
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      </div>

      <p className="sr-only" aria-live="polite">
        {busy === "prompt" ? "Drafting image prompt" : busy === "gen" ? "Generating images" : ""}
      </p>

      {/* Sticky, not fixed: laid out inside the content column, so it takes the
          width the sidebar leaves and moves with it when that collapses. Fixed
          positioning is against the viewport and cannot know the sidebar exists.
          Sticky also reserves its own space, so nothing needs measuring.

          Everything else is a setting on the prompt, so the settings compress
          into chips in the control row. Structure, growth and controls all
          mirror the composer on the home surface. */}
      {/* 64px clear of the bottom edge, held by both the sticky offset and the
          margin: the offset governs while the page overflows, the margin while
          it does not, and this dock moves between those two states depending on
          how many images there are. Padding cannot do it — `bottom` pins the
          element's own edge, so padding sits inside that and reads as nothing. */}
      <div className="sticky bottom-16 z-20 mt-auto mb-16 pt-6">
        <div
          aria-hidden
          // Reaches past the gap: with the dock held 64px off the bottom, a
          // scrim stopping at its edge would leave a strip for images to scroll
          // through underneath it.
          className="pointer-events-none absolute inset-x-0 -bottom-16 -z-10 h-[calc(100%+8rem)] bg-linear-to-t from-bg from-72% to-transparent"
        />
        {/*
          The reference photographs, shown as photographs.

          They were chips: a 28px circular crop beside a filename, in the same
          row as the model and ratio settings. That is the wrong shape twice
          over. A round 28px crop of a wide photograph shows almost none of it,
          and the one thing an editor needs to judge here is whether this is the
          picture the generation should look like — which is a question only the
          image can answer. And a photograph is not a setting on the prompt; it
          is material the prompt is written against, so it does not belong in
          the row where the count and the aspect ratio live.

          Square, 64px, above the dock. Squares because the crop is honest about
          being a crop — a circle implies an avatar — and above because that is
          the reading order: here is the picture, now here is what you are
          asking for. It sits on the page ground with no lift of its own: the
          Single-Object Rule gives the dock the only elevation above the fold,
          and a raised tray of thumbnails would compete with the thing it feeds.
        */}
        {references.length > 0 && (
          <section
            aria-label="Reference photographs"
            /* Indented onto the prompt's own text line, not the dock's outer
               edge: 6px of bezel plus the field's 16px gutter. The photograph
               and the sentence written against it are one column, and 22px of
               stagger between them reads as a mistake rather than as a margin.
               The Two-Gutter Rule, applied across the dock's edge instead of
               inside it. */
            className="mb-3 ps-[22px] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-200"
          >
            {/*
              Real radios, hidden but present.

              This is a choose-one-of-N, which is what a radio group is, so the
              native control does the work: arrow keys move between photographs,
              the group is one tab stop, and assistive technology announces the
              selection without a line of ARIA. A div with a click handler and
              `aria-pressed` would be re-implementing all of that, worse.
            */}
            <fieldset className="border-0 p-0">
              <legend className="sr-only">Which photograph the image should match</legend>
              <ul className="flex flex-wrap items-center gap-2">
                {references.map((item) => {
                  const chosen = item.id === chosenReference?.id;
                  const credit = item.sourceName
                    ? `${item.sourceName}${item.license ? ` — ${item.license}` : ""}`
                    : "Uploaded";
                  return (
                    <li key={item.id} className="group relative">
                      <label className="block cursor-pointer">
                        <input
                          type="radio"
                          name="reference-choice"
                          className="peer sr-only"
                          checked={chosen}
                          onChange={() => setChosenReferenceId(item.id)}
                          aria-label={`Match this photograph: ${item.name}. ${credit}`}
                        />
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.url}
                          alt={item.name}
                          width={64}
                          height={64}
                          decoding="async"
                          title={credit}
                          /* The unchosen sit back rather than disappear: the
                             whole point of showing them is that swapping is one
                             click, and a picture you cannot see is not a choice.
                             They come most of the way up on hover, which is the
                             affordance doing its own explaining. */
                          className={`size-16 rounded-xl border object-cover transition-[opacity,border-color,box-shadow] duration-(--duration-fast) ease-(--ease-out) peer-focus-visible:shadow-[var(--shadow-focus)] motion-reduce:transition-none ${
                            chosen
                              ? "border-line-strong opacity-100"
                              : "border-line opacity-45 hover:opacity-80"
                          }`}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => void removeReference(item.id)}
                        aria-label={`Remove reference photograph: ${item.name}`}
                        /* 24px meets the WCAG 2.2 AA minimum target size. Held
                           back until the thumbnail is hovered or something inside
                           it takes focus, so three photographs do not read as
                           three delete buttons — but always present where hover
                           does not exist, since there is nothing to reveal it on
                           a touch screen. */
                        className="absolute -right-1.5 -top-1.5 grid size-6 place-items-center rounded-full border border-line bg-surface text-ink-3 opacity-0 shadow-[var(--shadow-card)] transition-[opacity,color,background-color] duration-(--duration-fast) ease-(--ease-out) group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-sunken hover:text-ink focus-visible:opacity-100 focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)] motion-reduce:transition-none [@media(hover:none)]:opacity-100"
                      >
                        <X aria-hidden className="size-3" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
            {/*
              One line doing two jobs that were previously two paragraphs and a
              badge: which photograph is actually in play, and who took it.

              ink-2 rather than ink-3: measured against the page ground, ink-3
              lands at 4.49:1 — a hair under the 4.5:1 that body text at this
              size needs.

              The photographer is a link because Unsplash's API terms ask for a
              credit back to the photograph, and a `title` attribute is not one.
            */}
            <p className="mt-2 text-xs leading-relaxed text-ink-2">
              {/*
                Three states, and the middle one is why this line exists at all.
                A dimmed photograph with no words beside it is the interface
                telling the editor something is wrong without saying what.
              */}
              {usableReferences.length === 0 ? (
                // Every thumbnail dimmed and no explanation is the worst of the
                // three. It happens whenever the chosen model reads text only,
                // which is a property of the dropdown, not of the photographs.
                <>Not used — {selectedOption?.label ?? "this model"} makes images from text alone. </>
              ) : (
                references.length > 1 && <>Matching this one of {references.length}. </>
              )}
              {activeReference?.sourceName ? (
                <>
                  Photo by{" "}
                  {activeReference.sourceUrl ? (
                    <a
                      href={activeReference.sourceUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="underline decoration-line-strong underline-offset-2 transition-colors duration-(--duration-fast) hover:text-ink hover:decoration-current focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]"
                    >
                      {activeReference.sourceName}
                    </a>
                  ) : (
                    activeReference.sourceName
                  )}
                  {activeReference.license ? ` · ${activeReference.license}` : ""}
                </>
              ) : (
                <>Uploaded reference.</>
              )}
            </p>
          </section>
        )}

        <div className="cs-bezel motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-4 motion-safe:duration-500">
        <div className="cs-bezel-core relative">
          <label htmlFor="image-prompt" className="sr-only">Image prompt</label>
          <div className="cs-dock-input-viewport">
            <textarea
              ref={promptRef}
              id="image-prompt"
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the image, or auto-draft one from the article…"
              className={`cs-dock-input ${promptNeedsExpansion ? "cs-dock-input--scrollable pr-12" : ""} ${promptExpanded ? "max-h-none" : "max-h-40"}`}
            />
          </div>
          {promptNeedsExpansion && (
            <button
              type="button"
              onClick={() => {
                const nextExpanded = !promptExpanded;
                setPromptExpanded(nextExpanded);
                requestAnimationFrame(() => {
                  const field = promptRef.current;
                  if (!field) return;
                  field.style.height = "auto";
                  field.style.height = `${nextExpanded ? field.scrollHeight : Math.min(field.scrollHeight, 320)}px`;
                  field.focus();
                });
              }}
              className="absolute right-3 top-3 grid size-9 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              aria-label={promptExpanded ? "Collapse image prompt" : "Expand image prompt"}
              aria-controls="image-prompt"
            >
              {promptExpanded ? <Minimize2 aria-hidden className="size-4" /> : <Maximize2 aria-hidden className="size-4" />}
            </button>
          )}

          <div className="cs-dock-controls flex-wrap gap-2">
            {/* Portalled, like the direction picker on the home surface — the
                plate around them clips its own content, so an absolutely
                positioned menu would be cut off at the dock's edge.
                Each option carries its own rationale in the menu, which is where
                it is useful, rather than as helper text stacked under a control
                nobody is looking at yet. */}
            <ChipSelect
              id="image-model"
              ariaLabel="Image model"
              side="top"
              value={optionId}
              onChange={selectModel}
              options={options.map((o) => ({ value: o.optionId, label: o.label, description: o.strengths }))}
            />
            <ChipSelect
              id="image-ratio"
              ariaLabel="Aspect ratio"
              side="top"
              value={aspectRatio}
              onChange={(value) => setAspectRatio(value as ImageAspectRatio)}
              options={(selectedOption?.capabilities.aspectRatios ?? []).map((ratio) => ({ value: ratio, label: ratio }))}
            />
            <ChipSelect
              id="image-variations"
              ariaLabel="Number of variations"
              side="top"
              value={String(count)}
              onChange={(value) => setCount(Number(value))}
              options={Array.from(
                { length: selectedOption?.capabilities.maxVariations ?? 1 },
                (_, index) => index + 1
              ).map((value) => ({ value: String(value), label: `${value} image${value > 1 ? "s" : ""}` }))}
            />

            {/* Finding references is offered whatever model is selected: it is
                an act on the article, and it switches the model itself if the
                one in the dock cannot read what it found. */}
            {references.length < MAX_FOUND_REFERENCES && (
              <button
                type="button"
                onClick={() => void findReferences()}
                disabled={finding || busy !== null}
                className="cs-tool shrink-0"
              >
                <Sparkles aria-hidden className="size-4" strokeWidth={1.6} />
                {finding ? "Looking…" : "Find references"}
              </button>
            )}

            <label
              className={`cs-tool cursor-pointer ${referenceMissing ? "text-danger-ink" : ""}`}
              id="reference-image-label"
            >
              <ImagePlus aria-hidden className="size-4" strokeWidth={1.6} />
              {uploading ? "Uploading…" : referenceMissing ? "Reference required" : "Upload"}
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

            {/* The same pair as the home composer, carrying the same handoff:
                with nothing written, asking the system to write it is the live
                action; once there is a prompt, sending it is. */}
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={draftPrompt}
                /* Blocked while the field holds words the editor wrote, which
                   is what this rule was always for — not while it holds the
                   draft this button itself produced. Re-drafting then overwrites
                   nothing of theirs, and it is the only way to get a fuller set
                   of concepts after raising the image count. */
                disabled={busy !== null || !anthropicReady || (hasPrompt && prompt !== draftedPrompt)}
                aria-describedby={!anthropicReady ? "auto-draft-requirement" : undefined}
                className="cs-btn cs-dock-btn cs-dock-btn--wide shrink-0 border-[var(--orange-200)] bg-accent-soft text-accent-press enabled:hover:border-[var(--orange-300)] enabled:hover:bg-[var(--orange-200)]"
              >
                <AccentOrb />
                <span className="whitespace-nowrap pl-2">
                  {busy === "prompt" ? "Drafting…" : "Auto-draft"}
                </span>
              </button>
              <button
                type="button"
                onClick={generate}
                disabled={generateBlocked || !hasPrompt}
                aria-describedby={referenceMissing ? "generate-requirement" : undefined}
                // Held level while it is merely waiting for a prompt; allowed to
                // fade once it is genuinely blocked by something else.
                className={`cs-dock-btn-icon shrink-0 ${hasPrompt ? "cs-btn-primary" : "cs-btn disabled:opacity-100"}`}
                aria-label={busy === "gen" ? "Generating images" : `Generate ${count} image${count > 1 ? "s" : ""}`}
                title={busy === "gen" ? undefined : `Generate ${count} image${count > 1 ? "s" : ""}`}
              >
                {busy === "gen"
                  ? <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
                  : <Send aria-hidden className="size-4" />}
              </button>
            </div>
          </div>
        </div>
        </div>
      </div>

    </div>
  );
}

function GeneratedImage({ img, feature = false, selected, onSelect, onDeleted }: {
  img: GeneratedImageView;
  /** The only image: shown large, but capped so a square cannot run away. */
  feature?: boolean;
  /** True when this image is the one that will reach the Hub. */
  selected: boolean;
  onSelect: () => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [ratioW, ratioH] = img.aspectRatio.split(":").map(Number);
  const ratio = ratioW && ratioH ? ratioW / ratioH : 1;

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
    <figure
      style={feature ? { maxWidth: Math.round(FEATURE_MAX_HEIGHT * ratio) } : undefined}
      className={`group overflow-hidden rounded-lg transition-shadow duration-(--duration-base) ease-(--ease-spring) ${
        selected
          ? "shadow-[0_0_0_2px_var(--accent),var(--shadow-plate)]"
          : "shadow-[0_0_0_1px_var(--border)] hover:shadow-[0_0_0_1px_var(--border-strong)]"
      }`}
    >
      <div className="relative">
        {/* The whole frame is the control: one image publishes, so picking it is
            a choice between cards, not a checkbox on each. Unselected tiles carry
            no label — a grid of "Use this" says the same thing as many times as
            there are images. The tint on hover is the affordance instead. */}
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={selected}
          className="absolute inset-0 z-10 cursor-pointer transition-colors duration-(--duration-fast) ease-(--ease-spring) hover:bg-ink/5 focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_3px_var(--orange-200)]"
        >
          <span className="sr-only">
            {selected ? `Variation ${img.variationNo} will be published` : `Publish variation ${img.variationNo}`}
          </span>
        </button>
        {selected && (
          <span
            aria-hidden
            className="absolute left-3 top-3 z-20 inline-flex min-h-8 items-center gap-1.5 rounded-full bg-accent px-3 text-xs font-bold text-white"
          >
            <IconCheck width={12} height={12} />
            Publishing
          </span>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={img.url}
          alt={`Generated companion image, variation ${img.variationNo}`}
          loading="lazy"
          decoding="async"
          className="w-full object-cover"
          style={{ aspectRatio: img.aspectRatio.replace(":", " / ") }}
        />
        {/* Per-image actions ride on the image and appear on intent. As a
            permanent caption strip they added a row of chrome to every tile,
            which is what made a grid of nine unmanageable. */}
        <div className="cs-reveal absolute right-2 top-2 z-20 flex items-center gap-1">
          <a
            href={img.url}
            download
            className="grid size-9 place-items-center rounded-full bg-surface/90 text-ink-2 shadow-sm backdrop-blur-sm transition-colors hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]"
            aria-label={`Download variation ${img.variationNo}`}
          >
            <IconDownload width={15} height={15} />
          </a>
          <button
            type="button"
            onClick={remove}
            disabled={deleting}
            className="grid size-9 place-items-center rounded-full bg-surface/90 text-danger-ink shadow-sm backdrop-blur-sm transition-colors hover:bg-danger-soft focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)] disabled:opacity-50"
            aria-label={deleting ? `Deleting variation ${img.variationNo}` : `Delete variation ${img.variationNo}`}
          >
            <IconTrash width={15} height={15} />
          </button>
        </div>

        {/* Kept for comparison, but only while the eye is on this tile. */}
        <figcaption className="cs-reveal pointer-events-none absolute inset-x-0 bottom-0 z-20 truncate bg-linear-to-t from-ink/70 to-transparent px-3 pb-2 pt-6 text-xs font-medium text-white">
          {img.model} · {img.aspectRatio} · v{img.variationNo}
        </figcaption>
      </div>

      {deleteError && <p className="bg-danger-soft px-3 py-2 text-xs text-danger" role="alert">{deleteError}</p>}

    </figure>
  );
}

/**
 * The Publish stage: a faithful preview of the article as it will appear on the
 * Knowledge Hub (left) beside the publish action rail (right). The rail is the
 * decision surface; the preview answers "what am I shipping?". Stacks to
 * preview-then-rail on narrow screens.
 */
function PublishComposer({
  projectId,
  title,
  publish,
  draftMd,
  coverImageUrl,
  coverAspectRatio,
  initialDek,
  published,
  anthropicReady,
  hubConfigured,
  publishedHubUrl,
}: {
  projectId: string;
  title: string;
  publish: PublishMetadata;
  draftMd: string;
  coverImageUrl: string | null;
  coverAspectRatio: number;
  initialDek: string | null;
  published: boolean;
  anthropicReady: boolean;
  hubConfigured: boolean;
  publishedHubUrl?: string;
}) {
  const [dek, setDek] = useState<string | null>(initialDek);
  // Pending from first render when there's no cached dek — avoids a synchronous
  // setState inside the effect below.
  const [dekPending, setDekPending] = useState(!initialDek);

  // Generate the dek once when the stage opens so the preview shows the real
  // subtitle; it's cached server-side and reused verbatim at publish time.
  useEffect(() => {
    if (dek) return;
    let active = true;
    ensurePublishDekAction(projectId)
      .then((value) => {
        if (active && value) setDek(value);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setDekPending(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const readMinutes = Math.max(1, Math.round(countMetrics(draftMd).words / 220));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-8">
      {/* No label above the preview: it renders the Hub's own masthead and
          chrome, which says what it is more convincingly than a caption. */}
      <div className="min-w-0">
        <HubPreviewFrame>
          <HubArticlePreview
            title={title}
            dek={dek}
            dekPending={dekPending}
            tags={publish.tags}
            coverImageUrl={coverImageUrl}
            coverAspectRatio={coverAspectRatio}
            bodyMarkdown={draftMd}
            meta={`${readMinutes} min read`}
          />
        </HubPreviewFrame>
      </div>

      {/* Clears the floating pill (68px) and its scrim, which is only fully
          transparent at 112px — top-24 parked the rail behind a partial veil. */}
      <div className="lg:sticky lg:top-32">
        <PublishRail
          projectId={projectId}
          publish={publish}
          published={published}
          anthropicReady={anthropicReady}
          hubConfigured={hubConfigured}
          publishedHubUrl={publishedHubUrl}
        />
      </div>
    </div>
  );
}

/**
 * The steps a publish actually moves through, in order. As with preparation
 * there is no progress channel back — publishToHubAction is one call — so this
 * advances on elapsed time and the labels name work attempted, never a result
 * claimed. The cover upload really is conditional server-side (no image, or a
 * failed upload, does not block the publish), which is why its note says so.
 */
const PUBLISH_STEPS = [
  { at: 0, label: "Preparing the article", note: "Title, dek and body." },
  { at: 2, label: "Uploading the cover", note: "Skipped if there is no image." },
  { at: 6, label: "Sending it to the Hub", note: "Converting and saving." },
] as const;

/**
 * The working state for a publish.
 *
 * It replaces the buttons rather than sitting beneath them. Leaving a disabled
 * CTA on screen was the whole problem: the only feedback a publish gave was
 * that button going grey, which reads as a dead control rather than work in
 * progress — and the "Publishing…" label lived on the confirm panel, which
 * send() unmounts on the same tick, so nobody ever saw it.
 */
function PublishingPanel({ status }: { status: "draft" | "published" }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // The last step holds until the action resolves and this panel unmounts, so
  // the rail cannot show a finish the server has not reached.
  let active = 0;
  for (let i = 0; i < PUBLISH_STEPS.length; i++) if (elapsed >= PUBLISH_STEPS[i].at) active = i;

  return (
    <div className="rounded-2xl bg-sunken p-3.5" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-ink">
          {status === "published" ? "Publishing to the Hub" : "Saving a draft to the Hub"}
        </p>
        <span className="font-mono text-xs tabular-nums text-ink-3" aria-label={`${elapsed} seconds elapsed`}>
          {`0:${String(elapsed % 60).padStart(2, "0")}`}
        </span>
      </div>

      <ol className="mt-3 space-y-2.5">
        {PUBLISH_STEPS.map((step, i) => {
          const state = i < active ? "done" : i === active ? "active" : "pending";
          return (
            <li key={step.label} className="flex gap-3">
              <span className="relative mt-[5px] flex size-2 shrink-0 items-center justify-center">
                {state === "active" && (
                  <span className="cs-ping absolute inline-flex size-2 rounded-full bg-accent" aria-hidden="true" />
                )}
                <span
                  className="relative inline-flex size-2 rounded-full transition-all duration-(--duration-slow) ease-(--ease-spring)"
                  style={{
                    background:
                      state === "pending" ? "transparent" : state === "done" ? "var(--ink-300)" : "var(--accent)",
                    boxShadow: state === "pending" ? "inset 0 0 0 1.5px var(--ink-200)" : "none",
                  }}
                />
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className="block text-xs font-medium transition-colors duration-(--duration-slow) ease-(--ease-spring)"
                  style={{
                    color:
                      state === "pending"
                        ? "var(--ink-400)"
                        : state === "done"
                          ? "var(--ink-secondary)"
                          : "var(--accent-press)",
                  }}
                >
                  {step.label}
                </span>
                {state === "active" && (
                  <>
                    <span className="mt-0.5 block text-[11px] leading-snug text-ink-3">{step.note}</span>
                    {/* Indeterminate: there is no real percentage to report. */}
                    <span
                      className="mt-2 block h-[3px] w-full overflow-hidden rounded-full"
                      style={{ background: "var(--accent-tint)" }}
                      aria-hidden="true"
                    >
                      <span className="cs-sweep block h-full w-1/4 rounded-full" style={{ background: "var(--accent)" }} />
                    </span>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ol>

      <p className="mt-3.5 border-t border-line pt-3 text-[11px] leading-relaxed text-ink-3">
        Keep this tab open — it finishes here and shows you the link.
      </p>
    </div>
  );
}

/**
 * The action rail beside the preview: article status, the taxonomy it will
 * publish under, the publish actions (live — inline-confirmed — or a Hub draft
 * to review the Thai translation first), and a quiet brand review with inline
 * findings. Category/tags derive from the content direction; the dek and Thai
 * translation are handled Hub-side.
 */
function PublishRail({
  projectId,
  publish,
  published,
  anthropicReady,
  hubConfigured,
  publishedHubUrl,
}: {
  projectId: string;
  publish: PublishMetadata;
  published: boolean;
  anthropicReady: boolean;
  hubConfigured: boolean;
  publishedHubUrl?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"draft" | "published" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [coverWarning, setCoverWarning] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; status: string } | undefined>(
    publishedHubUrl ? { url: publishedHubUrl, status: published ? "published" : "draft" } : undefined,
  );
  const [error, setError] = useState<string | null>(null);
  const [reviewing, startReview] = useTransition();
  const [review, setReview] = useState<BrandReviewResult | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const canPublish = publish.tags.length > 0;
  const disabled = busy !== null || !hubConfigured || !canPublish;
  const isLive = published || result?.status === "published";

  async function send(status: "draft" | "published") {
    setError(null);
    setCoverWarning(null);
    setConfirming(false);
    setBusy(status);
    try {
      const r = await publishToHubAction(projectId, status);
      // The action reports failure as data; a thrown server-action error is
      // redacted in production and says nothing about what the Hub refused.
      if (!r.ok) {
        setError(r.message);
        return;
      }
      setResult({ url: r.url, status: r.status });
      /* The article went up; the cover may not have. Not an error — the publish
         succeeded — so it is said beside the result rather than in place of it. */
      setCoverWarning(r.coverWarning ?? null);
      // The action no longer revalidates — doing so re-rendered the route
      // inside its own response and reported a failure for a publish that had
      // already succeeded. This refresh is a separate request with its own
      // budget, and it runs only once the publish is known to be good.
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Publishing to the Hub failed.");
    } finally {
      setBusy(null);
    }
  }

  function reviewArticle() {
    setReviewError(null);
    startReview(async () => {
      try {
        setReview(await reviewBrandAlignmentAction(projectId));
      } catch (cause) {
        setReviewError(cause instanceof Error ? cause.message : "The brand review could not be completed.");
      }
    });
  }

  const findings = review?.checks.filter((check) => check.status === "review") ?? [];

  return (
    <div aria-labelledby="publish-heading" className="space-y-4">
      {/* Where it lands and the act of sending it are one decision, so they are
          one block: taxonomy above the rule, actions below it. Publishing is
          public and the draft save is not, so the two stop being full-width
          buttons that differ only by fill. */}
      <section className="cs-bezel">
        <div className="cs-bezel-core p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="publish-heading" className="text-sm font-semibold text-ink">Publish to the Hub</h2>
            {isLive ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-ok-soft px-2.5 py-1 text-xs font-semibold text-ok-ink">
                <span className="size-1.5 rounded-full bg-ok" aria-hidden="true" />
                Published
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-sunken px-2.5 py-1 text-xs font-semibold text-ink-2">
                Draft
              </span>
            )}
          </div>
          {/* The pillar + tag are deliberately not shown here. The Hub owns the
              taxonomy (and it has changed — pillars merged/renamed), so echoing a
              category/tag on the CG side only risks contradicting what the editor
              sees once the article is live. The tag is still sent on publish and
              still renders in the faithful Hub preview beside this rail. */}
          {!canPublish && (
            <p className="mt-2 text-sm text-ink-2">No content direction set — add one to publish.</p>
          )}

          <div className="mt-4 space-y-3 border-t border-line pt-4">
          {/* While it runs, the working state stands in for the controls. A
              disabled CTA left on screen was read as a frozen app rather than
              as work in progress. */}
          {busy ? (
            <PublishingPanel status={busy} />
          ) : (
            <>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={disabled || confirming}
            className="cs-cta group w-full justify-between"
          >
            {isLive ? "Republish to Hub" : "Publish to Hub"}
            <span aria-hidden className="cs-cta-disc"><IconCheck width={15} height={15} /></span>
          </button>

          {/* The confirmation opens below the trigger rather than replacing it.
              Replacing it in place put "Publish live" under a cursor that had
              just clicked, one stray double-click from making an article
              public. */}
          {confirming && (
            <div
              className="space-y-3 rounded-2xl bg-sunken p-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-200"
              aria-live="polite"
            >
              <p className="text-sm leading-relaxed text-ink-2">
                Goes live and public on the Hub, auto-translated to Thai — editable in the Hub after.
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setConfirming(false)} disabled={busy !== null} className="cs-btn flex-1">
                  Cancel
                </button>
                <button type="button" onClick={() => void send("published")} disabled={busy !== null} className="cs-btn-primary flex-1">
                  Publish live
                </button>
              </div>
            </div>
          )}

          <button type="button" onClick={() => void send("draft")} disabled={disabled} className="cs-tool w-full justify-center">
            Save as a Hub draft instead
          </button>
            </>
          )}

          {/* The badge above already says what state it is in, so this stops
              restating it and becomes the one thing it can uniquely offer: the
              way there. A real icon rather than an arrow glyph, and it says out
              loud that it leaves the app. */}
          {result?.url && !confirming && !busy && (
            <a
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full bg-ok-soft px-4 text-sm font-semibold text-ok-ink transition-colors duration-(--duration-fast) ease-(--ease-spring) hover:bg-ok-soft/70 focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]"
            >
              {isLive ? "Open on the Hub" : "Review the Hub draft"}
              <ExternalLink aria-hidden className="size-4" strokeWidth={1.8} />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          )}
          {!hubConfigured && (
            <p className="text-sm text-ink-2">
              Set <code>HUB_BASE_URL</code> and <code>HUB_API_KEY</code> to enable publishing.
            </p>
          )}
          {error && <p className="text-sm text-danger" role="alert">{error}</p>}
          {/* PUBLISHED, BUT WITHOUT ITS PICTURE. Caution rather than danger: the
              article is live and the link above works. This exists because the
              cover failed silently for ten days — articles arrived at the Hub
              with no image and nothing said so, and a missing cover is
              indistinguishable from one nobody asked for. */}
          {coverWarning && !error && (
            <p className="text-sm text-warn" role="status">
              {coverWarning}
            </p>
          )}
          </div>
        </div>
      </section>

      {/* Sits below the publish block. The check reads the finished article
          against the brand profile; running it before publishing is still the
          useful order, so its findings stay open above the fold once run. */}
      <section className="cs-bezel">
        <div className="cs-bezel-core p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-ink">Brand check</h3>
            <button type="button" onClick={reviewArticle} disabled={reviewing || !anthropicReady} className="cs-tool">
              <IconSpark width={15} height={15} />
              {reviewing ? "Reviewing…" : review ? "Again" : "Run"}
            </button>
          </div>
          {!anthropicReady && <p className="mt-2 text-sm text-ink-2">Configure Anthropic to run the review.</p>}
          {reviewError && <p className="mt-2 text-sm text-danger" role="alert">{reviewError}</p>}
          {!review && anthropicReady && !reviewing && (
            <p className="mt-2 text-sm leading-relaxed text-ink-2">
              Reads the finished article against the brand profile before it goes out.
            </p>
          )}
          {review && (
            <div className="mt-3" aria-live="polite">
              <p className={`text-sm font-medium ${findings.length ? "text-ink" : "text-ok-ink"}`}>
                {findings.length ? review.summary : "No issues need attention."}
              </p>
              {findings.length > 0 && (
                <ul className="mt-3 space-y-3 border-t border-line pt-3">
                  {findings.map((check, index) => (
                    <li key={`${check.criterion}-${index}`}>
                      <p className="text-sm font-semibold text-ink">{check.criterion}</p>
                      <p className="mt-1 text-sm leading-relaxed text-ink-2">{check.finding}</p>
                      <p className="mt-1.5 text-sm font-medium text-accent-ink">Suggested edit: {check.suggestion}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
