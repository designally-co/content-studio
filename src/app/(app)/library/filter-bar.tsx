"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { MenuSelect } from "@/components/ui/menu-select";

type Option = { value: string; label: string };

export function FilterBar({ categories }: { categories: Option[] }) {
  const router = useRouter();
  const params = useSearchParams();
  /* THE PAGE ITSELF, NOT A LITERAL. Every filter pushed to "/" — which was the
     Library once and is Create now — so choosing a direction navigated away
     from the table you were filtering. Reading the current path means the bar
     cannot be separated from its page again by a move. */
  const pathname = usePathname();

  const queryParam = params.get("q") ?? "";
  const [query, setQuery] = useState(queryParam);

  /* Keep the box in step with a URL that changed underneath it — Clear
     filters, the back button, a shared link.

     ADJUSTED DURING RENDER, NOT IN AN EFFECT. As an effect this committed the
     stale value first and the corrected one on a second pass, which is a
     visible flash on the one control the reader is typing into, and is what
     `react-hooks/set-state-in-effect` is pointing at. Setting state during
     render is React's documented answer for exactly this shape: the work is
     thrown away and re-run before anything paints. */
  const [lastParam, setLastParam] = useState(queryParam);
  if (queryParam !== lastParam) {
    setLastParam(queryParam);
    /* Only a value we did not cause. Our own debounced push lands back here a
       moment later, and adopting it would overwrite the box with what was
       typed 300ms ago — losing every character typed while the navigation was
       in flight. */
    if (queryParam !== query.trim()) setQuery(queryParam);
  }

  // Debounce pushing the search term into the URL.
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (query === queryParam) return;
    debounce.current = setTimeout(() => update("q", query.trim()), 300);
    return () => clearTimeout(debounce.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    /* Back to the first page. Narrowing a list while standing on page four
       leaves you on a page the new result set may not have. */
    next.delete("page");
    router.push(next.size ? `${pathname}?${next.toString()}` : pathname);
  }

  const filters: {
    key: string;
    label: string;
    options: Option[];
    searchable?: boolean;
  }[] = [
    {
      key: "category",
      label: "All directions",
      options: categories,
      searchable: true,
    },
    {
      key: "status",
      label: "All statuses",
      options: [
        { value: "draft", label: "Draft" },
        { value: "published", label: "Published" },
      ],
    },
  ];

  const hasFilters =
    filters.some((f) => params.get(f.key)) || Boolean(queryParam);

  return (
    /* A ROW, BESIDE THE HEADING. This was a two-column grid stacked under the
       title, sized for a phone — which no longer sees it at all: the phone has
       the search disc in its bar, and this bar is `lg` and up. So it stops
       being a block that spans the page and becomes what it is, a set of
       controls sitting at the end of the heading's own line. */
    <div className="flex flex-wrap items-center justify-end gap-2">
      <div className="relative w-56">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title…"
          aria-label="Search content"
          className="cs-select cs-field-outline !h-9 !w-full pl-9 pr-8 text-sm"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded text-ink-3 hover:text-ink"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      {filters.map((f) => (
        <div key={f.key}>
          <MenuSelect
            placeholder={f.label}
            ariaLabel={f.label}
            searchable={f.searchable}
            allowClear
            className="cs-field-outline !h-9 text-sm"
            value={params.get(f.key) ?? ""}
            options={f.options}
            onChange={(value) => update(f.key, value)}
          />
        </div>
      ))}
      {hasFilters && (
        <button
          onClick={() => {
            const next = new URLSearchParams(params.toString());
            filters.forEach((filter) => next.delete(filter.key));
            next.delete("q");
            next.delete("page");
            router.push(next.size ? `${pathname}?${next.toString()}` : pathname);
          }}
          className="cs-btn !h-9 text-sm"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
