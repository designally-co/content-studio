"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import gsap from "gsap";

import { MOTION, duration } from "@/lib/motion";

/**
 * The one movement a route change gets.
 *
 * NO TRANSFORM. NOT A PREFERENCE — A CONSTRAINT. The obvious route transition
 * is a small rise with the fade, and it cannot be done here: a transform on an
 * ancestor makes that ancestor the containing block for every `position: fixed`
 * descendant, and eleven of them live inside these pages — the page bars, the
 * stage action buttons, the bottom sheets, the docks. They would all jump to a
 * new origin for the length of the tween and jump back when it cleared. Opacity
 * creates a stacking context but not a containing block, so it is the one
 * property that can animate a whole route without moving anything inside it.
 *
 * IT FADES UP FROM HALF, NOT FROM NOTHING. Next replaces the tree the moment
 * the new route is ready, so there is no old page still on screen to cross-fade
 * with — starting at zero would blank the content area for a beat and read as a
 * page failing to load rather than as a page arriving. From 0.5 the new screen
 * is legible in the first frame and simply settles.
 *
 * NOT ON FIRST PAINT. The first render is a page load, not a navigation, and
 * fading the whole app in on arrival makes a fast load feel slower than it is.
 */
function Motion({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const params = useSearchParams();

  /* WHAT COUNTS AS A DIFFERENT SCREEN. The path, plus the pipeline's stage —
     moving from Draft to Image is a navigation in every sense that matters,
     and it happens in the query string.

     Deliberately NOT every query change: Library writes `?q=` on each
     keystroke while somebody types in the search field, and animating the page
     on every letter would be unusable. A filter is not a destination. */
  const stage = pathname.startsWith("/pipeline/")
    ? `${params.get("stage") ?? ""}:${params.get("view") ?? ""}`
    : "";
  const route = `${pathname}|${stage}`;

  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const previous = useRef<string | null>(null);

  useEffect(() => {
    if (!node) return;
    const isFirst = previous.current === null;
    previous.current = route;
    if (isFirst) return;

    const tween = gsap.fromTo(
      node,
      { opacity: 0.5 },
      {
        opacity: 1,
        duration: duration(MOTION.CONTENT),
        ease: MOTION.EASE_ENTER,
        // Nothing left behind: an inline opacity on the route's container
        // outliving the tween would sit in front of anything the page later
        // wants to do with its own.
        clearProps: "opacity",
      },
    );
    return () => {
      tween.kill();
    };
  }, [route, node]);

  return <div ref={setNode}>{children}</div>;
}

/**
 * `useSearchParams` suspends, and a boundary here keeps that from reaching the
 * whole shell. The fallback renders the same children unanimated, so a route
 * still arrives even in the frame before this is ready.
 */
export function RouteMotion({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div>{children}</div>}>
      <Motion>{children}</Motion>
    </Suspense>
  );
}
