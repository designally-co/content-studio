"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

import { PAGE_ACTION_BUTTON_QUIET, TopBlur } from "@/components/page-bar";

/**
 * Library's phone bar: the page's name on the menu button's line, and the one
 * control the page actually needs there.
 *
 * SEARCH IS THE WHOLE BAR, NOT A BUTTON BESIDE ONE. The desktop filter row is
 * a search box and three selects — direction, status, sort — which on a phone
 * became a two-column grid of dropdowns occupying most of the screen above a
 * list of ten articles. The selects are how you narrow a table you can see all
 * of at once; on a phone you are looking for one article and you know its name.
 *
 * So the phone gets search and nothing else, and it is not even permanently on
 * screen: the bar shows the page's name until you press the disc, then becomes
 * the field. The desktop bar is untouched — this replaces it below `lg`, it
 * does not reduce it.
 */
export function LibraryBar() {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();

  const queryParam = params.get("q") ?? "";
  const [query, setQuery] = useState(queryParam);
  /* Open if there is already a term, so arriving on a filtered link — a
     bookmark, the back button — shows you what is filtering the list rather
     than a title and a short list with no stated reason for being short. */
  const [searching, setSearching] = useState(queryParam !== "");

  /* Adjusted during render rather than in an effect, so a URL that changed
     underneath the box never paints stale for a frame. Only a value we did not
     cause: our own debounced push lands back here a moment later, and adopting
     it would overwrite the box with what was typed 300ms ago. */
  const [lastParam, setLastParam] = useState(queryParam);
  if (queryParam !== lastParam) {
    setLastParam(queryParam);
    if (queryParam !== query.trim()) setQuery(queryParam);
  }

  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (query === queryParam) return;
    debounce.current = setTimeout(() => push(query.trim()), 300);
    return () => clearTimeout(debounce.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function push(value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set("q", value);
    else next.delete("q");
    // Narrowing while standing on page four leaves you on a page the new
    // result set may not have.
    next.delete("page");
    router.push(next.size ? `${pathname}?${next.toString()}` : pathname);
  }

  function closeSearch() {
    setSearching(false);
    setQuery("");
    if (queryParam) push("");
  }

  return (
    <div className="fixed inset-x-0 top-0 z-(--z-sticky) lg:hidden">
      <TopBlur />
      {/* Three columns with matching outer widths, so the title lands in the
          middle of the display rather than beside the menu button. The left
          column is empty: it reserves the button's space, and the button
          itself belongs to the navigation and paints above this. Searching,
          the field spans the middle and the right, since a search box the
          width of a title with a gap after it is not a search box. */}
      <div className="mx-auto grid h-12 w-full max-w-7xl grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2 px-3 sm:px-8">
        <div aria-hidden />
        {searching ? (
          <>
            <input
              type="search"
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by title…"
              aria-label="Search articles"
              /* On the bar's own line and the bar's own height, so opening
                 search does not make the band taller and shift the list. The
                 field is white on the blur, which is the one surface treatment
                 the stepper's current pill already uses on this line. */
              /* PLACED, NOT AUTO-FLOWED. The close button below is explicitly
                 in column 3, and grid places explicit items before auto ones —
                 so an auto `col-span-2` found only column 2 free on this row
                 and wrapped to a second one, putting the field under the menu
                 button and doubling the bar's height. Stating its columns lets
                 the two share column 3, which is the point: the X rides on the
                 field's right end, inside the padding reserved for it. */
              className="col-start-2 col-end-4 row-start-1 h-9 min-w-0 rounded-full bg-surface px-4 pr-11 text-sm text-ink outline-none placeholder:text-ink-3 focus-visible:shadow-[var(--shadow-focus)] [&::-webkit-search-cancel-button]:hidden"
            />
            <button
              type="button"
              onClick={closeSearch}
              aria-label="Close search"
              /* Inside the field's right end rather than beside it: the
                 field already spans to the gutter, and a disc after it would
                 have made the box shorter than the title it replaced. */
              className="col-start-3 row-start-1 mr-1 justify-self-end grid size-7 place-items-center rounded-full text-ink-3 transition-colors duration-(--duration-fast) ease-(--ease-out) hover:bg-chrome hover:text-ink focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]"
            >
              <X aria-hidden className="size-4" />
            </button>
          </>
        ) : (
          <>
            <h1 className="min-w-0 truncate text-center font-heading text-base font-semibold tracking-tight text-ink">
              Library
            </h1>
            <button
              type="button"
              onClick={() => setSearching(true)}
              aria-label="Search articles"
              /* White, not accent. Search commits nothing — it narrows a
                 list — and the accent disc is the one you press to make
                 something happen. It matches the menu button at the other end
                 of the same line. */
              className={`justify-self-end ${PAGE_ACTION_BUTTON_QUIET}`}
            >
              <Search aria-hidden className="size-5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
