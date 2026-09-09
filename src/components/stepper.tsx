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
    /* NO SCROLLBAR. Nothing here is aimed at with a pointer — the row moves by
       swipe, or it does not move at all because everything fits — and a bar
       under three words is a horizontal rule the design never asked for. Hiding
       it does not stop it scrolling. */
    <nav
      ref={scroller}
      aria-label="Content pipeline"
      className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <ol className="mx-auto flex w-fit items-center gap-1">
        {STAGES.map((s, i) => {
          const active = s.n === currentVisible;
          const navigable = s.n <= reachedVisible;
          /* 44px, WHICH IS THE POINT. These were 36 tall and padded by 10 —
             fine for a pointer, under every platform's minimum for a thumb,
             and this is the control you use to move between stages on a phone.
             The label did not change size; the target around it did. */
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
              className={`flex min-h-11 items-center whitespace-nowrap rounded-full px-4 text-sm transition-colors duration-(--duration-fast) ease-(--ease-out) ${
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
              {/* A hairline, the same one every divider in the product uses. */}
              {i < STAGES.length - 1 && (
                <span aria-hidden className="mx-1 h-px w-4 shrink-0 bg-line sm:w-5" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
