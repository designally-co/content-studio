import Link from "next/link";
import { and, eq, desc, asc, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { projects, categories, drafts, images } from "@/db/schema";
import { countMetrics } from "@/lib/text";
import { FilterBar } from "./filter-bar";
import { IconNew } from "@/components/icons";
import { LibraryItem } from "./library-item";

export const dynamic = "force-dynamic";

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const db = await getDb();

  const cats = await db
    .select()
    .from(categories)
    .where(eq(categories.active, true))
    .orderBy(asc(categories.sortOrder), asc(categories.name));

  const conds = [];
  if (sp.category) conds.push(eq(projects.categoryId, sp.category));
  if (sp.status)
    conds.push(
      eq(projects.status, sp.status as "draft" | "in_pipeline" | "finalized" | "rejected")
    );

  let rows = await db
    .select({
      id: projects.id,
      status: projects.status,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
      topic: projects.selectedTopic,
      categoryName: categories.name,
    })
    .from(projects)
    .leftJoin(categories, eq(projects.categoryId, categories.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(projects.updatedAt));

  const query = (sp.q ?? "").trim().toLowerCase();
  if (query) {
    rows = rows.filter((row) =>
      (row.topic?.title ?? "Untitled project").toLowerCase().includes(query)
    );
  }

  const latestImageByProject = new Map<string, string>();
  const readTimeByProject = new Map<string, number>();
  if (rows.length > 0) {
    const projectIds = rows.map((row) => row.id);
    const [imageRows, draftRows] = await Promise.all([
      db
        .select({ id: images.id, projectId: images.projectId })
        .from(images)
        .where(inArray(images.projectId, projectIds))
        .orderBy(desc(images.createdAt)),
      db
        .select({ projectId: drafts.projectId, contentMd: drafts.contentMd, isSelected: drafts.isSelected })
        .from(drafts)
        .where(inArray(drafts.projectId, projectIds))
        .orderBy(desc(drafts.isSelected), desc(drafts.createdAt)),
    ]);
    for (const image of imageRows) {
      if (!latestImageByProject.has(image.projectId)) latestImageByProject.set(image.projectId, image.id);
    }
    for (const draft of draftRows) {
      if (readTimeByProject.has(draft.projectId)) continue;
      const metric = countMetrics(draft.contentMd);
      const minutes = metric.isThai ? Math.ceil(metric.chars / 500) : Math.ceil(metric.words / 200);
      readTimeByProject.set(draft.projectId, Math.max(1, minutes));
    }
  }

  const sort = ["updated_desc", "created_desc", "title_asc", "title_desc"].includes(sp.sort)
    ? sp.sort
    : "updated_desc";
  rows.sort((a, b) => {
    if (sort === "created_desc") return b.createdAt.getTime() - a.createdAt.getTime();
    if (sort === "title_asc" || sort === "title_desc") {
      const comparison = (a.topic?.title || "Untitled project").localeCompare(b.topic?.title || "Untitled project", undefined, { sensitivity: "base" });
      return sort === "title_asc" ? comparison : -comparison;
    }
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  });
  const hasActiveFilters = Boolean(sp.category || sp.status || query);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-(--z-sticky) border-b border-line bg-bg">
        <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 sm:py-5 lg:px-12 xl:px-16">
          <div className="max-w-3xl">
            <h1 className="text-[length:var(--text-h1)] font-bold">Your content</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-3 sm:text-base">
              Find your drafts and finalized articles, then continue where you left off.
            </p>
          </div>

          <div className="mt-4">
            <FilterBar
              categories={cats.map((c) => ({ value: c.id, label: c.name }))}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 pb-16 pt-6 sm:px-6 sm:pb-20 sm:pt-8 lg:px-12 lg:pb-24 xl:px-16">
        {rows.length === 0 ? (
          <div className="grid place-items-center px-6 py-12 text-center">
            <p className="text-ink-3">
              {hasActiveFilters
                ? "Nothing matches those filters. Try clearing a few?"
                : "Nothing here yet. Give us a topic and we'll take the first swing."}
            </p>
            <Link href="/new" className="cs-btn-primary mt-6">
              <IconNew width={16} height={16} />
              New content
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((r) => {
              const dateLabel = new Date(r.updatedAt).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              });
              return <LibraryItem key={r.id} id={r.id} title={r.topic?.title || "Untitled project"} category={r.categoryName || "Uncategorized"} dateLabel={dateLabel} readMinutes={readTimeByProject.get(r.id) ?? null} status={r.status} imageId={latestImageByProject.get(r.id) ?? null} />;
            })}
          </div>
        )}
      </main>
    </div>
  );
}
