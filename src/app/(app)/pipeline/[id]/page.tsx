import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { coverImage, loadProject } from "@/lib/projects";
import { publishMetadata } from "@/lib/publish-meta";
import { isAnthropicConfigured } from "@/lib/anthropic";
import { isHubConfigured } from "@/lib/hub";
import { imageGenerationOptions } from "@/lib/image/registry";
import { Stepper } from "@/components/stepper";
import { PrepareDraftStage } from "./stages/prepare-draft-stage";
import { DraftsStage } from "./stages/drafts-stage";
import { PublishStage } from "./stages/publish-stage";

export const dynamic = "force-dynamic";
/** The research plan, image generation and publishing all run as actions on
 *  this page, and each can outlast the platform default. See the note on the
 *  Create page. */
export const maxDuration = 60;

/** Every pipeline tab used to read "Designally Content Studio", so two open
 *  articles were indistinguishable from the tab strip alone. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const loaded = await loadProject(id);
  const name = loaded?.project.selectedTopic?.title?.trim();
  return { title: `${name || "Untitled article"} · Content Studio` };
}

/** Parse an aspect-ratio string ("16:9", "3:2", "1:1") to width/height. Falls
 * back to 3:2 when unset or malformed; clamped to a sane range. */
function parseAspectRatio(raw: string | undefined): number {
  const m = raw?.match(/^\s*(\d+(?:\.\d+)?)\s*[:/xX]\s*(\d+(?:\.\d+)?)\s*$/);
  const ratio = m ? Number(m[1]) / Number(m[2]) : NaN;
  if (!Number.isFinite(ratio) || ratio <= 0) return 1.5;
  return Math.min(3, Math.max(0.4, ratio));
}

