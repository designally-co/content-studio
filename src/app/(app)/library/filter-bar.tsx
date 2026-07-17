"use client";

import { useRouter, useSearchParams } from "next/navigation";

type Option = { value: string; label: string };

export function FilterBar({
  categories,
}: {
  categories: Option[];
}) {
  const router = useRouter();
  const params = useSearchParams();

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`/library?${next.toString()}`);
  }

  const filters: { key: string; label: string; options: Option[] }[] = [
    { key: "category", label: "All categories", options: categories },
    {
      key: "language",
      label: "All languages",
      options: [
        { value: "en", label: "English" },
        { value: "th", label: "Thai" },
        { value: "both", label: "Both" },
      ],
    },
    {
      key: "status",
      label: "All statuses",
      options: [
        { value: "in_pipeline", label: "In pipeline" },
        { value: "finalized", label: "Finalized" },
        { value: "rejected", label: "Rejected" },
        { value: "draft", label: "Draft" },
      ],
    },
  ];

  const hasFilters = filters.some((f) => params.get(f.key));

  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
      {filters.map((f) => (
        <select
          key={f.key}
          value={params.get(f.key) ?? ""}
          onChange={(e) => update(f.key, e.target.value)}
          className="cs-select !w-full text-sm sm:!h-9 sm:!w-auto"
        >
          <option value="">{f.label}</option>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ))}
      {hasFilters && (
        <button onClick={() => router.push("/library")} className="cs-btn col-span-2 text-sm sm:!h-9">
          Clear
        </button>
      )}
    </div>
  );
}
