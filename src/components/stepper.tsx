"use client";

import Link from "next/link";

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

  return (
    /* PLAIN TEXT, IN THE APP'S OWN INK. This carried a coloured disc per step —
       orange for the current one, green with a tick for the done ones, two
       greys for the rest — a filled pill behind the current label, and a
       connector rule that turned green as you advanced. Five colours and three
       shapes to say which of three words you are on.

       Position already says most of it: the steps read left to right, so what
       is behind you is behind you. The current step takes full ink and the
       weight; everything else is quiet, and the ones you cannot reach yet are
       quieter still. No orange — that belongs to the thing you press — and no
       green, which was the only place in the product using it as chrome. */
    /* CENTRED, AND IT SURVIVES OVERFLOW. `justify-center` on the scrolling
       element itself is the obvious way and the broken one: once the steps are
       wider than the phone, centring pushes the first one off the left edge
       into a region the scroll cannot reach. A `w-fit` list with auto margins
       centres while there is room and collapses those margins to nothing when
       there is not, so a narrow screen scrolls from the beginning. */
    <nav aria-label="Content pipeline" className="overflow-x-auto">
      <ol className="mx-auto flex w-fit items-center gap-1">
        {STAGES.map((s, i) => {
          const active = s.n === currentVisible;
          const navigable = s.n <= reachedVisible;
          /* 44px, WHICH IS THE POINT. These were 36 tall and padded by 10 —
             fine for a pointer, under every platform's minimum for a thumb,
             and this is the control you use to move between stages on a phone.
             The label did not change size; the target around it did. */
          const content = (
            <span
              className={`flex min-h-11 items-center whitespace-nowrap rounded-lg px-4 text-sm transition-colors duration-(--duration-fast) ease-(--ease-out) ${
                active
                  ? "font-medium text-ink"
                  : navigable
                    ? "text-ink-3 hover:bg-sunken hover:text-ink"
                    : "text-ink-3 opacity-60"
              }`}
            >
              {s.label}
            </span>
          );
          return (
            <li key={s.n} className="flex items-center">
              {navigable && !active ? (
                <Link
                  href={`/pipeline/${projectId}?stage=${s.target}${s.n === 2 ? "&view=images" : s.n === 3 ? "&view=complete" : ""}`}
                  /* `block`, so the anchor is the size of the padded span
                     inside it. An inline anchor gives the browser a line box to
                     hit-test instead, which is shorter than what is drawn. */
                  className="block rounded-lg focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]"
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
