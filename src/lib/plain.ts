/** Convert Markdown to readable plain text for the "copy plain text" export. */
export function markdownToPlainText(md: string): string {
  let s = md;
  s = s.replace(/```[\s\S]*?```/g, (block) => block.replace(/```\w*\n?/g, ""));
  s = s.replace(/`([^`]+)`/g, "$1");
  s = s.replace(/^#{1,6}\s+/gm, "");
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, "");
  s = s.replace(/\[([^\]]*)\]\(([^)]*)\)/g, "$1 ($2)");
  s = s.replace(/\*\*([^*]+)\*\*/g, "$1");
  s = s.replace(/\*([^*]+)\*/g, "$1");
  s = s.replace(/__([^_]+)__/g, "$1");
  s = s.replace(/^\s*>\s?/gm, "");
  s = s.replace(/^\s*[-*+]\s+/gm, "• ");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}
