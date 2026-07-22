"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { MenuSelect } from "@/components/ui/menu-select";

type Option = { value: string; label: string };

export function FilterBar({
  categories,
}: {
  categories: Option[];
}) {
  const router = useRouter();
  const params = useSearchParams();

  const queryParam = params.get("q") ?? "";
  const [query, setQuery] = useState(queryParam);

  // Keep local input in sync when the URL changes externally (e.g. Clear filters).
  useEffect(() => {
    setQuery(queryParam);
  }, [queryParam]);

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
    router.push(next.size ? `/?${next.toString()}` : "/");
  }

  const filters: { key: string; label: string; options: Option[]; searchable?: boolean }[] = [
    { key: "category", label: "All directions", options: categories, searchable: true },
    {
      key: "status",
      label: "All statuses",
      options: [
        { value: "in_pipeline", label: "In pipeline" },
        { value: "finalized", label: "Finalized" },
        { value: "draft", label: "Draft" },
      ],
    },
  ];

  const hasFilters = filters.some((f) => params.get(f.key)) || Boolean(queryParam);

  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
      <div className="relative col-span-2 sm:w-64">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title…"
          aria-label="Search content"
          className="cs-select !h-9 !w-full pl-9 pr-8 text-sm"
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
        <div key={f.key} className="col-span-1 sm:w-auto">
          <MenuSelect
            placeholder={f.label}
            ariaLabel={f.label}
            searchable={f.searchable}
            allowClear
            className="w-full text-sm sm:!h-9 sm:w-auto"
            value={params.get(f.key) ?? ""}
            options={f.options}
            onChange={(value) => update(f.key, value)}
          />
        </div>
      ))}
      {hasFilters && (
        <button onClick={() => {
          const next = new URLSearchParams(params.toString());
          filters.forEach((filter) => next.delete(filter.key));
          next.delete("q");
          router.push(next.size ? `/?${next.toString()}` : "/");
        }} className="cs-btn col-span-2 text-sm sm:!h-9">
          Clear filters
        </button>
      )}
      <label className="col-span-2 flex items-center gap-2 sm:ml-auto">
        <span className="shrink-0 text-sm font-medium text-ink-2">Sort by</span>
        <MenuSelect
          ariaLabel="Sort articles"
          className="w-full text-sm sm:!h-9 sm:w-auto"
          align="end"
          value={params.get("sort") ?? "updated_desc"}
          options={[
            { value: "updated_desc", label: "Recently edited" },
            { value: "created_desc", label: "Newest created" },
            { value: "title_asc", label: "Title A–Z" },
            { value: "title_desc", label: "Title Z–A" },
          ]}
          onChange={(value) => update("sort", value === "updated_desc" ? "" : value)}
        />
      </label>
    </div>
  );
}
