"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

/** Creating an article is the home surface, not a step of this article's
 *  pipeline — there is nothing here to return to. The research-and-outline
 *  pause (stages 2–3) folds into Draft & edit, since it is automatic and brief.
 */
const STAGES = [
  { n: 1, label: "Draft & edit", target: 4 },
  { n: 2, label: "Generate images", target: 6 },
  { n: 3, label: "Publish", target: 6 },
];

function visibleStage(stage: number, finalizeView?: "images" | "complete") {
  if (stage <= 5) return 1;
  if (finalizeView === "complete") return 3;
  if (finalizeView === "images") return 2;
  // Reaching stage 6 unlocks both the Images (2) and Publish (3) views.
  return 3;
}

export function Stepper({
  projectId,
  current,
  reached,
  finalizeView,
}: {
  projectId: string;
  /** the stage currently being viewed */
  current: number;
  /** the furthest stage reached (upper bound for navigation) */
  reached: number;
  /* `published` used to live here, to put a green tick on Publish. The Publish
     stage says so itself, in words, on the panel you are looking at when it
     matters — the stepper does not need to say it a second time in a colour. */
  finalizeView?: "images" | "complete";
}) {
  const currentVisible = visibleStage(current, finalizeView);
  const reachedVisible = visibleStage(reached);

  const scroller = useRef<HTMLElement>(null);
  const activeItem = useRef<HTMLLIElement>(null);

  /* THE CURRENT STEP SITS IN THE MIDDLE OF THE SCREEN, whatever step it is.
     Centring the whole list is a layout decision and it stops helping the
     moment the steps overflow: the row then begins at "Draft & edit" whichever
     stage you are on, so a phone at Publish opens showing two steps you have
     finished and not the one you are looking at.

     HALF A SCREEN OF PADDING AT EACH END IS WHAT MAKES IT POSSIBLE. Scrolling
     stops at the end of the content, so without it the last step can only ever
     reach the right edge — measured at 375px, "Publish" ran out of scroll 128px
     short of the middle. Padding gives the row somewhere to keep going, and the
     finished steps run off to the left as they should.

     The padding is applied here rather than in a class because it must not
     exist when everything fits: it would force a scroll onto a row that had no
     need of one, and turn the centred list into an off-centre one. So the
     natural width is measured first, with any previous padding cleared. */
  useEffect(() => {
    const centre = () => {
      const nav = scroller.current;
      const item = activeItem.current;
      const list = nav?.firstElementChild;
      if (!nav || !item || !(list instanceof HTMLElement)) return;

      list.style.paddingInline = "";
      if (nav.scrollWidth <= nav.clientWidth) {
        nav.scrollLeft = 0;
        return;
      }
      list.style.paddingInline = `${nav.clientWidth / 2}px`;

      const navBox = nav.getBoundingClientRect();
      const itemBox = item.getBoundingClientRect();
      // Relative, so it is correct wherever the item's offset parent happens to
      // be, and however far the row is already scrolled.
      nav.scrollLeft += itemBox.left - navBox.left - (nav.clientWidth - itemBox.width) / 2;
    };
    centre();
    // Rotating a phone can turn three steps that fitted into three that do not.
    window.addEventListener("resize", centre);
    return () => window.removeEventListener("resize", centre);
  }, [currentVisible]);

  return (
    /* ONE MARK FOR THE CURRENT STEP, NOT FIVE. This began with a coloured disc
       per step — orange for the current one, green with a tick for the done
       ones, two greys for the rest — a filled pill, and a connector that turned
       green as you advanced: five colours and three shapes to say which of
       three words you are on. All of it came out.

       What came back is the pill alone, in grey. Position and weight carry the
       rest: the steps read left to right, so what is behind you is behind you,
       and the ones you cannot reach yet are quieter still. No green, which was
       the only place in the product using it as chrome, and no tick — the
       Publish stage says it is published, in words, on the panel you are
       looking at when it matters. */
    /* CENTRED, AND IT SURVIVES OVERFLOW. `justify-center` on the scrolling
       element itself is the obvious way and the broken one: once the steps are
       wider than the phone, centring pushes the first one off the left edge
       into a region the scroll cannot reach. A `w-fit` list with auto margins
       centres while there is room and collapses those margins to nothing when
       there is not, so a narrow screen scrolls from the beginning. */
    /* EDGE TO EDGE, BY UNDOING THE PAGE GUTTER AND PAYING IT BACK AS PADDING.
       The bar this sits in is inset by 20px, so a step scrolling away stopped
       and vanished 20px in from the screen — an arbitrary line with nothing
       drawn on it, which reads as clipping rather than as more to come. The
       negative margin gives the scroll the whole width; the matching padding
       puts the steps back on the page's own left edge when they are at rest.
       Only below `lg`, where the row can actually overflow: pulling a full-bleed
       element out of a centred container on a wide screen risks giving the page
       a horizontal scroll of its own, for no gain.

       NO SCROLLBAR. Nothing here is aimed at with a pointer — the row moves by
       swipe, or it does not move at all because everything fits — and a bar
       under three words is a horizontal rule the design never asked for. Hiding
       it does not stop it scrolling. */
    <nav
      ref={scroller}
      aria-label="Content pipeline"
      /* FADED AT THE LEFT, because on a phone the menu button sits over that
         end of the row and a step scrolling past it was being sliced mid-word
         by an opaque block — "…mages", which reads as a typo rather than as
         something that carries on off-screen. The mask hands the same job to a
         gradient. Off above `lg`, where there is no button and nothing to hide
         behind. */
      className="-mx-5 overflow-x-auto px-5 [mask-image:linear-gradient(to_right,transparent_0,#000_76px)] [scrollbar-width:none] sm:-mx-8 sm:px-8 lg:mx-0 lg:px-0 lg:[mask-image:none] [&::-webkit-scrollbar]:hidden"
    >
      <ol className="mx-auto flex w-fit items-center gap-1">
        {STAGES.map((s, i) => {
          const active = s.n === currentVisible;
          const navigable = s.n <= reachedVisible;
          /* SMALL, DELIBERATELY. A 44px thumb target was the reflex and the
             wrong call here: this is a progress indicator that happens to be
             navigable, sitting above the work in a bar that follows you down
             the page, and at thumb size it competed with the article for the
             top of the screen. The three steps are far apart and rarely
             pressed — 32px is enough to hit and quiet enough to ignore. */
          /* THE PILL IS BACK, IN GREY. Weight alone turned out to be too little
             on a phone: the row scrolls, so there is no full set of steps beside
             it, and "this one is bolder" cannot be read against nothing. A
             filled pill answers it without looking anywhere else.

             Grey rather than orange, which is reserved for the thing you press.
             A step you are already on is not an action.

             AND THE HOVER NOW EXISTS. It was `bg-sunken`, which is #f8f8f7 —
             the exact colour of the bar this sits on, so hovering a step you
             could navigate to did nothing at all. Three surfaces, each a step
             apart: the bar, the hover, and the one you are on. */
          const content = (
            <span
              className={`flex min-h-8 items-center whitespace-nowrap rounded-full px-3 text-sm transition-colors duration-(--duration-fast) ease-(--ease-out) ${
                active
                  ? "bg-chrome-active font-medium text-ink"
                  : navigable
                    ? "text-ink-3 hover:bg-chrome-hover hover:text-ink"
                    : "text-ink-3 opacity-60"
              }`}
            >
              {s.label}
            </span>
          );
          return (
            <li key={s.n} ref={active ? activeItem : undefined} className="flex items-center">
              {navigable && !active ? (
                <Link
                  href={`/pipeline/${projectId}?stage=${s.target}${s.n === 2 ? "&view=images" : s.n === 3 ? "&view=complete" : ""}`}
                  /* `block`, so the anchor is the size of the padded span
                     inside it. An inline anchor gives the browser a line box to
                     hit-test instead, which is shorter than what is drawn. */
                  className="block rounded-full focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]"
                >
                  {content}
                </Link>
              ) : (
                <span aria-current={active ? "step" : undefined}>{content}</span>
              )}
              {/* THE STRONGER RULE, NOT THE HAIRLINE. --border is drawn for a
                  plate sitting on white, where it has a whole card's edge to
                  register along; as a 16px stub between two words it was faint
                  enough to read as a rendering artefact. This connects the
                  steps, so it has to be visible enough to be seen doing it. */}
              {i < STAGES.length - 1 && (
                <span aria-hidden className="mx-1 h-px w-5 shrink-0 bg-line-strong sm:w-6" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
