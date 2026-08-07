"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconTrash } from "@/components/icons";
import type { ProjectStatus } from "@/db/schema";
import { deleteArticleAction } from "./actions";

export function LibraryItem({ id, title, category, dateLabel, readMinutes, status, imageUrl, featured = false }: {
  id: string;
  title: string;
  category: string;
  dateLabel: string;
  readMinutes: number | null;
  status: ProjectStatus;
  /** Signed Supabase URL when available, else the /api/images/[id] fallback. */
  imageUrl: string | null;
  /** The most recently worked-on article, given the wide lead layout. */
  featured?: boolean;
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

  const cover = imageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageUrl}
      alt=""
      loading={featured ? "eager" : "lazy"}
      decoding="async"
      className={`size-full object-cover transition-transform duration-(--duration-slow) ease-(--ease-out) group-hover:scale-[1.025] ${featured ? "aspect-2/1 sm:aspect-auto" : "aspect-2/1"}`}
    />
  ) : (
    <div className={`grid place-items-center px-6 text-center ${featured ? "aspect-2/1 size-full sm:aspect-auto" : "aspect-2/1"}`}>
      <div>
        <p className="text-sm font-medium text-ink-2">No image yet</p>
        <p className="mt-1 text-xs text-ink-3">Generate one from the article</p>
      </div>
    </div>
  );

  // Published is the exception worth marking; draft is the resting state, so it
  // gets a word rather than a second pill competing with it.
  const statusBadge =
    status === "published" ? (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ok-ink">
        <span className="size-1.5 rounded-full bg-ok" aria-hidden="true" />
        Published
      </span>
    ) : (
      <span className="text-xs font-medium text-ink-faint">Draft</span>
    );

  // One link per card, stretched across the whole surface. The image is no
  // longer a second link to the same place, which was announcing every card
  // twice; the delete button lifts above the stretch so it stays clickable.
  const titleLink = (
    <Link
      href={`/pipeline/${id}`}
      className="rounded-sm after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <h2
        className={`text-pretty font-heading font-bold leading-snug tracking-tight text-ink transition-colors duration-(--duration-fast) group-hover:text-accent-ink ${
          featured
            ? "line-clamp-3 text-[length:var(--text-h2)]"
            : "line-clamp-2 text-[length:var(--text-h3)]"
        }`}
      >
        {title}
      </h2>
    </Link>
  );

  const meta = (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-ink-3">
      <span className="truncate font-medium text-ink-2">{category}</span>
      <time>{dateLabel}</time>
      <span>{readMinutes ? `${readMinutes} min read` : "Not drafted"}</span>
    </div>
  );

  const deleteButton = (
    <button
      type="button"
      onClick={remove}
      disabled={deleting}
      className="cs-reveal relative z-10 inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium text-danger-ink transition-colors duration-(--duration-fast) hover:bg-danger-soft focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-danger/20 active:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-50"
      aria-label={deleting ? `Deleting ${title}` : `Delete ${title}`}
    >
      <IconTrash width={15} height={15} /> {deleting ? "Deleting…" : "Delete"}
    </button>
  );

  return (
    <article className={`group relative ${featured ? "" : "h-full"}`}>
      <div
        className={`overflow-hidden rounded-2xl bg-surface transition-shadow duration-(--duration-base) ease-(--ease-out) group-hover:shadow-[var(--shadow-card)] ${
          featured ? "sm:grid sm:grid-cols-5 sm:items-stretch" : "h-full"
        }`}
      >
        {/* One step deeper than the page ground, which is now sunken too — at the
            same tone the image well dissolved into the page and the card read as
            a floating block of text. */}
        <div className={`overflow-hidden bg-deep ${featured ? "sm:col-span-3" : ""}`}>{cover}</div>

        <div className={`flex flex-col p-4 ${featured ? "sm:col-span-2 sm:justify-center sm:p-7" : "min-h-36 flex-1"}`}>
          <div className="mb-3 flex items-center gap-2">{statusBadge}</div>
          {titleLink}
          {meta}
          <div className={`flex items-center ${featured ? "mt-5" : "mt-auto pt-3"}`}>{deleteButton}</div>
          {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}
        </div>
      </div>
    </article>
  );
}
