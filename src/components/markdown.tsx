"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Markdown({ children }: { children: string }) {
  const language = /[\u0E00-\u0E7F]/.test(children) ? "th" : "en";
  return (
    <div className="prose-draft" lang={language}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
