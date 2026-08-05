"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Monitor, Smartphone, Tablet } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { stripTitleHeading } from "@/lib/markdown";

/**
 * The widths the preview can lay out at.
 *
 * Real device widths rather than round numbers, and they do genuine work: the
 * Hub's stylesheet sizes in `cqw` against the preview's own box, so changing
 * this width re-runs every clamp and reflows the article exactly as the device
 * would. This is a layout switch, not a crop.
 */
const HUB_VIEWPORTS = [
  { id: "mobile", label: "Mobile", width: 390, Icon: Smartphone },
  { id: "tablet", label: "Tablet", width: 834, Icon: Tablet },
  { id: "desktop", label: "Desktop", width: 1240, Icon: Monitor },
] as const;

type HubViewport = (typeof HUB_VIEWPORTS)[number]["id"];

/**
 * Renders its child at a chosen device width and scales the result to fit the
 * space available.
 *
 * Laying the preview out at whatever width the rail happens to leave shows a
 * layout no reader will ever see. Rendering at a real device width and scaling
 * keeps the true proportions and the true line breaks; only the magnification
 * changes. `transform` does not affect layout, so the wrapper's height has to be
 * set from the measured content height times the scale, or the page keeps the
 * unscaled height as dead space below it.
 */
export function HubPreviewFrame({ children }: { children: ReactNode }) {
  const [viewport, setViewport] = useState<HubViewport>("desktop");
  const width = HUB_VIEWPORTS.find((option) => option.id === viewport)!.width;
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const measure = () => {
      // Never above 1: a phone-width layout blown up would be a lie about how
      // large the type is.
      const next = Math.min(1, outer.clientWidth / width);
      setScale(next);
      setHeight(inner.offsetHeight * next);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [width]);

  return (
    <div ref={outerRef} style={{ height }} className="overflow-hidden">
      {/* The stage the card actually occupies on screen: the laid-out width
          times the scale. `transform` leaves layout untouched, so without this
          box there is nothing whose edges follow the rendered card, and the
          switcher could only be pinned to the column — which is the same corner
          only when the preview happens to fill it. `mx-auto` then handles both
          cases: a phone layout centres, and a layout wider than the column has
          its auto margins collapse to zero so it stays pinned left, which is the
          origin the scale works from. */}
      <div className="relative mx-auto" style={{ width: width * scale }}>
        <div
          ref={innerRef}
          style={{ width, transform: `scale(${scale})`, transformOrigin: "top left" }}
        >
          {children}
        </div>

        {/* Floated over the card's own top corner rather than parked above it:
            it controls what is inside the frame, so it belongs on the frame.
            Outside the scaled subtree, so it stays at full size while a desktop
            layout renders at ~0.6 — chrome that shrank with the page would be
            unreadable at exactly the width you most need it.

            Icons carry it alone. Three labelled segments run to ~250px, which on
            the 390px phone card is most of the masthead; the device glyphs are
            unambiguous and the accessible name and tooltip still spell out the
            width. */}
        <div
          className="absolute right-4 top-4 z-10 inline-flex items-center gap-1 rounded-full bg-surface p-1 shadow-[var(--shadow-pop)]"
          role="group"
          aria-label="Preview width"
        >
          {HUB_VIEWPORTS.map(({ id, label, width: optionWidth, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setViewport(id)}
              aria-pressed={viewport === id}
              aria-label={label}
              title={`${label} — ${optionWidth}px`}
              className={`inline-flex size-8 items-center justify-center rounded-full transition-colors duration-(--duration-fast) ease-(--ease-spring) focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)] ${
                viewport === id ? "bg-sunken text-ink" : "text-ink-3 hover:text-ink"
              }`}
            >
              <Icon aria-hidden className="size-4" strokeWidth={1.8} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Pulls the article's section headings out of the markdown for the contents rail.
 *
 * Read off the source rather than off the DOM after render: the rail has to lay
 * out in the same pass as the prose it sits beside, and measuring rendered
 * headings would mean a second pass and a visible reflow. Fenced blocks are
 * skipped so a `#` comment inside a code sample is not mistaken for a section.
 */
function extractHeadings(markdown: string): { level: 2 | 3; text: string }[] {
  const headings: { level: 2 | 3; text: string }[] = [];
  let inFence = false;
  for (const line of markdown.split("\n")) {
    if (/^\s{0,3}(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;
    // Inline emphasis and code ticks are markup, not part of the section's name.
    const text = match[2].replace(/[*_`]/g, "").trim();
    if (text) headings.push({ level: match[1].length as 2 | 3, text });
  }
  return headings;
}

/**
 * A faithful preview of how an article will render on the Designally Knowledge
 * Hub, using the Hub's own fonts (Hanken Grotesk + Newsreader) and type/colour
 * tokens. Scoped under `.hubprev` so none of it leaks into the generator UI.
 *
 * Structure (per the desired hero treatment):
 *   - Hero (`.hubprev__masthead`) — the title block on a SOLID tan band. It
 *     reserves extra bottom space equal to HALF the cover height.
 *   - Body (`.hubprev__main`) — the cover image then the prose. The cover is
 *     pulled UP by half its own height so its top half overflows into the hero's
 *     reserved space (landing the hero's edge at the cover's midline) and its
 *     bottom half sits on the body's paper.
 *
 * "Half the cover height" is derived in pure CSS from the cover's aspect ratio
 * (`--hpr` = width / height): with the cover at the body width W, its height is
 * W / ratio, so half of it is `50% / ratio` of W — used for both the hero's
 * extra padding and the cover's negative margin so they always match exactly.
 *
 * This mirrors the Hub's `article.css`; if that template changes materially,
 * update the tokens/rules below to match.
 */
export function HubArticlePreview({
  title,
  dek,
  dekPending,
  tags,
  coverImageUrl,
  coverAspectRatio,
  bodyMarkdown,
  meta,
}: {
  title: string;
  dek: string | null;
  /** True while the dek is still being generated — shows a shimmer placeholder. */
  dekPending: boolean;
  tags: string[];
  coverImageUrl: string | null;
  /** Cover width / height (e.g. 1.777 for 16:9). Drives the 50% overflow. */
  coverAspectRatio: number;
  bodyMarkdown: string;
  /** Byline line, e.g. "6 min read". */
  meta: string;
}) {
  const body = stripTitleHeading(bodyMarkdown, title).trim();
  const headings = extractHeadings(body);

  return (
    <div
      className="hubprev"
      style={{ "--hpr": coverAspectRatio } as CSSProperties}
      aria-label="Knowledge Hub article preview"
    >
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500&family=Hanken+Grotesk:wght@400..700&display=swap"
      />
      <style>{HUBPREV_CSS}</style>

      <div className="hubprev__page">
        <div className="hubprev__masthead">
          <header className="hubprev__head">
            {tags.length > 0 && (
              <div className="hubprev__tags">
                {tags.map((t) => (
                  <span key={t} className="hubprev__tag">
                    {t}
                  </span>
                ))}
              </div>
            )}

            {/* h2, not h1: this is a preview of the Hub's page rendered inside
                ours, so it must not compete with this page's own top-level
                heading. The class keeps the Hub's type unchanged. */}
            <h2 className="hubprev__title">{title}</h2>

            {dek ? (
              <p className="hubprev__dek">{dek}</p>
            ) : dekPending ? (
              <p className="hubprev__dek hubprev__dek--pending" aria-hidden="true">
                <span className="hubprev__shimmer" style={{ width: "92%" }} />
                <span className="hubprev__shimmer" style={{ width: "64%" }} />
              </p>
            ) : null}

            {meta && (
              <div className="hubprev__byline">
                <p className="hubprev__meta">{meta}</p>
              </div>
            )}
          </header>
        </div>

        <div className="hubprev__main">
          <div className="hubprev__cover">
            {coverImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="hubprev__hero" src={coverImageUrl} alt="" decoding="async" />
            ) : (
              <div className="hubprev__hero hubprev__hero--empty" aria-hidden="true" />
            )}
          </div>

          {body ? (
            <div className="hubprev__content">
              {/* Contents sits before the prose in source order, which is both the
                  order it appears in at desktop width and the order it should be
                  read in — a table of contents that comes after the article it
                  indexes has already been passed by the time it is announced.
                  Below desktop the stylesheet takes it out of the flow entirely,
                  because at one column it would push the article down behind a
                  list nobody asked for. */}
              {headings.length > 1 && (
                <nav className="hubprev__toc" aria-labelledby="hubprev-toc-label">
                  <p className="hubprev__toc-label" id="hubprev-toc-label">
                    Contents
                  </p>
                  <ul className="hubprev__toc-list">
                    {headings.map((heading, index) => (
                      <li
                        key={`${index}-${heading.text}`}
                        className={
                          heading.level === 3
                            ? "hubprev__toc-item hubprev__toc-item--sub"
                            : "hubprev__toc-item"
                        }
                      >
                        {heading.text}
                      </li>
                    ))}
                  </ul>
                </nav>
              )}
              <div className="hubprev__body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
              </div>
            </div>
          ) : (
            <p className="hubprev__empty">The article body will appear here.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* Mirrors the Hub's article.css — kept inline so the preview is self-contained. */
const HUBPREV_CSS = `
.hubprev {
  /* The preview is its own reference frame. Every clamp below sizes in cqw, so
     the Hub's type responds to the width of this box rather than to the width
     of the browser window it happens to be sitting in. */
  container-type: inline-size;
  --hp-sans: "Hanken Grotesk", "Noto Sans Thai", ui-sans-serif, system-ui, sans-serif;
  --hp-serif: "Newsreader", Georgia, "Times New Roman", serif;
  --hp-ink: #12100d;
  --hp-ink-70: #4a453d;
  --hp-ink-50: #7c766b;
  --hp-paper: #f9f6f4;
  --hp-tan: #ece1cd;
  --hp-cover: #cfc3b0;
  --hp-hair: rgba(18, 16, 13, 0.1);
  --hp-tag-border: rgba(18, 16, 13, 0.22);
  --hp-gutter: clamp(20px, 5cqw, 44px);
  --hpr: 1.6;
  background: var(--hp-paper);
  color: var(--hp-ink);
  font-family: var(--hp-sans);
  overflow: hidden;
  border-radius: 15px;
}

/* The gutter lives on this wrapper, not on .hubprev, for two reasons that both
   come from .hubprev being the query container. A container's own size query
   never matches itself, so a rule widening the gutter at desktop could not be
   written against .hubprev at all; and the container's content box is what every
   cqw resolves against, so padding there would make each cqw depend on a value
   derived from cqw. Off the container, .hubprev measures the plain device width
   and the gutter is free to change at any breakpoint.

   Everything the hero's overflow maths depends on still holds: the masthead's
   padding-bottom and the cover's negative margin are both percentages of this
   wrapper's content box, so they stay equal whatever the gutter becomes. */
.hubprev__page {
  padding-inline: var(--hp-gutter);
}

/* HERO — solid tan band, full-bleed to the card edges. Its bottom padding is
   HALF the cover height (50% / ratio of the body width) plus a breathing gap, so
   its edge lands exactly at the cover's midline. */
.hubprev__masthead {
  position: relative;
  isolation: isolate;
  margin-inline: calc(-1 * var(--hp-gutter));
  padding: clamp(28px, 5cqw, 48px) var(--hp-gutter)
    calc(50% / var(--hpr) + clamp(24px, 4cqw, 36px));
  background: var(--hp-tan);
}
.hubprev__masthead::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  opacity: 0.2;
  background: url("/hub-hero-pattern.svg") no-repeat center / cover;
  pointer-events: none;
}

.hubprev__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 18px;
}
.hubprev__tag {
  display: inline-flex;
  align-items: center;
  padding: 5px 11px;
  font-weight: 700;
  font-size: 11.5px;
  line-height: 1;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--hp-ink);
  border: 1px solid var(--hp-tag-border);
  border-radius: 999px;
  white-space: nowrap;
}
.hubprev__title {
  font-family: var(--hp-sans);
  font-weight: 500;
  font-size: clamp(30px, 4.4cqw, 44px);
  line-height: 1.1;
  letter-spacing: -0.005em;
  color: var(--hp-ink);
  margin: 0;
  text-wrap: balance;
}
.hubprev__dek {
  font-family: var(--hp-sans);
  font-weight: 500;
  font-size: clamp(18px, 2.2cqw, 23px);
  line-height: 1.3;
  color: var(--hp-ink);
  margin: 20px 0 0;
  max-width: 60ch;
  text-wrap: pretty;
}
.hubprev__dek--pending {
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.hubprev__shimmer {
  display: block;
  height: 15px;
  border-radius: 5px;
  background: linear-gradient(90deg, rgba(18,16,13,0.06) 0%, rgba(18,16,13,0.12) 50%, rgba(18,16,13,0.06) 100%);
  background-size: 200% 100%;
  animation: hubprev-shimmer 1.4s ease-in-out infinite;
}
@keyframes hubprev-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
@media (prefers-reduced-motion: reduce) {
  .hubprev__shimmer { animation: none; }
}
.hubprev__byline {
  margin: clamp(18px, 3cqw, 24px) 0 0;
}
.hubprev__meta {
  font: 400 14px/1.4 var(--hp-sans);
  color: var(--hp-ink-50);
  margin: 0;
}

/* BODY — the cover then the prose, both at the body width. The cover is pulled
   up by half its height so it overflows into the hero above. */
/* Positioned above the hero so the overflowing cover paints ON TOP of the tan
   band (the hero is position:relative, so without this its background would
   cover the cover's top half). */
.hubprev__main {
  position: relative;
  z-index: 1;
  padding-bottom: clamp(28px, 5cqw, 44px);
}
.hubprev__cover {
  margin-top: calc(-50% / var(--hpr));
}
.hubprev__hero {
  display: block;
  width: 100%;
  aspect-ratio: var(--hpr);
  height: auto;
  object-fit: cover;
  border-radius: 0;
  background-color: var(--hp-cover);
}
.hubprev__hero--empty {
  background-color: var(--hp-cover);
}
.hubprev__content {
  margin-top: clamp(22px, 4cqw, 34px);
}
/* CONTENTS RAIL — desktop only. Hidden by default rather than revealed by a
   max-width query, so any width the Hub adds later starts from the one-column
   layout that always works. The query is on the container, not the viewport:
   the preview switches device widths by resizing its own box, so a viewport
   query would report the studio window and show the rail at every size. */
.hubprev__toc {
  display: none;
}
@container (min-width: 1000px) {
  /* A desktop page does not run its measure to the window edges. At 1240 this
     lands the article on a ~990px column — wide enough for the contents rail
     and a proper prose measure beside it, which is what the body's
     max-width:none has been standing in for. */
  .hubprev__page {
    --hp-gutter: clamp(56px, 10cqw, 132px);
  }
  /* The tan band grows with its own width, or a gutter this wide leaves the
     title sitting on a thin strip of colour. */
  .hubprev__masthead {
    padding-top: clamp(48px, 5.5cqw, 76px);
  }
  .hubprev__content {
    display: grid;
    /* The prose column takes minmax(0, 1fr) rather than 1fr: grid items floor at
       min-content, and one long unbroken word in the body would otherwise push
       the column wider than the card. */
    grid-template-columns: 232px minmax(0, 1fr);
    gap: clamp(40px, 5cqw, 64px);
    align-items: start;
  }
  .hubprev__toc {
    display: block;
    padding-top: 6px;
    border-top: 1px solid var(--hp-hair);
  }
}
.hubprev__toc-label {
  margin: 0 0 12px;
  font: 700 11px/1.2 var(--hp-sans);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--hp-ink-50);
}
.hubprev__toc-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.hubprev__toc-item {
  font: 500 14px/1.4 var(--hp-sans);
  color: var(--hp-ink-70);
  margin-bottom: 10px;
  text-wrap: pretty;
}
.hubprev__toc-item--sub {
  padding-left: 14px;
  font-weight: 400;
  color: var(--hp-ink-50);
}
.hubprev__empty {
  margin-top: clamp(22px, 4cqw, 34px);
  font: 400 16px/1.5 var(--hp-sans);
  color: var(--hp-ink-50);
}
.hubprev__body :is(h2, h3, p, ul, ol, blockquote) {
  max-width: none;
}
.hubprev__body p {
  font: 400 18px/1.55 var(--hp-sans);
  color: var(--hp-ink-70);
  margin: 0 0 22px;
  text-wrap: pretty;
}
.hubprev__body > :first-child { margin-top: 0; }
.hubprev__body > p:first-of-type { color: var(--hp-ink); }
.hubprev__body h2 {
  font: 700 clamp(23px, 3cqw, 28px)/1.2 var(--hp-sans);
  letter-spacing: -0.01em;
  color: var(--hp-ink);
  margin: clamp(32px, 5cqw, 44px) 0 14px;
  text-wrap: balance;
}
.hubprev__body h3 {
  font: 700 clamp(18px, 2.2cqw, 21px)/1.28 var(--hp-sans);
  color: var(--hp-ink);
  margin: clamp(26px, 4cqw, 30px) 0 10px;
}
.hubprev__body ul,
.hubprev__body ol {
  font: 400 18px/1.55 var(--hp-sans);
  color: var(--hp-ink-70);
  margin: 0 0 22px;
  padding-left: 1.4em;
}
.hubprev__body li { margin-bottom: 7px; text-wrap: pretty; }
.hubprev__body a {
  color: var(--hp-ink);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.hubprev__body strong { font-weight: 700; color: var(--hp-ink); }
.hubprev__body blockquote {
  margin: clamp(28px, 5cqw, 36px) 0;
  padding: clamp(20px, 4cqw, 28px) 0;
  border-top: 1px solid var(--hp-hair);
  border-bottom: 1px solid var(--hp-hair);
  font: 400 clamp(22px, 4cqw, 32px)/1.1 var(--hp-serif);
  color: var(--hp-ink);
  text-wrap: balance;
}
.hubprev__body img { max-width: 100%; height: auto; border-radius: 0; }
.hubprev__body code {
  font-family: ui-monospace, "SF Mono", monospace;
  font-size: 0.9em;
  background: rgba(18, 16, 13, 0.05);
  padding: 0.1em 0.35em;
  border-radius: 4px;
}
`;
