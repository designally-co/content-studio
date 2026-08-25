import "server-only";

/**
 * Client for the Designally Knowledge Hub. Publishes finished articles into the
 * Hub's Payload CMS via its Markdown endpoint (POST /api/articles/from-markdown),
 * which converts Markdown → Lexical server-side.
 *
 * Config is environment-only (like the Anthropic key):
 *   HUB_BASE_URL  e.g. https://hub.designally.co  (no trailing slash needed)
 *   HUB_API_KEY   a `users` API key generated in the Hub admin
 */
const HUB_URL = process.env.HUB_BASE_URL?.replace(/\/+$/, "");
const HUB_KEY = process.env.HUB_API_KEY;

export function isHubConfigured(): boolean {
  return Boolean(HUB_URL && HUB_KEY);
}

export type HubArticleInput = {
  title: string;
  // Exactly one taxonomy tag (= content direction). Still sent as an array
  // because that is the shape the Hub's endpoint takes; it rejects anything
  // other than a single entry.
  tags: string[];
  summary?: string; // dek
  bodyMarkdown: string;
  status?: "draft" | "published";
  /** Structured source list. The Hub renders it as the article's reference section. */
  references?: { label: string; url: string }[];
  coverUrl?: string;
  coverImage?: number; // id of a media doc uploaded via uploadImageToHub()
};

/**
 * Upload image bytes into the Hub's media library. Returns the new media id,
 * which becomes an article's `coverImage`. The Hub owns the file (with real
 * dimensions → correct cover aspect ratio, and responsive sizes via sharp).
 */
export async function uploadImageToHub(input: {
  data: Buffer;
  filename: string;
  mimeType: string;
  alt: string;
}): Promise<number> {
  if (!HUB_URL || !HUB_KEY) {
    throw new Error("Knowledge Hub isn't configured (set HUB_BASE_URL and HUB_API_KEY).");
  }

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(input.data)], { type: input.mimeType }), input.filename);
  form.append("_payload", JSON.stringify({ alt: input.alt }));

  const res = await fetch(`${HUB_URL}/api/media`, {
    method: "POST",
    // No Content-Type — fetch sets the multipart boundary.
    headers: { Authorization: `users API-Key ${HUB_KEY}` },
    body: form,
    cache: "no-store",
  });

  const json = (await res.json().catch(() => null)) as
    | { doc?: { id: number } }
    | { errors?: { message: string }[] }
    | null;
  if (!res.ok) {
    const message =
      (json && "errors" in json && json.errors?.[0]?.message) || `Media upload responded ${res.status}.`;
    throw new Error(message);
  }
  const id = (json as { doc?: { id: number } })?.doc?.id;
  if (typeof id !== "number") throw new Error("Media upload returned no id.");
  return id;
}

type HubResponse = { id: number | string; slug: string; url: string; status: string };

export type HubPublishResult = {
  slug: string;
  /** Public path on the Hub, e.g. /articles/my-slug */
  path: string;
  /** Absolute URL, e.g. https://hub.designally.co/articles/my-slug */
  absoluteUrl: string;
  status: string;
};

/** Create an article on the Hub from Markdown. Throws with a readable message on failure. */
export async function publishArticleToHub(input: HubArticleInput): Promise<HubPublishResult> {
  if (!HUB_URL || !HUB_KEY) {
    throw new Error("Knowledge Hub isn't configured (set HUB_BASE_URL and HUB_API_KEY).");
  }

  let res: Response;
  try {
    res = await fetch(`${HUB_URL}/api/articles/from-markdown`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `users API-Key ${HUB_KEY}`,
      },
      body: JSON.stringify({ status: "draft", ...input }),
      cache: "no-store",
    });
  } catch (cause) {
    throw new Error(
      `Couldn't reach the Knowledge Hub at ${HUB_URL}. ${cause instanceof Error ? cause.message : ""}`.trim(),
    );
  }

  const data = (await res.json().catch(() => null)) as HubResponse | { error?: string } | null;
  if (!res.ok) {
    const message =
      (data && "error" in data && data.error) || `Knowledge Hub responded ${res.status}.`;
    throw new Error(message);
  }

  const ok = data as HubResponse;
  return {
    slug: ok.slug,
    path: ok.url,
    absoluteUrl: `${HUB_URL}${ok.url}`,
    status: ok.status,
  };
}
