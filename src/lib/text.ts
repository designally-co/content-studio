/**
 * Length metrics that handle Thai (no spaces between words). For Thai-heavy
 * text we report characters; otherwise words. §6.3.
 */
export function countMetrics(md: string): {
  words: number;
  chars: number;
  isThai: boolean;
  label: string;
} {
  const plain = stripMarkdown(md);
  const chars = [...plain.replace(/\s/g, "")].length;
  const thaiChars = (plain.match(/[฀-๿]/g) ?? []).length;
  const isThai = thaiChars > chars * 0.3;

  const words = plain.split(/\s+/).filter(Boolean).length;

  if (isThai) {
    return { words, chars, isThai, label: `${chars.toLocaleString()} characters` };
  }
  return { words, chars, isThai, label: `${words.toLocaleString()} words` };
}

/**
 * Remove em dashes (and other "AI-tell" dashes) from generated prose, replacing
 * them with punctuation that reads as human-written. Em dash / horizontal bar
 * become a comma; a spaced en dash becomes a comma; a line-leading dash (quote
 * attribution) is dropped. ASCII hyphens and numeric en-dash ranges (e.g.
 * 2020–2024) are left untouched so Markdown tables, rules, and ranges survive.
 * A last-resort net: the model is also instructed not to produce these.
 */
export function deDash(md: string): string {
  return md
    // line-leading em/en dash used for attribution → drop the dash, keep any
    // blockquote/list marker (and its trailing space)
    .replace(/(^|\n)([>*+-][ \t]+)?[ \t]*[—―–][ \t]+/g, "$1$2")
    // em dash / horizontal bar anywhere else → comma
    .replace(/\s*[—―]\s*/g, ", ")
    // spaced en dash used as punctuation (numeric ranges like 2020–2024 stay) → comma
    .replace(/\s+–\s+/g, ", ")
    // tidy the punctuation the swap can create
    .replace(/ +,/g, ",") // no space before a comma
    .replace(/,\s*,/g, ", ") // collapse accidental double commas
    .replace(/,(\s*[.!?;:])/g, "$1"); // comma absorbed by following terminal punctuation
}

function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
