import "server-only";
import { createHash } from "node:crypto";
import type { ReferenceOrigin } from "@/db/schema";
import { imageSize } from "./dimensions";

/**
 * Finding reference images instead of waiting for someone to upload one.
 *
 * Generated covers read as generic because the model is given words and
 * nothing else — no material, no real surface, no actual specimen of the thing
 * the article is about. A reference image is the cheapest correction to that,
 * and this app already knows where to look: every article stores the sources
 * its research was built from, so "an image related to this article" is a list
 * the database is already holding.
 *
 * Two channels, and they are not interchangeable:
 *
 * `article_source` takes the lead image of a page the article cites. It is the
 * most closely related material available and it carries NO licence — it is
 * the publisher's own photograph. Nothing here clears it for use; the row
 * records where it came from so a person can decide, and `license` stays null
 * to say plainly that nobody has.
 *
 * `open_license` searches Openverse, which aggregates CC-licensed and public
 * domain work and states the licence per result. Those rows carry their
 * licence and attribution.
 *
 * Neither channel publishes anything by itself. What it produces is an input
 * to a generation the editor still runs, from a set they can see and delete
 * from.
 */

export type ReferenceCandidate = {
  data: Buffer;
  mimeType: string;
  ext: "png" | "jpg";
  width: number;
  height: number;
  originalName: string;
  origin: ReferenceOrigin;
  sourceUrl: string;
  sourceName: string;
  license: string | null;
  attribution: string | null;
};

/** 4 MB — larger than the 2 MB upload cap, because nobody chose these by hand. */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/**
 * Below this on the short edge it is furniture, not a photograph: a logo, an
 * avatar, a social icon, a tracking pixel. Every one of those makes the
 * generation worse, and og:image tags point at them more often than you would
 * hope.
 */
const MIN_EDGE_PX = 320;

/*
 * Timeouts sized against the 60s `maxDuration` the pipeline page gives every
 * action on it. Pages and images are fetched in parallel, so the ceiling is
 * roughly one page fetch plus one download, not the sum of them.
 */
const PAGE_TIMEOUT_MS = 8_000;
const IMAGE_TIMEOUT_MS = 10_000;
const SEARCH_TIMEOUT_MS = 8_000;

const USER_AGENT =
  "Mozilla/5.0 (compatible; DesignallyContentStudio/1.0; +https://designally.co)";

const ALLOWED_TYPES: Record<string, "png" | "jpg"> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "png",
};

/**
 * Reject anything that is not a public https address.
 *
 * These URLs come from a model's research output and from a third-party search
 * API — neither is a trusted source of hostnames, and the fetch runs on the
 * server with whatever network position the server has. Literal private
 * addresses and loopback names are refused outright. This does not resolve DNS,
 * so it is not a complete SSRF defence; it is the cheap half that catches the
 * obvious cases, and it is paired with a hard cap on what is read back.
 */
function isPublicHttpsUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;

  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return null;
  if (host === "metadata.google.internal" || host.endsWith(".internal")) return null;

  // IPv4 literals in private, loopback, link-local or unspecified ranges.
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 0 || a === 10 || a === 127) return null;
    if (a === 169 && b === 254) return null;
    if (a === 172 && b >= 16 && b <= 31) return null;
    if (a === 192 && b === 168) return null;
    if (a === 100 && b >= 64 && b <= 127) return null;
  }
  // IPv6 literals: loopback, unique-local and link-local.
  if (host.startsWith("[")) {
    const inner = host.slice(1, -1);
    if (inner === "::1" || inner === "::") return null;
    if (/^f[cd]/.test(inner) || /^fe80/.test(inner)) return null;
  }
  return url;
}

/** Download one image, refusing anything that is not a usable photograph. */
async function downloadImage(rawUrl: string): Promise<{
  data: Buffer;
  mimeType: string;
  ext: "png" | "jpg";
  width: number;
  height: number;
} | null> {
  const url = isPublicHttpsUrl(rawUrl);
  if (!url) return null;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "image/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;

  // The declared type first — it is free, and it rejects an HTML error page
  // served with a 200 before any bytes are read.
  const declared = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const ext = ALLOWED_TYPES[declared];
  if (!ext) return null;
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_IMAGE_BYTES) return null;

  const data = Buffer.from(await response.arrayBuffer());
  // Checked again after reading: content-length is a claim, not a guarantee.
  if (data.length === 0 || data.length > MAX_IMAGE_BYTES) return null;

  // The bytes must actually be an image this app can read, whatever the header
  // said. This is also what filters out an SVG or a GIF wearing another type.
  const size = imageSize(data);
  if (!size) return null;
  if (Math.min(size.width, size.height) < MIN_EDGE_PX) return null;

  return { data, mimeType: declared === "image/jpg" ? "image/jpeg" : declared, ext, ...size };
}

/** Decode the handful of entities that appear inside a meta tag's content. */
function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** Read one `<meta>` value by property or name, in either attribute order. */
function metaContent(html: string, key: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*?content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*?(?:property|name)=["']${key}["']`, "i"),
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match?.[1]) return decodeEntities(match[1].trim());
  }
  return null;
}

/**
 * The lead image a page declares for itself.
 *
 * Open Graph first, then Twitter's equivalent. Deliberately nothing else: the
 * first `<img>` in the document is usually a logo or a sprite, and a page that
 * declares no social image is a page with no lead image worth taking.
 */
