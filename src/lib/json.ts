/**
 * Defensive JSON extraction for model output. Strips code fences and pulls the
 * first balanced JSON value out of surrounding prose. Returns null on failure
 * so callers can retry once (per spec §6.1).
 */
export function extractJson<T = unknown>(text: string): T | null {
  if (!text) return null;
  let s = text.trim();

  // strip ```json ... ``` fences
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();

  // fast path
  try {
    return JSON.parse(s) as T;
  } catch {
    // fall through to bracket scan
  }

  const start = s.search(/[[{]/);
  if (start === -1) return null;
  const open = s[start];
  const close = open === "[" ? "]" : "}";
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(s.slice(start, i + 1)) as T;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
