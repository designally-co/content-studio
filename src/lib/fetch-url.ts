import "server-only";

/**
 * Fetch a URL and extract readable text. Used to summarize a competitor
 * article as reference — the app fetches and summarizes, never copies.
 */
export async function fetchReadableText(url: string): Promise<string> {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    throw new Error("That doesn't look like a valid URL.");
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new Error("Only http(s) URLs are supported.");
  }

  const res = await fetch(target, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (compatible; DesignallyContentStudio/1.0; +https://designally.co)",
      accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new Error(`Could not fetch the URL (HTTP ${res.status}).`);
  }
  const html = await res.text();
  return htmlToText(html).slice(0, 12000);
}

function htmlToText(html: string): string {
  let s = html;
  // drop non-content elements
  s = s.replace(/<script[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  s = s.replace(/<(nav|footer|header|aside)[\s\S]*?<\/\1>/gi, " ");
  // block elements → newlines
  s = s.replace(/<\/(p|div|h[1-6]|li|section|article|br)>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  // decode a few common entities
  s = s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  s = s.replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n");
  return s.trim();
}
