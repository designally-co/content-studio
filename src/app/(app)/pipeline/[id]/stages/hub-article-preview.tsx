"use client";

import type { CSSProperties } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { stripTitleHeading } from "@/lib/markdown";

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
          <div className="hubprev__body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
          </div>
        ) : (
          <p className="hubprev__empty">The article body will appear here.</p>
        )}
      </div>
    </div>
  );
}

/* Mirrors the Hub's article.css — kept inline so the preview is self-contained. */
const HUBPREV_CSS = `
.hubprev {
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
  --hp-gutter: clamp(20px, 5vw, 44px);
  --hpr: 1.6;
  background: var(--hp-paper);
  color: var(--hp-ink);
  font-family: var(--hp-sans);
  overflow: hidden;
  border-radius: 15px;
  padding-inline: var(--hp-gutter);
}

/* HERO — solid tan band, full-bleed to the card edges. Its bottom padding is
   HALF the cover height (50% / ratio of the body width) plus a breathing gap, so
   its edge lands exactly at the cover's midline. */
.hubprev__masthead {
  position: relative;
  isolation: isolate;
  margin-inline: calc(-1 * var(--hp-gutter));
  padding: clamp(28px, 5vw, 48px) var(--hp-gutter)
    calc(50% / var(--hpr) + clamp(24px, 4vw, 36px));
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
  font-size: clamp(30px, 4.4vw, 44px);
  line-height: 1.1;
  letter-spacing: -0.005em;
  color: var(--hp-ink);
  margin: 0;
  text-wrap: balance;
}
.hubprev__dek {
  font-family: var(--hp-sans);
  font-weight: 500;
  font-size: clamp(18px, 2.2vw, 23px);
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
  margin: clamp(18px, 3vw, 24px) 0 0;
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
  padding-bottom: clamp(28px, 5vw, 44px);
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
.hubprev__body {
  margin-top: clamp(22px, 4vw, 34px);
}
.hubprev__empty {
  margin-top: clamp(22px, 4vw, 34px);
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
  font: 700 clamp(23px, 3vw, 28px)/1.2 var(--hp-sans);
  letter-spacing: -0.01em;
  color: var(--hp-ink);
  margin: clamp(32px, 5vw, 44px) 0 14px;
  text-wrap: balance;
}
.hubprev__body h3 {
  font: 700 clamp(18px, 2.2vw, 21px)/1.28 var(--hp-sans);
  color: var(--hp-ink);
  margin: clamp(26px, 4vw, 30px) 0 10px;
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
  margin: clamp(28px, 5vw, 36px) 0;
  padding: clamp(20px, 4vw, 28px) 0;
  border-top: 1px solid var(--hp-hair);
  border-bottom: 1px solid var(--hp-hair);
  font: 400 clamp(22px, 4vw, 32px)/1.1 var(--hp-serif);
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
