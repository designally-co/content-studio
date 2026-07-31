import { notFound } from "next/navigation";
import { loadProject } from "@/lib/projects";
import { publishMetadata } from "@/lib/publish-meta";
import { isAnthropicConfigured } from "@/lib/anthropic";
import { isHubConfigured } from "@/lib/hub";
import { imageGenerationOptions } from "@/lib/image/registry";
import { Stepper } from "@/components/stepper";
import { SimpleDirectionStage } from "./stages/simple-direction-stage";
import { DraftsStage } from "./stages/drafts-stage";
import { PublishStage } from "./stages/publish-stage";

export const dynamic = "force-dynamic";

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
  const current = Math.min(Math.max(Number.isNaN(requested) ? reached : requested, 1), reached);

  const anthropicReady = await isAnthropicConfigured();
  const imageOptions = await imageGenerationOptions();
  const title = loaded.project.selectedTopic?.title;
  const published = loaded.project.status === "published";
  // Cover aspect ratio (width / height) — drives the preview hero's 50% overflow.
  const coverAspectRatio = parseAspectRatio(
    loaded.images[0]?.aspectRatio ?? loaded.project.inputs.imageAspectRatio,
  );
  const finalizeView: "images" | "complete" = viewParam === "images" || viewParam === "complete"
    ? viewParam
    : published ? "complete" : "images";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-(--z-sticky) border-b border-line bg-bg">
        <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 sm:py-5 lg:px-12 xl:px-16">
          <h1 className="text-[length:var(--text-h1)] font-bold text-ink">
            {title || "Untitled article"}
          </h1>
          <Stepper projectId={id} current={current} reached={reached} published={published} finalizeView={finalizeView} />
        </div>
      </header>

      <div className="flex-1">
        {current <= 3 && (
          <SimpleDirectionStage
            projectId={id}
            suggestions={loaded.project.topicSuggestions ?? []}
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
            draftId={(loaded.drafts.find((d) => d.isSelected) ?? loaded.drafts[0])?.id ?? ""}
            longForm={loaded.articleRules.longForm}
            draftMd={
              (loaded.drafts.find((d) => d.isSelected) ?? loaded.drafts[0])?.contentMd ?? ""
            }
            coverImageUrl={loaded.images[0] ? `/api/images/${loaded.images[0].id}` : null}
            coverAspectRatio={coverAspectRatio}
            initialDek={loaded.project.inputs.publishDek ?? null}
            published={published}
            images={loaded.images.map((img) => ({
              id: img.id,
              url: `/api/images/${img.id}`,
              provider: img.provider,
              model: img.model,
              aspectRatio: img.aspectRatio,
              variationNo: img.variationNo,
              branding: img.branding,
            }))}
            brandLogo={{
              hasLogo: loaded.brand.logoData !== "",
              defaultOverlay: loaded.brand.logoOverlay,
            }}
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
              (loaded.project.publishedTo as Record<string, string> | null)?.knowledgeHub
            }
          />
        )}
      </div>
    </div>
  );
}
