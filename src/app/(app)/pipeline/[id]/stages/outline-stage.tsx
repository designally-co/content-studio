"use client";

import { useState, useTransition } from "react";
import { StageShell, ApiNotReady } from "./stage-shell";
import {
  generateOutlineAction,
  saveOutlineAction,
  approveOutlineAction,
} from "../actions";
import { IconSpark, IconArrowRight, IconCheck } from "@/components/icons";

export function OutlineStage({
  projectId,
  markdown,
  longForm,
  anthropicReady,
}: {
  projectId: string;
  markdown: string;
  longForm: boolean;
  anthropicReady: boolean;
}) {
  const [text, setText] = useState(markdown);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const result = await generateOutlineAction(projectId);
      setText(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate outline.");
    } finally {
      setLoading(false);
    }
  }

  function save() {
    const fd = new FormData();
    fd.set("projectId", projectId);
    fd.set("markdown", text);
    startTransition(async () => {
      await saveOutlineAction(fd);
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    });
  }

  function approve() {
    const fd = new FormData();
    fd.set("projectId", projectId);
    fd.set("markdown", text);
    startTransition(() => approveOutlineAction(fd));
  }

  return (
    <StageShell
      title={longForm ? "Outline approval" : "Content plan"}
      description={
        longForm
          ? "A structured outline matching the brand and article brief. Edit inline, regenerate, or approve."
          : "A compact plan — hook, body angle, CTA, hashtags. Edit inline, regenerate, or approve."
      }
    >
      {!anthropicReady ? (
        <ApiNotReady />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button onClick={generate} disabled={loading || pending} className="cs-btn">
              <IconSpark width={16} height={16} />
              {loading ? "Generating…" : text ? "Regenerate" : "Generate outline"}
            </button>
            {text && (
              <button onClick={save} disabled={pending} className="cs-btn">
                {saved ? <IconCheck width={16} height={16} /> : null}
                {saved ? "Saved" : "Save edits"}
              </button>
            )}
          </div>

          {error && (
            <p className="mb-3 rounded-lg border border-danger/30 bg-danger-soft px-4 py-2.5 text-sm text-danger" role="alert">
              {error}
            </p>
          )}

          {loading ? (
            <div className="cs-card h-72 animate-pulse bg-sunken/40" />
          ) : (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Generate an outline, or write your own here…"
              className="cs-textarea min-h-[24rem] font-mono text-sm leading-relaxed"
            />
          )}

          <div className="mt-6 flex justify-end border-t border-line pt-6">
            <button
              onClick={approve}
              disabled={pending || !text.trim()}
              className="cs-btn-primary"
            >
              Approve &amp; write drafts
              <IconArrowRight width={16} height={16} />
            </button>
          </div>
        </>
      )}
    </StageShell>
  );
}