export default async function PipelinePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ stage?: string; view?: string }>;
}) {
  const { id } = await params;
  const { stage: stageParam, view: viewParam } = await searchParams;
  const loaded = await loadProject(id);
  if (!loaded) notFound();

  const reached = loaded.project.stage;
  const requested = stageParam ? parseInt(stageParam, 10) : reached;
  const current = Math.min(
    Math.max(Number.isNaN(requested) ? reached : requested, 1),
    reached,
  );

  const anthropicReady = await isAnthropicConfigured();
  const imageOptions = await imageGenerationOptions();
  const title = loaded.project.selectedTopic?.title;
  const published = loaded.project.status === "published";
  // Only one image reaches the Hub, and `coverImage` is the single answer to
  // which one — shared with publishing, which used to decide separately and
  // disagree.
  const cover = coverImage(loaded);
  // Cover aspect ratio (width / height) — drives the preview hero's 50% overflow.
  const coverAspectRatio = parseAspectRatio(
    cover?.aspectRatio ?? loaded.project.inputs.imageAspectRatio,
  );
  const finalizeView: "images" | "complete" =
    viewParam === "images" || viewParam === "complete"
      ? viewParam
      : published
        ? "complete"
        : "images";

  return (
    /* The 48px menu strip is a SIBLING of this page, not part of it, so
       `min-h-screen` here asked for a full viewport BELOW a bar that had
       already taken 48 of it — every stage was 48px taller than the phone and
       scrolled by exactly that much with nothing in the gap. */
    <div className="flex min-h-[calc(100svh-3rem)] flex-col lg:min-h-screen">
      {/* A floating pill carrying only the stepper. Each stage names the article
          in its own body, so repeating it in the chrome said nothing the content
          was not already saying; the browser tab carries identity for anyone
          scanning across windows. */}
      {/* Offset below the app's mobile header rather than pinned over it — both
          were at 0 in one scroll root, which put the stepper on top of the
          hamburger. The pill itself stays: it is progress, not a title bar. */}
      {/* NO ISLAND. The steps sat on a blurred glass pill with an inset ring
          and a shadow, over a gradient scrim painted to stop the page colliding
          with it — a floating surface, and the scrim existed only to manage the
          consequences of floating. On the page itself, on the same gutter as
          everything else, it needs neither. */}
      {/* BESIDE THE MENU BUTTON, NOT UNDER IT. The rail's button claims a 48px
          line at the top of a phone and only its own width of it; this pulls
          the stepper up onto that same line, so the top of the screen is one
          row — a button, then the progress — instead of two bands of chrome
          stacked above an article.

          `py-2` rather than `py-3` is what makes the heights agree: 8 + the
          32px pill + 8 is the 48 the button's line is tall. They both stick to
          the top, so a disagreement here would show as a step of background
          against the button while scrolling. Above `lg` the rail is a sidebar,
          there is no button, and the row goes back to its own line. */}
      <div className="sticky top-0 z-(--z-sticky) mx-auto -mt-12 w-full max-w-7xl px-3 py-2 sm:px-8 lg:mt-0 lg:px-12 lg:py-3 xl:px-16">
        {/* PROGRESSIVE BLUR, NOT A LID. This was `bg-bg` — an opaque band the
            width of the page, so the article did not pass under the stepper so
            much as get chopped off by it, and the bar read as a second surface
            floating over the page rather than as part of it.

            Three stacked layers, each blurring harder and stopping sooner: at
            the top all three apply, a third of the way down only the softest
            still does, and by the bottom edge there is none. That gradient is
            what makes it read as depth — the text is visibly still there,
            going out of focus as it slides underneath, instead of vanishing at
            a hard line.

            Blur alone would leave the type legible enough to compete with the
            steps, so each layer carries a wash of the page's own ground with
            it. `-z-10` keeps the whole stack behind the steps while staying
            inside this element's own stacking context, which `sticky` plus a
            z-index has already created. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[calc(100%+1.25rem)]"
        >
          <div className="absolute inset-0 bg-bg/35 backdrop-blur-[2px] [mask-image:linear-gradient(to_bottom,#000_0,#000_62%,transparent_100%)]" />
          <div className="absolute inset-0 bg-bg/35 backdrop-blur-[8px] [mask-image:linear-gradient(to_bottom,#000_0,#000_38%,transparent_74%)]" />
          <div className="absolute inset-0 bg-bg/35 backdrop-blur-[16px] [mask-image:linear-gradient(to_bottom,#000_0,#000_16%,transparent_46%)]" />
        </div>
        <Stepper
          projectId={id}
          current={current}
          reached={reached}
          finalizeView={finalizeView}
        />
      </div>

      <div className="flex-1">
        {current <= 3 && (
          <PrepareDraftStage
            projectId={id}
            selected={loaded.project.selectedTopic ?? null}
            anthropicReady={anthropicReady}
          />
        )}
        {(current === 4 || current === 5) && (
          <DraftsStage
            projectId={id}
            drafts={loaded.drafts.map((d) => ({
              id: d.id,
              variationNo: d.variationNo,
              contentMd: d.contentMd,
              isSelected: d.isSelected,
            }))}
            refinements={loaded.refinements.map((revision) => ({
              id: revision.id,
              userMessage: revision.userMessage,
              resultMd: revision.resultMd,
            }))}
            targetLength={loaded.articleRules.length}
            anthropicReady={anthropicReady}
          />
        )}
        {current === 6 && (
          <PublishStage
            projectId={id}
            title={title ?? "Untitled project"}
            publish={publishMetadata(loaded.category?.name)}
            draftId={
              (loaded.drafts.find((d) => d.isSelected) ?? loaded.drafts[0])
                ?.id ?? ""
            }
            longForm={loaded.articleRules.longForm}
            draftMd={
              (loaded.drafts.find((d) => d.isSelected) ?? loaded.drafts[0])
                ?.contentMd ?? ""
            }
            coverImageUrl={cover ? `/api/images/${cover.id}` : null}
            coverAspectRatio={coverAspectRatio}
            coverImageId={cover?.id ?? null}
            initialDek={loaded.project.inputs.publishDek ?? null}
            published={published}
            images={loaded.images.map((img) => ({
              id: img.id,
              url: `/api/images/${img.id}`,
              provider: img.provider,
              model: img.model,
              aspectRatio: img.aspectRatio,
              variationNo: img.variationNo,
            }))}
            imageReferences={loaded.imageReferences.map((ref) => ({
              id: ref.id,
              url: `/api/image-references/${ref.id}`,
              name: ref.originalName,
              width: ref.width,
              height: ref.height,
              origin: ref.origin,
              sourceUrl: ref.sourceUrl,
              sourceName: ref.sourceName,
              license: ref.license,
            }))}
            imageConfig={{
              optionId: loaded.project.inputs.imageProvider
                ? `${loaded.project.inputs.imageProvider}::${loaded.project.inputs.imageApiKeyId ?? ""}`
                : "",
              count: loaded.project.inputs.imageCount ?? 1,
              aspectRatio: loaded.project.inputs.imageAspectRatio ?? "1:1",
            }}
            options={imageOptions}
            initialView={finalizeView}
            anthropicReady={anthropicReady}
            hubConfigured={isHubConfigured()}
            publishedHubUrl={
              (loaded.project.publishedTo as Record<string, string> | null)
                ?.knowledgeHub
            }
          />
        )}
      </div>
    </div>
  );
}
