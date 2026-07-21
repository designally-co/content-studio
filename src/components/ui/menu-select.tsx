"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type MenuOption = { value: string; label: string; description?: string };

/**
 * Custom dropdown styled to match the category picker on the create-article
 * page: a `cs-select` trigger opening a bordered popover listbox with an
 * `bg-accent-soft` selection highlight. The in-dropdown search box is optional
 * and only rendered when `searchable` is set.
 */
export function MenuSelect({
  options,
  value,
  onChange,
  placeholder = "Select…",
  searchable = false,
  allowClear = false,
  id,
  ariaLabel,
  className = "",
  align = "start",
}: {
  options: MenuOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchable?: boolean;
  allowClear?: boolean;
  id?: string;
  ariaLabel?: string;
  className?: string;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () => (q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options),
    [options, q]
  );

  const selected = options.find((o) => o.value === value);
  const label = selected?.label ?? placeholder;

  function pick(next: string) {
    onChange(next);
    setOpen(false);
    setQuery("");
    triggerRef.current?.focus();
  }

  function onTriggerKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    } else if (e.key === "ArrowDown" && open) {
      e.preventDefault();
      wrapRef.current?.querySelector<HTMLButtonElement>("[role=option]")?.focus();
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={triggerRef}
        id={id}
        type="button"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onTriggerKeyDown}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className={`cs-select flex items-center justify-between text-left ${className || "w-full"}`}
      >
        <span className={`truncate ${selected ? "text-ink" : "text-ink-3"}`}>{label}</span>
        <span className="ml-2 shrink-0 text-ink-3">▾</span>
      </button>

      {open && (
        <div
          className={`absolute z-20 mt-1 min-w-full overflow-hidden rounded-lg border border-line bg-surface shadow-lg ${
            align === "end" ? "right-0" : "left-0"
          }`}
        >
          {searchable && (
            <div className="border-b border-line p-2">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                aria-label="Search options"
                className="cs-input !py-1.5 text-sm"
              />
            </div>
          )}
          <ul role="listbox" aria-label={ariaLabel} className="max-h-60 overflow-y-auto py-1 text-sm">
            {allowClear && (
              <li>
                <Row selected={!selected} onClick={() => pick("")}>
                  {placeholder}
                </Row>
              </li>
            )}
            {matches.map((o) => (
              <li key={o.value}>
                <Row selected={o.value === value} onClick={() => pick(o.value)}>
                  <span className="flex-1">
                    {o.label}
                    {o.description && (
                      <span className="mt-0.5 block text-xs font-normal text-ink-3">{o.description}</span>
                    )}
                  </span>
                </Row>
              </li>
            ))}
            {!matches.length && (
              <li className="px-3 py-2 text-xs text-ink-3">No matches.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function Row({
  children,
  onClick,
  selected,
}: {
  children: React.ReactNode;
  onClick: () => void;
  selected?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="option"
      aria-selected={selected ?? false}
      onKeyDown={(event) => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        event.preventDefault();
        const options = Array.from(
          event.currentTarget.closest("[role=listbox]")?.querySelectorAll<HTMLButtonElement>("[role=option]") ?? []
        );
        const index = options.indexOf(event.currentTarget);
        const next = event.key === "ArrowDown" ? index + 1 : index - 1;
        options[(next + options.length) % options.length]?.focus();
      }}
      className={`flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-sunken ${
        selected ? "bg-accent-soft text-accent-ink" : "text-ink"
      }`}
    >
      {children}
    </button>
  );
}
