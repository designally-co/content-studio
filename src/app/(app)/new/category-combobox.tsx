"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { IconArrowRight } from "@/components/icons";

type Cat = { id: string; name: string };

export type CategorySelection =
  | { kind: "existing"; id: string; name: string }
  | { kind: "new"; name: string };

/**
 * Searchable category picker with add-on-the-go. Emits two hidden fields:
 *  - categoryId:  an existing id, "suggest", or "" (when adding a new one)
 *  - newCategory: the name to create, or "" (when picking existing / suggest)
 * A newly added category is persisted server-side so it's reusable next time.
 */
export function CategoryCombobox({ categories, onSelectionChange }: { categories: Cat[]; onSelectionChange?: (selection: CategorySelection) => void }) {
  const [selection, setSelection] = useState<CategorySelection>(
    categories[0] ? { kind: "existing", id: categories[0].id, name: categories[0].name } : { kind: "new", name: "Creative resources" }
  );
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
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
    () => (q ? categories.filter((c) => c.name.toLowerCase().includes(q)) : categories),
    [categories, q]
  );
  const exact = categories.some((c) => c.name.toLowerCase() === q);
  const canCreate = q.length > 0 && !exact;

  const label = selection.kind === "new"
        ? `${selection.name} (new)`
        : selection.name;

  const categoryIdValue = selection.kind === "existing" ? selection.id : "";
  const newCategoryValue = selection.kind === "new" ? selection.name : "";

  function pick(next: CategorySelection) {
    setSelection(next);
    onSelectionChange?.(next);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (matches.length) pick({ kind: "existing", id: matches[0].id, name: matches[0].name });
      else if (canCreate) pick({ kind: "new", name: query.trim() });
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
      triggerRef.current?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      wrapRef.current?.querySelector<HTMLButtonElement>("[role=option]")?.focus();
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <input type="hidden" name="categoryId" value={categoryIdValue} />
      <input type="hidden" name="newCategory" value={newCategoryValue} />

      <button
        ref={triggerRef}
        id="category-picker"
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="category-options"
        aria-haspopup="listbox"
        className="cs-select flex w-full items-center justify-between text-left"
      >
        <span className="text-ink">{label}</span>
        <span className="ml-2 text-ink-3">▾</span>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-line bg-surface shadow-lg">
          <div className="border-b border-line p-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search design categories…"
              aria-label="Search or create a category"
              className="cs-input !py-1.5 text-sm"
            />
          </div>
          <ul id="category-options" role="listbox" aria-label="Categories" className="max-h-60 overflow-y-auto py-1 text-sm">
            {matches.map((c) => (
              <li key={c.id}>
                <Row
                  selected={selection.kind === "existing" && selection.id === c.id}
                  onClick={() => pick({ kind: "existing", id: c.id, name: c.name })}
                >
                  {c.name}
                </Row>
              </li>
            ))}
            {canCreate && (
              <li>
                <Row onClick={() => pick({ kind: "new", name: query.trim() })}>
                  <IconArrowRight width={13} height={13} className="text-accent" />
                  <span>
                    Add <span className="font-medium text-ink">“{query.trim()}”</span>
                  </span>
                </Row>
              </li>
            )}
            {!matches.length && !canCreate && (
              <li className="px-3 py-2 text-xs text-ink-3">No categories match.</li>
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
