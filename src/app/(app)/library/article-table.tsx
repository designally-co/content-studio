"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ProjectStatus } from "@/db/schema";
import { deleteArticlesAction } from "./actions";
import { LibraryRow } from "./library-row";

export type ArticleRow = {
  id: string;
  title: string;
  category: string;
  dateLabel: string;
  status: ProjectStatus;
  imageUrl: string | null;
};

/**
 * The library list, and whatever you have picked out of it.
 *
 * THE SELECTION LIVES HERE, above the rows, because it is not a property of any
 * one of them: the header's tick has to know what every row is doing, and the
 * bar has to count them. A checkbox that owned its own state could not answer
 * either question.
 *
 * IT IS SCOPED TO THE PAGE YOU CAN SEE. Ten rows are shown at a time, and the
 * selection is cleared by paging — carrying a hidden selection across pages
 * means a Delete button reporting a number you cannot check against anything on
 * screen, which is exactly the situation where a bulk delete goes wrong.
 */
export function ArticleTable({ rows }: { rows: ArticleRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const ids = useMemo(() => rows.map((row) => row.id), [rows]);
  const count = selected.size;
  const allSelected = count > 0 && count === rows.length;

  function toggle(id: string, next: boolean) {
    setSelected((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(id);
      else copy.delete(id);
      return copy;
    });
  }

  function remove() {
    const batch = [...selected];
    setConfirming(false);
    setError(null);
    start(async () => {
      try {
        await deleteArticlesAction(batch);
        setSelected(new Set());
        router.refresh();
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : "Those articles could not be deleted."
        );
      }
    });
  }

  return (
    <div className="space-y-3">
      {/* Only present when something is picked. A bar that is always there,
          reading "0 selected" beside a disabled button, is a permanent reminder
          of a mode you are not in. */}
      {count > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-surface px-4 py-2.5">
          <p className="text-sm font-medium text-ink">
            {count} selected
          </p>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="rounded-md text-sm text-ink-3 underline-offset-2 hover:text-ink hover:underline focus-visible:outline-none focus-visible:[outline:2px_solid_var(--accent)] focus-visible:[outline-offset:2px]"
          >
            Clear
          </button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="ml-auto"
            disabled={pending}
            onClick={() => setConfirming(true)}
          >
            <Trash2 data-icon="inline-start" />
            {pending ? "Deleting…" : "Delete"}
          </Button>
        </div>
      )}

      {error && (
        <p className="text-sm text-danger-ink" role="alert">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-px px-4">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(next) =>
                    setSelected(next === true ? new Set(ids) : new Set())
                  }
                  aria-label={allSelected ? "Clear selection" : "Select all articles on this page"}
                />
              </TableHead>
              <TableHead className="px-4 text-ink-3">Title</TableHead>
              <TableHead className="hidden px-4 text-ink-3 sm:table-cell">Direction</TableHead>
              <TableHead className="px-4 text-ink-3">Status</TableHead>
              <TableHead className="hidden px-4 text-ink-3 md:table-cell">Updated</TableHead>
              {/* The delete control's column. Named for assistive technology,
                  blank on screen: a header that said "Actions" would be a word
                  wider than the thing beneath it. */}
              <TableHead className="w-px px-4">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <LibraryRow
                key={row.id}
                {...row}
                selected={selected.has(row.id)}
                onSelectedChange={(next) => toggle(row.id, next)}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      <ConfirmDelete
        title={count === 1 ? "Delete this article?" : `Delete ${count} articles?`}
        description={
          <>
            {count === 1 ? "It is" : "They are"} removed permanently, along with
            {count === 1 ? " its" : " their"} revisions, references and generated
            images. Anything already published to the Hub stays there.
          </>
        }
        open={confirming}
        onCancel={() => setConfirming(false)}
        onConfirm={remove}
      />
    </div>
  );
}
