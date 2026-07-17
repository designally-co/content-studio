"use client";

import { useState } from "react";
import { IconCopy, IconCheck } from "./icons";

export function CopyButton({
  text,
  label = "Copy",
  className = "cs-btn",
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for insecure contexts
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button type="button" onClick={copy} className={className}>
      {copied ? <IconCheck width={16} height={16} /> : <IconCopy width={16} height={16} />}
      {copied ? "Copied" : label}
    </button>
  );
}