export async function leadImageFromPage(
  pageUrl: string,
  fallbackName: string
): Promise<ReferenceCandidate | null> {
  const page = isPublicHttpsUrl(pageUrl);
  if (!page) return null;

  let html: string;
  try {
    const response = await fetch(page, {
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const type = (response.headers.get("content-type") ?? "").toLowerCase();
    if (!type.includes("html")) return null;
    html = (await response.text()).slice(0, 400_000);
  } catch {
    return null;
  }

  const declared =
    metaContent(html, "og:image:secure_url") ??
    metaContent(html, "og:image") ??
    metaContent(html, "twitter:image") ??
    metaContent(html, "twitter:image:src");
  if (!declared) return null;

  // og:image is allowed to be relative, and often is.
  const absolute = (() => {
    try {
      return new URL(declared, page).toString();
    } catch {
      return null;
    }
  })();
  if (!absolute) return null;

  const image = await downloadImage(absolute);
  if (!image) return null;

  const siteName = metaContent(html, "og:site_name") ?? page.hostname.replace(/^www\./, "");
  return {
    ...image,
    originalName: `${siteName}${image.ext === "png" ? ".png" : ".jpg"}`.slice(0, 180),
    origin: "article_source",
    // The page, not the image file: this is what a person opens to check.
    sourceUrl: page.toString(),
    sourceName: (fallbackName || siteName).slice(0, 180),
    // Deliberately null. Nobody has cleared a publisher's own photograph, and
    // recording a licence here would be inventing one.
    license: null,
    attribution: null,
  };
}

type OpenverseResult = {
  title?: string;
  url?: string;
  creator?: string;
  license?: string;
  license_version?: string;
  foreign_landing_url?: string;
  attribution?: string;
};

/**
 * Openly licensed images matching a query, from Openverse.
 *
 * Openverse is the choice here because it needs no API key — this app already
 * asks for two, and a third to fetch a reference image would be a poor trade —
 * and because it states a licence per result, which is the whole reason this
 * channel exists. The filter asks for work that is cleared for commercial use
 * and for modification, since a reference image feeds a derivative work.
 *
 * Anonymous requests are rate limited. A refusal returns nothing rather than
 * failing the run: this is one of two channels, and the other may still have
 * found something.
 */
export async function openLicenseImages(
  query: string,
  limit: number
): Promise<ReferenceCandidate[]> {
  const terms = query.trim().slice(0, 120);
  if (!terms || limit <= 0) return [];

  const endpoint = new URL("https://api.openverse.org/v1/images/");
  endpoint.searchParams.set("q", terms);
  endpoint.searchParams.set("license_type", "commercial,modification");
  endpoint.searchParams.set("page_size", String(Math.min(limit * 3, 20)));

  let results: OpenverseResult[];
  try {
    const response = await fetch(endpoint, {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as { results?: OpenverseResult[] };
    results = Array.isArray(payload?.results) ? payload.results : [];
  } catch {
    return [];
  }

  const candidates: ReferenceCandidate[] = [];
  // Sequential on purpose: stop as soon as `limit` usable images are in hand
  // rather than downloading twenty to keep three.
  for (const result of results) {
    if (candidates.length >= limit) break;
    if (!result.url) continue;
    const image = await downloadImage(result.url);
    if (!image) continue;

    const license = result.license
      ? `${result.license.toUpperCase()}${result.license_version ? ` ${result.license_version}` : ""}`
      : null;
    const creator = result.creator?.slice(0, 180) ?? "";
    candidates.push({
      ...image,
      originalName: `${(result.title ?? "openverse").slice(0, 100)}${image.ext === "png" ? ".png" : ".jpg"}`,
      origin: "open_license",
      sourceUrl: result.foreign_landing_url ?? result.url,
      sourceName: creator || "Openverse",
      license,
      attribution:
        result.attribution?.slice(0, 500) ??
        (license ? `${result.title ?? "Untitled"} by ${creator || "unknown"} (${license})` : null),
    });
  }
  return candidates;
}

/**
 * Both channels, in parallel, capped at `limit` in total.
 *
 * The article's own sources lead. They are the material actually related to
 * the piece, and an open-licence result is a generic stand-in by comparison —
 * so the open-licence search only fills what the sources could not.
 */
export async function findReferenceCandidates(params: {
  sources: { name: string; url: string }[];
  query: string;
  limit: number;
  useArticleSources: boolean;
  useOpenLicense: boolean;
}): Promise<ReferenceCandidate[]> {
  const { limit } = params;
  if (limit <= 0) return [];

  const fromSources = params.useArticleSources
    ? (
        await Promise.all(
          // More pages than slots: most will have no usable lead image.
          params.sources.slice(0, limit * 2).map((source) => leadImageFromPage(source.url, source.name))
        )
      ).filter((candidate): candidate is ReferenceCandidate => candidate !== null)
    : [];

  const kept = dedupe(fromSources).slice(0, limit);
  if (kept.length >= limit || !params.useOpenLicense) return kept;

  const filler = await openLicenseImages(params.query, limit - kept.length);
  return dedupe([...kept, ...filler]).slice(0, limit);
}

/**
 * One image per source page, and never the same bytes twice.
 *
 * Syndicated articles share a lead image, and a set holding the same picture
 * three times spends three of the model's reference slots saying one thing.
 */
function dedupe(candidates: ReferenceCandidate[]): ReferenceCandidate[] {
  const seenBytes = new Set<string>();
  const seenSources = new Set<string>();
  const out: ReferenceCandidate[] = [];
  for (const candidate of candidates) {
    // A hash of the actual bytes, not a size-and-dimensions fingerprint. The
    // cheap version collapsed two different photographs that happened to share
    // a byte length and a shape — which is exactly what a set of images from
    // one CMS, all resized by the same pipeline, tends to look like.
    const fingerprint = createHash("sha256").update(candidate.data).digest("hex");
    if (seenBytes.has(fingerprint) || seenSources.has(candidate.sourceUrl)) continue;
    seenBytes.add(fingerprint);
    seenSources.add(candidate.sourceUrl);
    out.push(candidate);
  }
  return out;
}
