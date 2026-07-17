"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { StageShell, ApiNotReady } from "./stage-shell";
import { Markdown } from "@/components/markdown";
import { streamNdjson } from "@/lib/ndjson-client";
import { selectDraftAction } from "../actions";
import { IconArrowRight, IconCheck } from "@/components/icons";

type DraftView = {
  id: string | null;
  variationNo: number;
  contentMd: string;
  isSelected: boolean;
  metricLabel?: string;
  streaming: boolean;
  error?: string | null;
};

const VARIATION_LABEL = ["Bold hook", "Story angle", "Data / how-to"];

export function DraftsStage({
  projectId,
  drafts,
  targetLength,
  anthropicReady,
}: {
  projectId: string;
  drafts: {
    id: string;
    variationNo: number;
    contentMd: string;
    isSelected: boolean;
  }[];
  targetLength: string;
  anthropicReady: boolean;
}) {
  const initial: DraftView[] = [1, 2, 3].map((n) => {
    const existing = drafts.find((d) => d.variationNo === n);
    return existing
      ? { ...existing, streaming: false, error: null }
      : {
          id: null,
          variationNo: n,
          contentMd: "",
          isSelected: false,
          streaming: false,
          error: null,
        };
  });

  const [views, setViews] = useState<DraftView[]>(initial);
  const [pending, startTransition] = useTransition();

  const selectedId = views.find((v) => v.isSelected)?.id ?? null;

  function patch(n: number, p: Partial<DraftView>) {
    setViews((prev) => prev.map((v) => (v.variationNo === n ? { ...v, ...p } : v)));
  }

  async function streamOne(n: number) {
    patch(n, { contentMd: "", streaming: true, error: null, metricLabel: undefined });
    try {
      let acc = "";
      for await (const ev of streamNdjson<{
        t: string;
        d?: string;
        draftId?: string;
        metricLabel?: string;
        m?: string;
      }>(`/api/pipeline/${projectId}/draft`, { variation: n })) {
        if (ev.t === "delta" && ev.d) {
          acc += ev.d;
          patch(n, { contentMd: acc });
        } else if (ev.t === "done") {
          patch(n, {
            id: ev.draftId ?? null,
            metricLabel: ev.metricLabel,
            streaming: false,
          });
        } else if (ev.t === "error") {
          patch(n, { streaming: false, error: ev.m ?? "Failed" });
        }
      }
    } catch (err) {
      patch(n, {
        streaming: false,
        error: err instanceof Error ? err.message : "Failed",
      });
    }
  }

  // Variation 1 writes itself as soon as the stage opens. Variations 2 and 3
  // are on demand — only worth their tokens if the first angle misses.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current || !anthropicReady) return;
    // Already written on an earlier visit — don't spend tokens rewriting it.
    if (drafts.some((d) => d.variationNo === 1)) return;
    autoStarted.current = true;
    // Kick off after commit: streamOne sets state on its first line, which must
    // not run synchronously inside the effect.
    const id = setTimeout(() => void streamOne(1), 0);
    return () => {
      clearTimeout(id);
      // Let a StrictMode remount re-arm; the ref only guards re-renders.
      autoStarted.current = false;
    };
    // streamOne is stable for the life of the stage; re-running would double-bill.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anthropicReady]);

  function select(draftId: string | null) {
    if (!draftId) return;
    const fd = new FormData();
    fd.set("projectId", projectId);
    fd.set("draftId", draftId);
    startTransition(() => selectDraftAction(fd));
  }

  return (
    <StageShell
      title="Draft"
      description="Read the recommended first draft at a comfortable width. Alternative approaches stay out of the way until you need them."
      wide
    >
      {!anthropicReady ? (
        <ApiNotReady />
      ) : (
        <>
          <div className="mx-auto max-w-4xl">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[var(--tracking-caps)] text-accent-ink">
                Recommended draft
              </p>
              <p className="text-xs text-ink-3">
              Target length: <span className="text-ink-2">{targetLength}</span>
              </p>
            </div>
            <DraftCard
              view={views[0]}
              label={VARIATION_LABEL[0]}
              selectedId={selectedId}
              onRegenerate={() => streamOne(1)}
              onSelect={() => select(views[0].id)}
              busy={pending}
              primary
            />

            <details className="mt-5 rounded-xl border border-line bg-surface">
              <summary className="cursor-pointer px-5 py-4 text-sm font-medium text-ink-2 hover:text-ink">
                Try 2 alternative approaches
              </summary>
              <div className="grid gap-4 border-t border-line p-4 lg:grid-cols-2">
                {views.slice(1).map((v) => (
              <DraftCard
                key={v.variationNo}
                view={v}
                label={VARIATION_LABEL[v.variationNo - 1]}
                selectedId={selectedId}
                onRegenerate={() => streamOne(v.variationNo)}
                onSelect={() => select(v.id)}
                busy={pending}
              />
            ))}
              </div>
            </details>
          </div>
        </>
      )}
    </StageShell>
  );
}

