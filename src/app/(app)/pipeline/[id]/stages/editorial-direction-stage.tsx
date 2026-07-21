"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { EditorialCandidate } from "@/lib/editorial";
import { IconArrowRight, IconSpark } from "@/components/icons";
import { StageShell, ApiNotReady } from "./stage-shell";
import {
  approveOutlineAction,
  generateEditorialOutlineAction,
  researchEditorialCandidatesAction,
  saveOutlineAction,
} from "../actions";

export function EditorialDirectionStage({
  projectId,
  candidates: initialCandidates,
  selectedIds: initialSelectedIds,
  markdown: initialMarkdown,
  targetCount,
  anthropicReady,
}: {
  projectId: string;
  candidates: EditorialCandidate[];
  selectedIds: string[];
  markdown: string;
  targetCount: number;
  anthropicReady: boolean;
}) {
  const [candidates, setCandidates] = useState(initialCandidates);
  const [selected, setSelected] = useState<string[]>(initialSelectedIds);
  const [outline, setOutline] = useState(initialMarkdown);
  const [loading, setLoading] = useState<"research" | "outline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const autoStarted = useRef(false);

  async function research() {
    setLoading("research");
    setError(null);
    try {
      const result = await researchEditorialCandidatesAction(projectId);
      setCandidates(result);
      setSelected(result.filter((candidate) => candidate.confidence === "confirmed").slice(0, targetCount).map((candidate) => candidate.id));
      setOutline("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Research could not be completed.");
    } finally {
      setLoading(null);
    }
  }

  useEffect(() => {
    if (!anthropicReady || autoStarted.current || candidates.length > 0 || outline) return;
    autoStarted.current = true;
    const timer = setTimeout(() => void research(), 0);
    return () => clearTimeout(timer);
    // Research is persisted and should only auto-run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anthropicReady]);

  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  function move(id: string, delta: number) {
    setSelected((current) => {
      const index = current.indexOf(id);
      const nextIndex = index + delta;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  async function buildOutline() {
    setLoading("outline");
    setError(null);
    try {
      setOutline(await generateEditorialOutlineAction(projectId, selected));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The outline could not be created.");
    } finally {
      setLoading(null);
    }
  }

  function save() {
    const data = new FormData();
    data.set("projectId", projectId);
    data.set("markdown", outline);
    startTransition(() => saveOutlineAction(data));
  }

  function continueToDraft() {
    const data = new FormData();
    data.set("projectId", projectId);
    data.set("markdown", outline);
    startTransition(() => approveOutlineAction(data));
  }

  if (!anthropicReady) return <StageShell title="Research & curate"><ApiNotReady /></StageShell>;

  return (
    <StageShell title="Research & curate" description="Verify the candidates, choose what belongs in the article, then shape the editorial outline." wide>
      {error && <p className="mb-5 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">{error}</p>}
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-ink">Candidate research</p>
            <p className="mt-1 text-sm text-ink-3">{candidates.length ? `${candidates.length} candidates found · ${selected.length} selected` : "Searching official and reliable sources."}</p>
          </div>
          <button type="button" onClick={research} disabled={loading !== null} className="cs-btn"><IconSpark width={16} height={16} />{loading === "research" ? "Researching…" : candidates.length ? "Research again" : "Research candidates"}</button>
        </div>

        {loading === "research" && <div className="h-64 animate-pulse rounded-xl border border-line bg-sunken/50" />}
        {candidates.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <ul className="divide-y divide-line">
              {candidates.map((candidate) => (
                <li key={candidate.id} className="p-4 sm:p-5">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input type="checkbox" checked={selected.includes(candidate.id)} onChange={() => toggle(candidate.id)} className="mt-1 size-4 accent-[var(--accent)]" />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-ink">{candidate.name}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${candidate.confidence === "confirmed" ? "bg-ok-soft text-ok-ink" : "bg-warn-soft text-ink-2"}`}>{candidate.confidence === "confirmed" ? "Confirmed" : "Needs review"}</span>
                      </span>
                      <span className="mt-1 block text-sm text-ink-2">{[candidate.creator, candidate.organization].filter(Boolean).join(" · ")}</span>
                      <span className="mt-2 block text-sm text-ink-3">{candidate.distinctive}</span>
                      <span className="mt-1 block text-xs text-ink-3">{candidate.releaseEvidence}</span>
                      {candidate.officialUrl && <a href={candidate.officialUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} className="mt-2 inline-block text-sm font-medium text-accent-ink hover:underline">Open official source ↗</a>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}

        {candidates.length > 0 && (
          <section className="rounded-xl border border-line bg-sunken/40 p-4 sm:p-5">
            <h3 className="text-sm font-semibold text-ink">Selected order</h3>
            <p className="mt-1 text-xs text-ink-3">This order becomes the article structure.</p>
            <ol className="mt-3 space-y-2">
              {selected.map((id, index) => {
                const candidate = candidates.find((item) => item.id === id);
                if (!candidate) return null;
                return (
                  <li key={id} className="flex items-center gap-3 rounded-lg bg-surface px-3 py-2">
                    <span className="w-5 text-center text-xs font-semibold text-ink-3">{index + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{candidate.name}</span>
                    <button type="button" onClick={() => move(id, -1)} disabled={index === 0} className="grid size-8 place-items-center rounded-md text-ink-2 hover:bg-sunken disabled:opacity-30" aria-label={`Move ${candidate.name} up`}>↑</button>
                    <button type="button" onClick={() => move(id, 1)} disabled={index === selected.length - 1} className="grid size-8 place-items-center rounded-md text-ink-2 hover:bg-sunken disabled:opacity-30" aria-label={`Move ${candidate.name} down`}>↓</button>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        {candidates.length > 0 && (
          <div className="flex justify-end">
            <button type="button" onClick={buildOutline} disabled={loading !== null || selected.length === 0} className="cs-btn-primary">{loading === "outline" ? "Building outline…" : "Build outline from selection"}<IconArrowRight width={16} height={16} /></button>
          </div>
        )}

        {outline && (
          <section className="rounded-xl border border-line bg-surface p-5 sm:p-6">
            <label htmlFor="editorial-outline" className="cs-label">Editorial outline and research notes</label>
            <textarea id="editorial-outline" value={outline} onChange={(event) => setOutline(event.target.value)} className="cs-textarea min-h-[28rem] font-mono text-sm leading-relaxed" />
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={save} disabled={pending} className="cs-btn">Save edits</button>
              <button type="button" onClick={continueToDraft} disabled={pending || !outline.trim()} className="cs-btn-primary">Continue to draft<IconArrowRight width={16} height={16} /></button>
            </div>
          </section>
        )}
      </div>
    </StageShell>
  );
}
