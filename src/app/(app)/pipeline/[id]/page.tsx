import { notFound } from "next/navigation";
import { loadProject, costSummary } from "@/lib/projects";
import { isAnthropicConfigured } from "@/lib/anthropic";
import { imageGenerationOptions } from "@/lib/image/registry";
import { Stepper } from "@/components/stepper";
import { fmtUsd } from "@/lib/cost";
import { SetupSummary } from "./stages/setup-summary";
import { TopicsStage } from "./stages/topics-stage";
import { OutlineStage } from "./stages/outline-stage";
import { DraftsStage } from "./stages/drafts-stage";
import { RefineStage } from "./stages/refine-stage";
import { FinalizeStage } from "./stages/finalize-stage";

export const dynamic = "force-dynamic";

const LANG_LABEL: Record<string, string> = {
  en: "English",
  th: "Thai",
  both: "Thai + English",
};

export default async function PipelinePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ stage?: string }>;
}) {
  const { id } = await params;
  const { stage: stageParam } = await searchParams;
  const loaded = await loadProject(id);
  if (!loaded) notFound();

  const reached = loaded.project.stage;
  const requested = stageParam ? parseInt(stageParam, 10) : reached;
  const current = Math.min(Math.max(Number.isNaN(requested) ? reached : requested, 1), reached);

  const anthropicReady = await isAnthropicConfigured();
  const imageOptions = await imageGenerationOptions();
  const cost = costSummary(loaded);
  const title = loaded.project.selectedTopic?.title;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-4 py-4 sm:px-6 lg:px-8">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight text-ink">
            {title || `Untitled project · ${loaded.brand.name}`}
          </h1>
          <p className="mt-0.5 text-xs text-ink-3">
            {loaded.brand.name} · {LANG_LABEL[loaded.project.language]}
            {loaded.category ? ` · ${loaded.category.name}` : ""}
          </p>
        </div>
        <div className="flex min-h-10 items-center gap-2 rounded-full border border-line bg-bg px-3 py-1.5">
          <span className="text-xs text-ink-3">Project cost</span>
          <span className="num text-sm font-semibold text-ink">
            {fmtUsd(cost.totalCostUsd)}
          </span>
        </div>
      </header>

      <Stepper projectId={id} current={current} reached={reached} />

      <div className="flex-1">
        {current === 1 && (
          <SetupSummary
            projectId={id}
            brandName={loaded.brand.name}
            categoryName={loaded.category?.name ?? "Suggest for me"}
            language={LANG_LABEL[loaded.project.language]}
            inputs={loaded.project.inputs}
          />
        )}
        {current === 2 && (
          <TopicsStage
            projectId={id}
            suggestions={loaded.project.topicSuggestions ?? []}
            selected={loaded.project.selectedTopic ?? null}
            hasBrief={Boolean(loaded.project.inputs.brief)}
            anthropicReady={anthropicReady}
          />
        )}
        {current === 3 && (
          <OutlineStage
            projectId={id}
            markdown={loaded.project.outline?.markdown ?? ""}
            longForm={loaded.articleRules.longForm}
            anthropicReady={anthropicReady}
          />
        )}
        {current === 4 && (
          <DraftsStage
            projectId={id}
            drafts={loaded.drafts.map((d) => ({
              id: d.id,
              variationNo: d.variationNo,
              contentMd: d.contentMd,
              isSelected: d.isSelected,
              costUsd: Number(d.costUsd),
            }))}
            targetLength={loaded.articleRules.length}
            anthropicReady={anthropicReady}
          />
        )}
        {current === 5 && (
          <RefineStage
            projectId={id}
            draft={(() => {
              const sel = loaded.drafts.find((d) => d.isSelected) ?? loaded.drafts[0];
              return sel ? { id: sel.id, contentMd: sel.contentMd } : null;
            })()}
            refinements={loaded.refinements.map((r) => ({
              id: r.id,
              userMessage: r.userMessage,
              costUsd: Number(r.costUsd),
            }))}
            anthropicReady={anthropicReady}
          />
        )}
        {current === 6 && (
          <FinalizeStage
            projectId={id}
            title={title ?? "Untitled project"}
            draftId={(loaded.drafts.find((d) => d.isSelected) ?? loaded.drafts[0])?.id ?? ""}
            longForm={loaded.articleRules.longForm}
            draftMd={
              (loaded.drafts.find((d) => d.isSelected) ?? loaded.drafts[0])?.contentMd ?? ""
            }
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
            cost={cost}
            approvalOutcome={loaded.project.approvalOutcome}
            anthropicReady={anthropicReady}
          />
        )}
      </div>
    </div>
  );
}
