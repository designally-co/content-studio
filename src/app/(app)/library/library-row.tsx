"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { TableCell, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import type { ProjectStatus } from "@/db/schema";
import { deleteArticleAction } from "./actions";

/**
 * One article, as a row.
 *
 * A TABLE, BECAUSE THE LIBRARY IS A LIST OF THE SAME THING. Cards give every
 * article a picture the size of a postcard and then repeat four labels beneath
 * it, so twelve articles are twelve blocks to read rather than twelve lines to
 * scan. A row puts the same four facts in the same four places every time,
 * which is what makes a column comparable — and which article was edited last,
 * or which are still drafts, is a question you answer by running your eye down
 * one column rather than reading each card.
 *
 * The thumbnail stays, at row height. It is the fastest way to recognise an
 * article you already know, and it costs a column rather than a paragraph.
 *
 * ALL OF WHICH STOPS BEING TRUE ON A PHONE — see LibraryItem below.
 */
export function LibraryRow({
  id,
  title,
  category,
  dateLabel,
  status,
  imageUrl,
  selected,
  onSelectedChange,
}: {
  id: string;
  title: string;
  category: string;
  dateLabel: string;
  status: ProjectStatus;
  imageUrl: string | null;
  selected: boolean;
  onSelectedChange: (next: boolean) => void;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (
      !window.confirm(`Delete “${title}”? This cannot be undone.`)
    )
      return;
    setDeleting(true);
    setError(null);
    try {
      await deleteArticleAction(id);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The article could not be deleted.");
      setDeleting(false);
    }
  }

  /* `relative` on the row is what lets the title's stretched link cover the
     whole line rather than just its own cell.

     THE GUTTER IS SET ON THE ROW, NOT ON EACH CELL. The primitive pads a `td`
     by 8px and a `th` by 16, so the column BOXES lined up while everything
     printed inside them sat eight pixels apart from its own heading — the kind
     of misalignment that reads as sloppiness without being obvious enough to
     name. Declaring it once for every cell in the row is what stops the two
     drifting again. */
  return (
    <TableRow
      data-selected={selected || undefined}
      className="group relative [&>td]:px-4 hover:bg-sunken data-selected:bg-sunken"
    >
      {/* Above the row's stretched link, like the delete button, or the link
          would swallow the tick and open the article instead. */}
      <TableCell className="relative z-10 w-px">
        <Checkbox
          checked={selected}
          onCheckedChange={(next) => onSelectedChange(next === true)}
          aria-label={`Select ${title}`}
        />
      </TableCell>
      {/* `w-full max-w-0` is what makes a table cell truncate. A cell sizes to
          its content by default, so a long title widened the whole table and
          pushed the other columns off a phone instead of shortening itself;
          the zero max-width lets `truncate` take effect while `w-full` still
          claims the space the other columns do not need. */}
      <TableCell className="w-full max-w-0 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-deep">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
            ) : (
              /* The first letter, not an icon: a placeholder that differs per
                 row still tells the rows apart at a glance. */
              <span aria-hidden className="text-sm font-medium text-ink-3">
                {title.trim().charAt(0).toUpperCase()}
              </span>
            )}
          </span>
          <Link
            href={`/pipeline/${id}`}
            /* The row is the target. The link stretches across it, so the
               whole line is clickable and the name is still the accessible
               name for it. */
            className="min-w-0 rounded-sm after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:[outline:2px_solid_var(--accent)] focus-visible:[outline-offset:-2px]"
          >
            <span className="block truncate font-medium text-ink">{title}</span>
          </Link>
        </div>
        {error && (
          <p className="mt-1 text-xs text-danger-ink" role="alert">
            {error}
          </p>
        )}
      </TableCell>

      <TableCell className="hidden text-ink-2 sm:table-cell">{category}</TableCell>

      <TableCell>
        {/* Published is the exception worth marking; draft is the resting
            state, so it gets a word rather than a second badge competing. */}
        {status === "published" ? (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-ink-2">
            <span aria-hidden className="size-1.5 rounded-full bg-ok" />
            Published
          </span>
        ) : (
          <span className="text-ink-3">Draft</span>
        )}
      </TableCell>

      <TableCell className="hidden whitespace-nowrap text-ink-3 md:table-cell">{dateLabel}</TableCell>

      <TableCell className="w-px">
        {/* Above the row's stretched link, or it could not be clicked. Revealed
            on hover and always present for the keyboard. */}
        <button
          type="button"
          onClick={remove}
          disabled={deleting}
          aria-label={deleting ? `Deleting ${title}` : `Delete ${title}`}
          className="relative z-10 grid size-9 place-items-center rounded-lg text-ink-3 opacity-0 transition-[opacity,color,background-color] duration-(--duration-fast) hover:bg-danger-soft hover:text-danger-ink focus-visible:opacity-100 focus-visible:outline-none focus-visible:[outline:2px_solid_var(--accent)] group-hover:opacity-100 disabled:opacity-50"
        >
          <Trash2 aria-hidden className="size-4" />
        </button>
      </TableCell>
    </TableRow>
  );
}