function DraftCard({
  view,
  label,
  selectedId,
  onRegenerate,
  onSelect,
  busy,
  primary = false,
}: {
  view: DraftView;
  label: string;
  selectedId: string | null;
  onRegenerate: () => void;
  onSelect: () => void;
  busy: boolean;
  primary?: boolean;
}) {
  const isSelected = view.id != null && view.id === selectedId;
  return (
    <div
      className={`flex flex-col rounded-xl border bg-surface transition-shadow ${
        isSelected ? "border-accent shadow-[0_0_0_3px_var(--accent-soft)]" : "border-line"
      }`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-sunken text-xs font-semibold text-ink-2">
            {view.variationNo}
          </span>
          <span className="text-sm font-medium text-ink">{label}</span>
        </div>
        {view.streaming ? (
          <span className="text-xs text-accent-ink">writing…</span>
        ) : view.metricLabel ? (
          <span className="text-xs text-ink-3">{view.metricLabel}</span>
        ) : null}
      </div>

      <div className={`${primary ? "min-h-[22rem] px-5 py-6 sm:px-8 sm:py-8" : "max-h-[24rem] min-h-[8rem] overflow-y-auto px-4 py-3"}`}>
        {view.error ? (
          <p className="text-sm text-danger" role="alert">{view.error}</p>
        ) : view.contentMd ? (
          <Markdown>{view.contentMd}</Markdown>
        ) : view.streaming ? (
          <p className="py-8 text-center text-sm text-ink-3">…</p>
        ) : (
          <p className="px-2 py-8 text-center text-sm text-ink-3">
            Generate this angle if the first draft isn&apos;t what you wanted.
          </p>
        )}
        {view.streaming && (
          <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-accent align-text-bottom" />
        )}
      </div>

      <div className={`mt-auto flex items-center justify-end border-t border-line ${primary ? "px-5 py-4 sm:px-8" : "px-4 py-2.5"}`}>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <button
            onClick={onRegenerate}
            disabled={view.streaming}
            className="cs-btn !px-2.5 !py-1 text-xs"
          >
            {view.streaming ? "Writing…" : view.contentMd ? "Regenerate" : "Generate"}
          </button>
          <button
            onClick={onSelect}
            disabled={!view.id || view.streaming || busy}
            className={
              isSelected
                ? "inline-flex min-h-9 items-center gap-1 rounded-md bg-ok px-2.5 py-1 text-xs font-medium text-white [@media(pointer:coarse)]:min-h-11"
                : "cs-btn-primary !px-2.5 !py-1 text-xs"
            }
          >
            {isSelected ? (
              <>
                <IconCheck width={13} height={13} /> Selected
              </>
            ) : (
              <>
                {primary ? "Continue with this draft" : "Use this draft"} <IconArrowRight width={13} height={13} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
