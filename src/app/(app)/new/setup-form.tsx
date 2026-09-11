"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, LoaderCircle, Maximize2, Minimize2, Send, Sparkle } from "lucide-react";
import { AccentOrb } from "@/components/accent-orb";
import OrbitingCirclesGlobe from "@/components/ui/orbiting-circles-02";
import {
  createProjectAction,
  generateTopicIdeasAction,
  inferArticleSetupAction,
} from "./actions";
import { PillarDirectionPicker, pillarIcon } from "./pillar-direction-picker";
import type { TopicIdea } from "@/lib/pipeline/views";

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


  const selectedPillar = pillars.find((pillar) => pillar.id === selection.pillarId);
  const selectedDirection = selectedPillar?.directions.find((direction) => direction.id === selection.directionId);
  // The composer owns the page until the editor asks for ideas. From that point
  // the search and its results are the page, and the way back is explicit.
  const showComposer = topics.length === 0 && !generatingTopics;
  const hasInput = articleInput.trim().length > 0;
  const ideasBusy = generatingTopics || pending || !anthropicReady;

  /* THE DOCK'S HEIGHT USED TO BE MEASURED, because the composer was centred on
     the viewport and the maths needed half of it. Anchored to the foot instead,
     nothing downstream depends on the number — so the ResizeObserver, the state
     it fed and the custom property it wrote all went with it. */

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
      /* 12 on a phone, like every other page. This one was still on 16, which
         is 8px of the headline's measure spent on gutters wider than the ones
         the rest of the app settled on. */
      /* A COLUMN THE HEIGHT OF THE SCREEN, so the composer can sit at the foot
         of it without anybody having to compute where the foot is. The old
         layout centred the dock on `50svh` and hung the headline off its top
         edge, which is why the dock's height had to be measured: half of it
         was a term in the offset. Flex does the same arithmetic without being
         told the number. */
      className="mx-auto flex min-h-[calc(100svh-3rem)] w-full max-w-7xl flex-col px-3 pb-6 sm:px-6 sm:pb-20 lg:min-h-svh lg:px-12 lg:pb-24 xl:px-16"
      /* The composer and the search stage fill the screen exactly, so on a
         phone the page is locked in its frame while either is up (see the
         rule in globals.css). The list of ideas is taller than the screen by
         design, and the lock lifts the moment it arrives. */
      data-fits-viewport={topics.length === 0 ? "" : undefined}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
        {showComposer && (
        /* TWO ARRANGEMENTS OF THE SAME TWO THINGS. On a phone the dock goes to
           the foot, where a thumb is, and the welcome keeps the space above it.
           On a desktop there is no thumb and no bottom edge worth reaching for,
           and a field pinned to the floor of a 1300px window is a long way from
           the sentence that introduces it — so the pair centres together, which
           is what this screen has always done there.

           `justify-center` and the welcome's `lg:flex-none` are the whole
           switch: below `lg` the welcome takes the slack and pushes the dock
           down; above it, it takes only its own height and the two centre as
           one group. */
        <section className="relative flex flex-1 flex-col lg:justify-center">
          {/* THE WELCOME KEEPS THE SPACE ABOVE, and is centred in whatever is
              left once the dock has taken the foot — so it holds its place on
              the screen rather than riding down with the thing it used to hang
              off. `pb` keeps it from settling onto the dock when the field
              grows and the space above shrinks. */}
          <div className="flex flex-1 items-center justify-center pb-10 sm:pb-14 lg:flex-none">
          <div className="w-full text-center">
            {!anthropicReady && (
              <div className="mb-6 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3.5 text-left text-sm text-ink-2">
                <strong>No Anthropic API key is configured.</strong> Article generation will be unavailable until <code>ANTHROPIC_API_KEY</code> is configured.
              </div>
            )}
            {/* One line, one colour. The supporting sentence moved into the
                field's own placeholder, where it explains the input at the
                moment the editor is looking at the input. */}
            {/* WIDER THAN THE COLUMN'S DEFAULT MEASURE. A headline is not body
                text — it is read in one glance rather than line by line — and
                at 2xl this one broke across two lines on a phone with room to
                spare on both sides of it. */}
            <h1 className="mx-auto max-w-3xl font-heading text-[length:var(--text-h1)] font-medium leading-[1.1] tracking-[-0.02em] text-ink motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-200 sm:text-balance sm:text-[length:var(--text-hero)]">
              {/* BROKEN WHERE THE SENTENCE BREAKS, on a phone. `text-balance`
                  was evening the two lines by width and landing on "What
                  should the / industry read next?" — which splits the subject
                  from its verb and puts the emphasis on "industry" rather than
                  on what is being asked. It was never a width problem: at this
                  size "What should the industry" is 249px in a 351px column.

                  So the break is stated, and balance is left to `sm` and up
                  where the line does not need one — above `sm` the whole
                  question fits on a single line and the `br` is not rendered. */}
              What should the industry{" "}
              <br className="sm:hidden" />
              read next?
            </h1>
          </div>
          </div>

          {/* AT THE FOOT. `shrink-0` so the dock keeps its own height while the
              block above gives up whatever the column needs. */}
          <div className="relative shrink-0">
          {/* Sibling, not child: as a child it would paint over the dock's own
              white background instead of sitting behind it. */}
          <div aria-hidden className="cs-dock-glow" />

          <div className="cs-dock">
            <label className="sr-only" htmlFor="article-input">Topic or article brief</label>
            <div className="cs-dock-input-viewport">
            <textarea
              ref={inputRef}
              id="article-input"
              name="articleInput"
              /* Matches the CSS floor, so the first paint and every paint
                 after it agree — `rows` sets the intrinsic height before the
                 `input` handler has ever run. */
              rows={2}
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
              placeholder="Describe a topic, or paste a full brief…"
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
                className="absolute right-3 top-3 grid size-10 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
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
                  /* A DISC UNTIL THERE IS SOMETHING TO SAY. "Auto direction"
                     is the absence of a choice, and printing the absence took
                     a third of the dock's control row to tell the reader that
                     nothing had happened — beside a placeholder that is
                     already telling them what to do. As a disc it is the
                     affordance without the announcement; the moment a
                     direction is picked, the control becomes a pill and says
                     which, because now there IS something to say.

                     Both states are 40 tall, so choosing a direction does not
                     change the height of the row the dock's actions sit on. */
                  className={`inline-flex items-center rounded-full text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${
                    selectedDirection
                      ? "min-h-10 max-w-[55%] gap-2 px-3"
                      : "size-10 justify-center"
                  } ${
                    /* FILLED, LIKE EVERY OTHER DISC IN THE APP. Transparent, it
                       was a control you had to already know was there — a bare
                       icon on the dock's white ground with nothing to say where
                       its edges are, which matters more now that the default
                       state has no label to give it a shape. The close discs'
                       grey, on the same white it sits on there. */
                    pickerOpen
                      ? "bg-chrome-active text-ink"
                      : `bg-chrome hover:bg-chrome-active hover:text-ink ${selectedDirection ? "text-ink" : "text-ink-2"}`
                  }`}
                >
                  {selectedPillar ? (() => {
                    const Icon = pillarIcon(selectedPillar.slug);
                    return <Icon aria-hidden className="size-4 shrink-0" strokeWidth={1.8} />;
                  })() : (
                    /* ONE STAR, AND FILLED. `Sparkles` was three shapes at
                       three sizes in a 16px space, which renders as a smudge
                       rather than as a mark. The singular is the same idea
                       drawn once — and solid rather than outlined, because a
                       four-pointed outline at 16px is mostly the hole in the
                       middle: the stroke has to describe eight edges around a
                       shape too small to hold them, and what survives is a
                       blur. Filled, it is one silhouette at any size.

                       AND NO STROKE AT ALL. Filled AND stroked, a 1.5px
                       outline runs around all eight edges of a 16px star and
                       fattens its waist until the concave curves between the
                       points close up — at which point it is a plus sign. The
                       fill alone keeps those curves, which are the entire
                       difference between a star and a cross.

                       `fill` and `strokeWidth` as attributes rather than
                       classes, since lucide ships `fill="none"` and a stroke
                       width on the svg itself, and a utility would be fighting
                       an attribute. 20px, half the disc, because the taper
                       between the points is the whole shape and it needs room
                       to be seen — at 16 it is a cross with soft corners. */
                    <Sparkle aria-hidden className="size-5 shrink-0" fill="currentColor" strokeWidth={0} />
                  )}
                  {/* KEPT, NOT REMOVED, when the control is a disc: a button
                      whose only content is a decorative icon has no accessible
                      name at all. `sr-only` leaves the name for anyone not
                      reading it off the screen. */}
                  <span className={selectedDirection ? "truncate" : "sr-only"}>
                    {selectedDirection?.name ?? "Auto direction"}
                  </span>
                  {/* NO CHEVRON. It only ever appeared in the selected state,
                      where the pill is already the odd shape out in the dock
                      and the name inside it is plainly a value rather than a
                      label — nothing else here needs an arrow to say it can be
                      pressed. In the default state there was never room for
                      one, so it was marking the state that needed it least. */}
                </button>
              </PillarDirectionPicker>
              {/* ONE ACTION AT A TIME, and the field decides which. Both used to
                  sit here at once, the inapplicable one greyed and held at full
                  strength so it would not look broken — a lot of machinery to
                  keep a control on screen that could not be pressed. With
                  nothing written, the only thing to do is ask for ideas; the
                  moment there is a topic, the only thing to do is send it. */}
              <div className="flex shrink-0 items-center gap-2">
                {!hasInput ? (
                <button
                  type="button"
                  onClick={() => void generateTopics()}
                  disabled={ideasBusy}
                  // Markup Wash, not the saturated fill: a middle weight that
                  // gives the orb a ground to sit on, so the two read as one
                  // object. The outline is tinted one ramp step past its own
                  // fill, the way the neutral buttons sit one step past white —
                  // a grey hairline around an orange wash reads as dirt, not as
                  // a rule. Hover is gated on `enabled:` because a disabled
                  // button still matches :hover in CSS.
                  // It is the only control here when it shows, so it always
                  // carries its label — the responsive swap that traded words
                  // for room existed because a submit sat beside it.
                  /* FILLED, NOT TINTED. It was the accent at its palest with
                     an outline holding it together — which is what a secondary
                     action looks like, and this is the only thing on the dock
                     you are being invited to press. On the accent proper it
                     needs no border to state its edge, and the label and the
                     orb go white with it. */
                  className="cs-btn cs-dock-btn cs-dock-btn--wide shrink-0 border-transparent bg-accent text-white enabled:hover:border-transparent enabled:hover:bg-accent-hover"
                  aria-label="Generate ideas"
                  title="Generate ideas"
                >
                  <AccentOrb tone="on-accent" />
                  <span className="whitespace-nowrap pl-2">Generate</span>
                </button>
                ) : (
                <button
                  type="submit"
                  disabled={pending}
                  className="cs-dock-btn-icon cs-btn-primary shrink-0"
                  aria-label={pending ? "Creating article" : "Continue to draft"}
                  title={pending ? undefined : "Continue to draft"}
                >
                  {pending
                    ? <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
                    : <Send aria-hidden className="size-4" />}
                </button>
                )}
              </div>
            </div>
          </div>

          {/* IT BELONGS TO THE DOCK, so it lives with the dock. After the
              section it sat wherever the section ended — which on a phone is
              directly under the dock and looks right, and on a desktop is the
              bottom of a 1300px column while the dock is centred 500px above
              it. A caption explaining a control has to be beside the control.

              LONGER LINE FIRST. It breaks after "Generate ideas" rather than
              after the question: a short line over a long one reads as a
              heading somebody forgot to style, where a long line over a short
              one reads as a sentence ending. */}
          {!hasInput && (
            <p className="mt-6 shrink-0 text-center text-sm leading-relaxed text-ink-3 sm:text-balance">
              No idea yet? Generate ideas{" "}
              <br className="sm:hidden" />
              searches the design press.
            </p>
          )}
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
                <p className="font-heading text-[length:var(--text-h2)] font-medium leading-tight tracking-tight text-ink">
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
                <h2 className="max-w-2xl text-balance font-heading text-[length:var(--text-h1)] font-medium leading-[1.1] tracking-[-0.02em] text-ink sm:text-[length:var(--text-hero)]">
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
                          <p className={`max-w-2xl text-balance font-heading font-medium leading-tight tracking-tight text-ink ${lead ? "text-[length:var(--text-h2)]" : "text-[length:var(--text-h3)]"}`}>
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

          {error && (
            <p className="mt-4 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">{error}</p>
          )}
          </div>
      </div>
    </form>
  );
}
