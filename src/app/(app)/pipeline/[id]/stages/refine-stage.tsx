"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { StageShell, ApiNotReady } from "./stage-shell";
import { Markdown } from "@/components/markdown";
import { streamNdjson } from "@/lib/ndjson-client";
import { goToFinalizeAction } from "../actions";
import { fmtUsd } from "@/lib/format";
import { IconArrowRight, IconSpark } from "@/components/icons";

type ChatItem = { role: "user" | "system"; text: string; costUsd?: number };

const SUGGESTIONS = [
  "Make the intro shorter",
  "Make it more formal",
  "Add a section about pricing",
  "Tighten the CTA",
];

export function RefineStage({
  projectId,
  draft,
  refinements,
  anthropicReady,
}: {
  projectId: string;
  draft: { id: string; contentMd: string } | null;
  refinements: { id: string; userMessage: string; costUsd: number }[];
  anthropicReady: boolean;
}) {
  const [content, setContent] = useState(draft?.contentMd ?? "");
  const [messages, setMessages] = useState<ChatItem[]>(
    refinements.map((r) => ({ role: "user", text: r.userMessage, costUsd: r.costUsd }))
  );
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [content]);

  async function send(message: string) {
    const msg = message.trim();
    if (!msg || streaming) return;
    setInput("");
    setError(null);
    setMessages((m) => [...m, { role: "user", text: msg }]);
    setStreaming(true);
    try {
      let acc = "";
      for await (const ev of streamNdjson<{
        t: string;
        d?: string;
        costUsd?: number;
        m?: string;
      }>(`/api/pipeline/${projectId}/refine`, { message: msg })) {
        if (ev.t === "delta" && ev.d) {
          acc += ev.d;
          setContent(acc);
        } else if (ev.t === "done") {
          setMessages((m) => {
            const copy = [...m];
            const last = copy[copy.length - 1];
            if (last && last.role === "user") last.costUsd = ev.costUsd;
            return copy;
          });
          setMessages((m) => [
            ...m,
            { role: "system", text: "Draft updated." },
          ]);
        } else if (ev.t === "error") {
          setError(ev.m ?? "Refinement failed");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refinement failed");
    } finally {
      setStreaming(false);
    }
  }

  function finalize() {
    const fd = new FormData();
    fd.set("projectId", projectId);
    startTransition(() => goToFinalizeAction(fd));
  }

  if (!draft) {
    return (
      <StageShell title="Refine">
        <p className="text-sm text-ink-2">
          No draft selected yet. Go back to the Drafts stage and pick a variation.
        </p>
      </StageShell>
    );
  }

  const totalCost =
    refinements.reduce((s, r) => s + r.costUsd, 0) +
    messages
      .filter((m) => m.role === "user")
      .reduce((s, m, i) => (i >= refinements.length ? s + (m.costUsd ?? 0) : s), 0);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:p-8">
      <div className="mb-6">
        <h2 className="text-lg font-semibold tracking-tight text-ink">Refine</h2>
        <p className="mt-1 max-w-[68ch] text-sm leading-(--leading-body) text-ink-2">
          Chat to iterate on the selected draft. Each change updates the live
          draft and adds to the running cost.
        </p>
      </div>

      {!anthropicReady ? (
        <ApiNotReady />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
          {/* chat panel */}
          <div className="flex h-[32rem] flex-col rounded-xl border border-line bg-surface sm:h-[36rem]">
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.length === 0 && (
                <p className="py-6 text-center text-sm text-ink-3">
                  Ask for changes in plain language.
                </p>
              )}
              {messages.map((m, i) =>
                m.role === "user" ? (
                  <div key={i} className="ml-6 rounded-lg rounded-br-sm bg-accent-soft px-3 py-2">
                    <p className="text-sm text-accent-ink">{m.text}</p>
                    {m.costUsd != null && (
                      <p className="num mt-1 text-xs text-accent-ink/70">
                        +{fmtUsd(m.costUsd)}
                      </p>
                    )}
                  </div>
                ) : (
                  <p key={i} className="mr-6 text-xs text-ink-3">
                    {m.text}
                  </p>
                )
              )}
              {streaming && (
                <p className="mr-6 text-xs text-accent-ink" aria-live="polite">Applying change…</p>
              )}
              {error && <p className="text-sm text-danger" role="alert">{error}</p>}
            </div>

            <div className="border-t border-line p-3">
              <div className="mb-2 flex flex-wrap gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    disabled={streaming}
                    className="min-h-9 rounded-full border border-line bg-bg px-2.5 py-1 text-xs text-ink-2 hover:bg-sunken disabled:opacity-50 [@media(pointer:coarse)]:min-h-11"
                  >
                    {s}
                  </button>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send(input);
                }}
                className="flex gap-2"
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={streaming}
                  placeholder="e.g. make the second section shorter"
                  className="cs-input flex-1"
                />
                <button
                  type="submit"
                  disabled={streaming || !input.trim()}
                  className="cs-btn-primary !px-3"
                  aria-label="Send"
                >
                  <IconSpark width={16} height={16} />
                </button>
              </form>
            </div>
          </div>

          {/* live draft */}
          <div className="flex h-[32rem] flex-col rounded-xl border border-line bg-surface sm:h-[36rem]">
            <div className="flex items-center justify-between border-b border-line px-5 py-2.5">
              <span className="text-sm font-medium text-ink">Live draft</span>
              <span className="num text-xs text-ink-3">
                Refine cost: {fmtUsd(totalCost)}
              </span>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
              <Markdown>{content}</Markdown>
              {streaming && (
                <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-accent align-text-bottom" />
              )}
            </div>
            <div className="flex justify-end border-t border-line px-5 py-3">
              <button onClick={finalize} disabled={pending || streaming} className="cs-btn-primary">
                Finalize
                <IconArrowRight width={16} height={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
