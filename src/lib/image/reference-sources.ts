import "server-only";
import { createHash } from "node:crypto";
import type { ReferenceOrigin } from "@/db/schema";
import { imageSize } from "./dimensions";

/**
 * Finding the photograph the generated image is matched against.
 *
 * A cover made from words alone reads as synthetic: the model was given a
 * description and never a surface. The correction is a real photograph of the
 * situation the article describes — a designer at a desk, a typographer at a
 * press — which the finished image is then made to resemble in kind.
 *
 * Unsplash is where those come from, because it is a library of photographs of
 * people doing things and its licence permits commercial use and modification.
 * Openverse is the fallback where no Unsplash key is set: no key required, but
 * it leans towards archive and museum material and rarely has a picture of
 * somebody working.
 *
 * Nothing here publishes anything. It attaches material to the article that the
 * editor can see, remove, and then generate from.
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
 * action on it: one search, then a download per photograph kept.
 */
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

type UnsplashResult = {
  urls?: { regular?: string; full?: string };
  alt_description?: string | null;
  description?: string | null;
  links?: { html?: string };
  user?: { name?: string; username?: string };
};

/**
 * Photographs of a situation, from Unsplash.
 *
 * This is the channel a grounded image is actually built on. The other two find
 * pictures ABOUT a topic — a source article's lead image is as often a logo or
 * a banner as a photograph, and Openverse leans towards archive and museum
 * material. Neither reliably answers "a designer working at a desk", which is
 * the kind of picture a grounded cover has to be matched against.
 *
 * The Unsplash License permits commercial use and modification without
 * permission, which is what makes it safe to generate from. Attribution is not
 * legally required by that licence but is asked for, and Unsplash's API terms
 * do require crediting the photographer — so it is recorded on the row like any
 * other licence, and travels with the image.
 *
 * Needs UNSPLASH_ACCESS_KEY. Without one this returns nothing and the caller
 * falls back to Openverse, which needs no key but finds fewer usable scenes.
 */
export async function unsplashImages(query: string, limit: number): Promise<ReferenceCandidate[]> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  const terms = query.trim().slice(0, 120);
  if (!key || !terms || limit <= 0) return [];

  const endpoint = new URL("https://api.unsplash.com/search/photos");
  endpoint.searchParams.set("query", terms);
  endpoint.searchParams.set("per_page", String(Math.min(limit * 3, 15)));
  // Landscape: these become article covers, and a portrait reference pushes the
  // generated frame the wrong way.
  endpoint.searchParams.set("orientation", "landscape");
  endpoint.searchParams.set("content_filter", "high");

  let results: UnsplashResult[];
  try {
    const response = await fetch(endpoint, {
      headers: {
        authorization: `Client-ID ${key}`,
        "accept-version": "v1",
        "user-agent": USER_AGENT,
      },
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as { results?: UnsplashResult[] };
    results = Array.isArray(payload?.results) ? payload.results : [];
  } catch {
    return [];
  }

  const candidates: ReferenceCandidate[] = [];
  for (const result of results) {
    if (candidates.length >= limit) break;
    // `regular` is ~1080px wide — plenty for a reference, and a fraction of
    // `full`, which would spend the byte cap for nothing.
    const source = result.urls?.regular ?? result.urls?.full;
    if (!source) continue;
    const image = await downloadImage(source);
    if (!image) continue;

    const photographer = result.user?.name?.slice(0, 180) ?? "";
    const title = (result.alt_description ?? result.description ?? terms).slice(0, 100);
    candidates.push({
      ...image,
      originalName: `${title}${image.ext === "png" ? ".png" : ".jpg"}`,
      origin: "open_license",
      sourceUrl: result.links?.html ?? source,
      sourceName: photographer || "Unsplash",
      license: "Unsplash License",
      attribution: `Photo by ${photographer || "an Unsplash photographer"} on Unsplash`,
    });
  }
  return candidates;
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
 * Photographs of the scene: Unsplash, with Openverse where no key is set.
 *
 * There used to be a third channel that took the lead image of each page the
 * article cites. It is gone, and its removal is the point: a publisher's
 * `og:image` is as often a logo, a banner or a screenshot as a photograph, so
 * it answered "a picture about this topic" when the only question that matters
 * here is "a photograph of this situation". It also carried no licence, which
 * meant a badge, a warning line, a provenance column and a decision for the
 * editor — all of it in service of material that was usually unusable.
 */
export async function findReferenceCandidates(params: {
  query: string;
  limit: number;
}): Promise<ReferenceCandidate[]> {
  const { limit } = params;
  if (limit <= 0) return [];

  const unsplash = await unsplashImages(params.query, limit);
  const kept = dedupe(unsplash).slice(0, limit);
  if (kept.length >= limit) return kept;

  const openverse = await openLicenseImages(params.query, limit - kept.length);
  return dedupe([...kept, ...openverse]).slice(0, limit);
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
