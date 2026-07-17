"use client";

import { useState } from "react";

/**
 * Comma/Enter-separated tag entry. Serializes to a hidden input as JSON so it
 * works inside a plain server-action <form>.
 */
export function TagInput({
  name,
  defaultValue = [],
  placeholder,
}: {
  name: string;
  defaultValue?: string[];
  placeholder?: string;
}) {
  const [tags, setTags] = useState<string[]>(defaultValue);
  const [draft, setDraft] = useState("");

  function commit(raw: string) {
    const value = raw.trim().replace(/,$/, "").trim();
    if (value && !tags.includes(value)) setTags([...tags, value]);
    setDraft("");
  }

  return (
    <div className="rounded-[--radius] border border-line-strong bg-surface px-2 py-1.5 focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--accent-soft)]">
      <input type="hidden" name={name} value={JSON.stringify(tags)} />
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-md bg-accent-soft px-2 py-0.5 text-sm text-accent-ink"
          >
            {tag}
            <button
              type="button"
              onClick={() => setTags(tags.filter((t) => t !== tag))}
              className="text-accent-ink/60 hover:text-accent-ink"
              aria-label={`Remove ${tag}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => {
            const v = e.target.value;
            if (v.endsWith(",")) commit(v);
            else setDraft(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit(draft);
            } else if (e.key === "Backspace" && !draft && tags.length) {
              setTags(tags.slice(0, -1));
            }
          }}
          onBlur={() => draft && commit(draft)}
          placeholder={tags.length === 0 ? placeholder : ""}
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 text-sm text-ink outline-none placeholder:text-ink-3"
        />
      </div>
    </div>
  );
}

/** Toggle-chip multi-select backed by a hidden JSON input. */
export function ChipSelect({
  name,
  options,
  defaultValue = [],
}: {
  name: string;
  options: string[];
  defaultValue?: string[];
}) {
  const [selected, setSelected] = useState<string[]>(defaultValue);
  return (
    <div className="flex flex-wrap gap-1.5">
      <input type="hidden" name={name} value={JSON.stringify(selected)} />
      {options.map((opt) => {
        const on = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() =>
              setSelected(
                on ? selected.filter((s) => s !== opt) : [...selected, opt]
              )
            }
            className={`rounded-full border px-3 py-1 text-sm capitalize transition-colors ${
              on
                ? "border-accent bg-accent-soft font-medium text-accent-ink"
                : "border-line-strong bg-surface text-ink-2 hover:bg-sunken"
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}