/**
 * One article, as a list item — the phone's version of the row above.
 *
 * COLUMNS NEED WIDTH, AND A PHONE HAS NONE TO GIVE. The table degrades by
 * dropping columns as the screen narrows, which works until the last two are
 * Title and Status: at 375px the title had about seven characters before the
 * ellipsis, so a page of ten articles read "Buildin…", "The Op…", "Why S…" —
 * ten thumbnails and ten copies of the word Published. The one fact you came to
 * find was the one fact the layout would not show.
 *
 * So it stops being a table. The title takes the full width and two lines if it
 * needs them, with the one column worth keeping — whether it is out yet —
 * underneath. Direction and Updated do not come along: the table had already
 * dropped them at this width, so carrying them down here would be introducing
 * facts rather than preserving them, and every one of them is another line to
 * read on every article.
 *
 * The checkbox stays. Per-row delete is revealed on hover, which a touch screen
 * never does, so selecting and using the bar above is the only way to delete
 * anything here — removing the tick would remove the capability.
 */
export function LibraryItem({
  id,
  title,
  status,
  imageUrl,
  selected,
  onSelectedChange,
}: {
  id: string;
  title: string;
  /* `category` and `dateLabel` arrive with the row and are deliberately not
     read here — the spread at the call site passes the whole article and the
     table still wants them. */
  category?: string;
  dateLabel?: string;
  status: ProjectStatus;
  imageUrl: string | null;
  selected: boolean;
  onSelectedChange: (next: boolean) => void;
}) {
  return (
    <li
      data-selected={selected || undefined}
      /* `relative` is what lets the title's stretched link cover the whole
         item rather than just its own line. */
      className="relative flex items-start gap-3 px-3 py-3 data-selected:bg-sunken"
    >
      {/* Above the stretched link, or the link swallows the tick and opens the
          article instead. `mt-0.5` sits it on the title's first line rather
          than on the centre of a two-line block. */}
      <span className="relative z-10 mt-0.5 shrink-0">
        <Checkbox
          checked={selected}
          onCheckedChange={(next) => onSelectedChange(next === true)}
          aria-label={`Select ${title}`}
        />
      </span>

      <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-deep">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
        ) : (
          <span aria-hidden className="text-sm font-medium text-ink-3">
            {title.trim().charAt(0).toUpperCase()}
          </span>
        )}
      </span>

      <span className="min-w-0 flex-1">
        <Link
          href={`/pipeline/${id}`}
          className="rounded-sm after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:[outline:2px_solid_var(--accent)] focus-visible:[outline-offset:-2px]"
        >
          {/* Two lines, then the ellipsis. One line is what the table was
              doing and is what made it useless; unbounded lets a long headline
              turn one article into a paragraph. */}
          <span className="line-clamp-2 font-medium leading-snug text-ink">{title}</span>
        </Link>
        {/* THE NAME AND WHETHER IT IS OUT. Direction and date came down here
            when the columns went, on the reasoning that a phone should not
            lose what the table showed — but the table had already dropped both
            at this width, so they were not being restored, they were being
            introduced. Three facts in a row of middots under every title is a
            second line to read on every article to find the one fact that
            changes what you do next. */}
        <span className="mt-1 flex items-center gap-1.5 text-xs text-ink-3">
          {status === "published" ? (
            <>
              <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-ok" />
              Published
            </>
          ) : (
            "Draft"
          )}
        </span>
      </span>
    </li>
  );
}
