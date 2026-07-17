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
