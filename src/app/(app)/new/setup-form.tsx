"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronDown, LoaderCircle, Maximize2, Minimize2, Send, Sparkles } from "lucide-react";
import { AccentOrb } from "@/components/accent-orb";
import OrbitingCirclesGlobe from "@/components/ui/orbiting-circles-02";
import {
  createProjectAction,
  generateTopicIdeasAction,
  inferArticleSetupAction,
  type TopicIdea,
} from "./actions";
import { PillarDirectionPicker, pillarIcon } from "./pillar-direction-picker";

export type PillarGroup = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  directions: { id: string; name: string }[];
};

type Selection = { pillarId: string; directionId: string };

export function SetupForm({ pillars, anthropicReady }: { pillars: PillarGroup[]; anthropicReady: boolean }) {
  const [pending, setPending] = useState(false);
  const [articleInput, setArticleInput] = useState("");
  const [inputExpanded, setInputExpanded] = useState(false);
  const [inputNeedsExpansion, setInputNeedsExpansion] = useState(false);
  const [selection, setSelection] = useState<Selection>({ pillarId: "", directionId: "" });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [topics, setTopics] = useState<TopicIdea[]>([]);
  const [generatingTopics, setGeneratingTopics] = useState(false);
  const [searchSlow, setSearchSlow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const [dockHeight, setDockHeight] = useState(145);

  const selectedPillar = pillars.find((pillar) => pillar.id === selection.pillarId);
  const selectedDirection = selectedPillar?.directions.find((direction) => direction.id === selection.directionId);
  // The composer owns the page until the editor asks for ideas. From that point
  // the search and its results are the page, and the way back is explicit.
  const showComposer = topics.length === 0 && !generatingTopics;
  const hasInput = articleInput.trim().length > 0;
  const ideasBusy = generatingTopics || pending || !anthropicReady;

  // Re-observes when the composer comes back, since the node it was watching is
  // gone once the results take the page.
  useEffect(() => {
    const dock = dockRef.current;
    if (!dock) return;
    const observer = new ResizeObserver(([entry]) => setDockHeight(entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height));
    observer.observe(dock);
    return () => observer.disconnect();
  }, [showComposer]);

  // Live web search makes this call slow enough that a second, honest message
  // is worth more than a spinner that says nothing after the first few seconds.
  useEffect(() => {
    if (!generatingTopics) return;
    const timer = setTimeout(() => setSearchSlow(true), 15000);
    return () => clearTimeout(timer);
  }, [generatingTopics]);

  async function generateTopics() {
    setGeneratingTopics(true);
    setSearchSlow(false);
    setError(null);
    try {
      const result = await generateTopicIdeasAction({
        categoryId: selection.directionId || undefined,
        language: "en",
      });
      if (result.length === 0) throw new Error("No topic ideas were returned. Try again or choose a direction.");
      setTopics(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not generate topic ideas.");
    } finally {
      setGeneratingTopics(false);
    }
  }

  async function submitArticle(topic?: TopicIdea) {
    const text = topic?.title ?? articleInput.trim();
    if (!text || pending) return;
    setPending(true);
    setError(null);

    try {
      const setup = topic
        ? {
            inputKind: "topic" as const,
            directionId: topic.directionId,
            directionName: topic.directionName,
            workingTitle: topic.title,
          }
        : await inferArticleSetupAction({ text, categoryId: selection.directionId || undefined });

      const data = new FormData();
      data.set("articleMode", "editorial");
      data.set("language", "en");
      data.set("articleInput", topic ? "" : text);
      data.set("inputKind", setup.inputKind);
      data.set("workingTitle", setup.workingTitle);
      data.set("categoryId", setup.directionId);
      if (topic) {
        data.set("chosenTopic", topic.title);
        data.set("chosenAngle", topic.angle || "");
        data.set("chosenWhyTimely", topic.whyTimely || "");
        data.set("chosenSearchIntent", topic.searchIntent || "");
        data.set("chosenResearchSources", JSON.stringify(topic.researchSources || []));
      }
      await createProjectAction(data);
    } catch (reason) {
      setPending(false);
      setPickerOpen(true);
      setError(reason instanceof Error ? reason.message : "Could not create the article. Choose a direction and try again.");
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submitArticle();
      }}
      className="mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6 sm:pb-20 lg:px-12 lg:pb-24 xl:px-16"
    >
      <div className="mx-auto max-w-3xl">
        {showComposer && (
        <section
          className="relative h-[calc(50svh-2rem+var(--dock-half))] lg:h-[calc(50svh+var(--dock-half))]"
          style={{ "--dock-half": `${dockHeight / 2}px` } as React.CSSProperties}
        >
          <div className="absolute left-0 right-0 top-[calc(50svh-2rem)] -translate-y-1/2 lg:top-[50svh]">
          <div className="absolute bottom-full left-0 right-0 mb-12 text-center sm:mb-14">
            {!anthropicReady && (
              <div className="mb-6 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3.5 text-left text-sm text-ink-2">
                <strong>No Anthropic API key is configured.</strong> Article generation will be unavailable until <code>ANTHROPIC_API_KEY</code> is configured.
              </div>
            )}
            {/* One line, one colour. The supporting sentence moved into the
                field's own placeholder, where it explains the input at the
                moment the editor is looking at the input. */}
            <h1 className="mx-auto max-w-2xl text-balance font-heading text-[length:var(--text-h1)] font-bold leading-[1.1] tracking-[-0.02em] text-ink motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-200 sm:text-[length:var(--text-hero)]">
              What should the industry read next?
            </h1>
          </div>

          {/* Sibling, not child: as a child it would paint over the dock's own
              white background instead of sitting behind it. */}
          <div aria-hidden className="cs-dock-glow" />

          <div ref={dockRef} className="cs-dock">
            <label className="sr-only" htmlFor="article-input">Topic or article brief</label>
            <div className="cs-dock-input-viewport">
            <textarea
              ref={inputRef}
              id="article-input"
              name="articleInput"
              rows={3}
              value={articleInput}
              onChange={(event) => setArticleInput(event.target.value)}
              onInput={(event) => {
                const field = event.currentTarget;
                field.style.height = "auto";
                const needsExpansion = field.scrollHeight > 320;
                setInputNeedsExpansion(needsExpansion);
                if (!needsExpansion && inputExpanded) setInputExpanded(false);
                field.style.height = `${inputExpanded ? field.scrollHeight : Math.min(field.scrollHeight, 320)}px`;
              }}
              className={`cs-dock-input ${inputNeedsExpansion ? "cs-dock-input--scrollable pr-12" : ""} ${inputExpanded ? "max-h-none" : ""}`}
              placeholder="Describe a topic, or paste a full brief — either works…"
            />
            </div>
            {inputNeedsExpansion && (
              <button
                type="button"
                onClick={() => {
                  const nextExpanded = !inputExpanded;
                  setInputExpanded(nextExpanded);
                  requestAnimationFrame(() => {
                    const field = inputRef.current;
                    if (!field) return;
                    field.style.height = "auto";
                    field.style.height = `${nextExpanded ? field.scrollHeight : Math.min(field.scrollHeight, 320)}px`;
                    field.focus();
                  });
                }}
                className="absolute right-3 top-3 grid size-9 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                aria-label={inputExpanded ? "Collapse article input" : "Expand article input"}
                aria-controls="article-input"
              >
                {inputExpanded ? <Minimize2 aria-hidden className="size-4" /> : <Maximize2 aria-hidden className="size-4" />}
              </button>
            )}
            <div className="cs-dock-controls">
              <PillarDirectionPicker
                pillars={pillars}
                selection={selection}
                open={pickerOpen}
                onOpenChange={setPickerOpen}
                onChange={(next) => {
                  setSelection(next);
                  setTopics([]);
                }}
              >
                <button
                  type="button"
                  // A chosen direction is a setting, not an achievement: it reads
                  // as full ink against the muted default, the way a select shows
                  // a value against its placeholder. No accent, no fill, no rule
                  // — which also puts its icon back on the field's 16px gutter.
                  className={`inline-flex min-h-9 max-w-[55%] items-center gap-2 rounded-full px-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${
                    pickerOpen
                      ? "bg-sunken text-ink"
                      : `bg-transparent hover:bg-sunken hover:text-ink ${selectedDirection ? "text-ink" : "text-ink-2"}`
                  }`}
                >
                  {selectedPillar ? (() => {
                    const Icon = pillarIcon(selectedPillar.slug);
                    return <Icon aria-hidden className="size-4 shrink-0" strokeWidth={1.8} />;
                  })() : <Sparkles aria-hidden className="size-4 shrink-0" strokeWidth={1.8} />}
                  <span className="truncate">{selectedDirection?.name ?? "Auto direction"}</span>
                  <ChevronDown aria-hidden className={`size-3.5 shrink-0 transition-transform ${pickerOpen ? "rotate-180" : ""}`} />
                </button>
              </PillarDirectionPicker>
              {/* At rest both actions sit at the same weight — two outlines, no
                  fill — so neither pulls ahead. Writing something makes submit
                  the live action, and it takes the fill at that moment.
                  `disabled:opacity-100` holds it level with generate until then,
                  rather than letting the global disabled fade weaken it. */}
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => void generateTopics()}
                  // Writing something takes the ideas path off the table, so the
                  // control goes properly unavailable rather than merely quiet.
                  disabled={ideasBusy || hasInput}
                  // Markup Wash, not the saturated fill: a middle weight that
                  // gives the orb a ground to sit on, so the two read as one
                  // object. The outline is tinted one ramp step past its own
                  // fill, the way the neutral buttons sit one step past white —
                  // a grey hairline around an orange wash reads as dirt, not as
                  // a rule. Hover is gated on `enabled:` because a disabled
                  // button still matches :hover in CSS.
                  // On a narrow screen the two actions trade the label rather
                  // than both shrinking: at rest this is the only live control
                  // and submit is not rendered, so it earns the words.
                  className={`cs-btn cs-dock-btn shrink-0 border-[var(--orange-200)] bg-accent-soft text-accent-press enabled:hover:border-[var(--orange-300)] enabled:hover:bg-[var(--orange-200)] ${
                    hasInput ? "" : "cs-dock-btn--wide"
                  }`}
                  aria-label="Generate ideas"
                  title="Generate ideas"
                >
                  {/* Always running — the button's disabled state, not the orb,
                      is what reports that the ideas path is off the table. */}
                  <AccentOrb />
                  <span className="cs-swap cs-swap--sm-open" data-show={!hasInput}>
                    {/* The 8px sits inside the clipped track, so it collapses
                        with the label instead of holding the orb off centre. */}
                    <span className="whitespace-nowrap pl-2">Generate</span>
                  </span>
                </button>
                {/* Below sm there is no room for a labelled generate and a
                    submit at once, and an inert submit is the one worth
                    dropping — nothing can be sent yet. It widens away rather
                    than disappearing; its own margin collapses with it. */}
                <button
                  type="submit"
                  data-hidden={!hasInput}
                  disabled={!hasInput || pending}
                  // The full-strength-while-disabled utility is scoped to sm and
                  // up. Unscoped it also fought the hidden state below sm —
                  // utilities outrank @layer components — and held a collapsed
                  // button visible as a hairline.
                  className={`cs-dock-btn-icon shrink-0 ${
                    hasInput ? "cs-btn-primary disabled:opacity-100" : "cs-btn sm:disabled:opacity-100"
                  }`}
                  aria-label={pending ? "Creating article" : "Continue to draft"}
                  title={pending ? undefined : "Continue to draft"}
                >
                  {pending
                    ? <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
                    : <Send aria-hidden className="size-4" />}
                </button>
              </div>
            </div>
          </div>
          </div>
        </section>
        )}

          {/* The search stage centres against the viewport, so it takes no top
              offset and cancels the form's bottom padding — otherwise that
              padding counts as content and pushes the stage upward. The results
              list still needs a top offset now that the composer is gone. */}
          <div className={showComposer ? "mt-6" : generatingTopics ? "-mb-16 sm:-mb-20 lg:-mb-24" : "pt-8 sm:pt-10"}>
          <div aria-live="polite">
          {generatingTopics ? (
            /* The globe orbits the very publications this call is searching, so
               it reports the work rather than decorating the wait. The text
               carries it for anyone on reduced motion, where it sits still.

               No card. The globe is a horizon composition — its sphere is
               centred on its own bottom edge, so the lower half is clipped, and
               a card was only ever there to give that clip an edge to land on.
               A mask dissolves the cut instead, which frees the stage to sit on
               the canvas and centre itself the way the composer it replaced did. */
            <div className="flex min-h-[calc(100svh-4rem)] flex-col items-center justify-center text-center motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200 lg:min-h-svh">
              <div className="px-6">
                <p className="font-heading text-[length:var(--text-h2)] font-bold leading-tight tracking-tight text-ink">
                  Searching creative-industry sources…
                </p>
                <p className="mx-auto mt-2.5 min-h-6 max-w-md text-balance leading-relaxed text-ink-2">
                  {searchSlow ? "Still searching — this can take up to a minute." : "Reading what has actually happened recently."}
                </p>
              </div>
              <div className="mt-10 w-full [mask-image:linear-gradient(to_bottom,#000_72%,transparent_100%)]">
                <OrbitingCirclesGlobe />
              </div>
            </div>
          ) : topics.length > 0 ? (
            <div>
              {/* The composer is gone at this point, so the only routes onward
                  live here: a different set of ideas, or back to writing your
                  own. Without these the results are a dead end. */}
              <header className="mb-8 sm:mb-10">
                <h2 className="max-w-2xl text-balance font-heading text-[length:var(--text-h1)] font-bold leading-[1.1] tracking-[-0.02em] text-ink sm:text-[length:var(--text-hero)]">
                  Pick the one worth writing.
                </h2>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-ink-2">
                    {topics.length} ideas across {new Set(topics.map((topic) => topic.directionName)).size} directions.
                  </p>
                  <div className="flex shrink-0 items-center gap-2">
                    <button type="button" onClick={() => void generateTopics()} disabled={ideasBusy} className="cs-btn !h-9 text-sm">
                      Regenerate
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTopics([]);
                        setError(null);
                      }}
                      disabled={pending}
                      className="cs-btn !h-9 text-sm"
                    >
                      Start over
                    </button>
                  </div>
                </div>
              </header>

              {/* One control per idea: the row is the target, so the eight
                  repeated "Select topic" buttons go. `Recommended` sits below
                  the title rather than above it — a label above a heading is a
                  kicker, and the title has to lead. */}
              <ul className="border-t border-line">
                {topics.map((topic, index) => {
                  const lead = index === 0;
                  const meta = [
                    lead ? "Recommended" : null,
                    topic.directionName,
                    topic.researchSources?.map((source) => source.name).join(", ") || null,
                  ].filter(Boolean);
                  return (
                    <li key={`${topic.title}-${index}`} className="border-b border-line">
                      <button
                        type="button"
                        onClick={() => void submitArticle(topic)}
                        disabled={pending}
                        style={{ animationDelay: `${Math.min(index, 7) * 45}ms` }}
                        // The fill is pulled wider than the content it wraps and
                        // given a radius, so hover reads as a highlight behind
                        // the row rather than a slab cut to the rules. The
                        // negative margin keeps titles on the same left edge as
                        // the heading above; only the fill overhangs.
                        className="group -mx-3 flex w-[calc(100%+1.5rem)] items-start gap-5 rounded-xl px-3 py-6 text-left transition-colors duration-(--duration-fast) ease-(--ease-out) hover:bg-surface focus-visible:bg-surface focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:fill-mode-both motion-safe:duration-300 sm:-mx-4 sm:w-[calc(100%+2rem)] sm:px-4 sm:py-7"
                      >
                        <div className="min-w-0 flex-1">
                          <p className={`max-w-2xl text-balance font-heading font-bold leading-tight tracking-tight text-ink ${lead ? "text-[length:var(--text-h2)]" : "text-[length:var(--text-h3)]"}`}>
                            {topic.title}
                          </p>
                          {topic.angle && (
                            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-2">{topic.angle}</p>
                          )}
                          {/* The lead entry makes the full case; the rest give
                              just enough to judge. whyTimely now opens with the
                              date the development actually happened. */}
                          {lead && topic.whyTimely && (
                            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-2">{topic.whyTimely}</p>
                          )}
                          {meta.length > 0 && (
                            <p className="mt-3 text-xs font-semibold text-ink-3">
                              {meta.map((part, partIndex) => (
                                <span key={part as string}>
                                  {partIndex > 0 && <span aria-hidden className="px-1.5 text-line-strong">/</span>}
                                  <span className={partIndex === 0 && lead ? "text-accent-ink" : undefined}>{part}</span>
                                </span>
                              ))}
                            </p>
                          )}
                        </div>
                        <ArrowRight
                          aria-hidden
                          className="mt-1 size-5 shrink-0 text-ink-3 transition-transform duration-(--duration-base) ease-(--ease-out) group-hover:translate-x-1 group-hover:text-accent-press"
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
          </div>

          {!generatingTopics && topics.length === 0 && !hasInput && (
            <p className="text-center text-sm leading-relaxed text-ink-3">
              No idea yet? Generate ideas searches the design press across your pillars and directions.
            </p>
          )}

          {error && (
            <p className="mt-4 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">{error}</p>
          )}
          </div>
      </div>
    </form>
  );
}
