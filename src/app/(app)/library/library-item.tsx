"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Clock } from "lucide-react";
import { IconTrash } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { ProjectStatus } from "@/db/schema";
import { deleteArticleAction } from "./actions";

export function LibraryItem({ id, title, category, dateLabel, readMinutes, status, imageUrl }: {
  id: string;
  title: string;
  category: string;
  dateLabel: string;
  readMinutes: number | null;
  status: ProjectStatus;
  /** Signed Supabase URL when available, else the /api/images/[id] fallback. */
  imageUrl: string | null;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm(`Delete “${title}”? This permanently removes the article, its revisions, references, and generated images.`)) return;
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

  return (
    <article className="h-full">
      <Card size="sm" className="h-full gap-0 py-0 shadow-none transition-[border-color,box-shadow] duration-(--duration-base) hover:border-line-strong hover:shadow-[var(--shadow-card)]">
        <Link href={`/pipeline/${id}`} aria-label={`Open ${title}`} className="group/image relative block overflow-hidden bg-sunken focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" loading="lazy" decoding="async" className="aspect-2/1 w-full object-cover transition-transform duration-(--duration-slow) ease-(--ease-out) group-hover/image:scale-[1.025]" />
          ) : (
            <div className="grid aspect-2/1 place-items-center px-6 text-center">
              <div>
                <p className="text-sm font-medium text-ink-2">No image yet</p>
                <p className="mt-1 text-xs text-ink-3">Generate one from the article</p>
              </div>
            </div>
          )}
          <div className="absolute bottom-3 left-3 flex max-w-[calc(100%_-_1.5rem)] gap-1.5">
            <Badge variant="secondary" className="max-w-[15rem] bg-surface text-ink shadow-sm"><span className="truncate">{category}</span></Badge>
          </div>
          {status === "published" ? (
            <Badge variant="secondary" className="absolute right-3 top-3 gap-1 bg-ok-soft text-ok-ink shadow-sm">
              <span className="size-1.5 rounded-full bg-ok" aria-hidden="true" />
              Published
            </Badge>
          ) : (
            <Badge variant="secondary" className="absolute right-3 top-3 bg-surface text-ink-2 shadow-sm">
              Draft
            </Badge>
          )}
        </Link>

        <div className="flex min-h-36 flex-1 flex-col p-3">
          <Link href={`/pipeline/${id}`} className="min-w-0 rounded-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <h2 className="line-clamp-2 text-pretty font-heading text-lg font-bold leading-snug tracking-tight text-ink transition-colors duration-(--duration-fast) hover:text-accent-ink">{title}</h2>
          </Link>
          <time className="mt-1.5 text-sm text-ink-3">{dateLabel}</time>

          <div className="mt-auto flex min-h-12 items-center justify-between gap-2 border-t border-line pt-2">
            <div className="flex items-center gap-1.5 text-sm text-ink-3">
              <Clock aria-hidden="true" className="size-4" strokeWidth={1.8} />
              <span>{readMinutes ? `${readMinutes} min read` : "Not drafted"}</span>
            </div>
            <button type="button" onClick={remove} disabled={deleting} className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium text-danger-ink transition-colors duration-(--duration-fast) hover:bg-danger-soft focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-danger/20 active:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-50" aria-label={deleting ? `Deleting ${title}` : `Delete ${title}`}>
              <IconTrash width={15} height={15} /> {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
          {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}
        </div>
      </Card>
    </article>
  );
}
