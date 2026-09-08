import Link from "next/link";
import { and, eq, desc, asc, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { projects, categories, images } from "@/db/schema";
import { createSignedImageUrls } from "@/lib/image/storage";
import { PageHeading } from "@/components/page-heading";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "./filter-bar";
import { IconNew } from "@/components/icons";
import { LibraryRow } from "./library-row";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination } from "./pagination";

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

  /* A QUERY STRING IS UNTRUSTED INPUT, and both of these went straight into
     SQL. `?category=none` reached Postgres as a uuid comparison and took the
     whole page down with "invalid input syntax for type uuid" — a 500 from a
     hand-edited URL, or from a bookmark kept after a direction was deleted.
     A value that is not a real filter is simply not applied. */
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const conds = [];
  if (sp.category && UUID.test(sp.category)) {
    conds.push(eq(projects.categoryId, sp.category));
  }
  if (sp.status === "draft" || sp.status === "published") {
    conds.push(eq(projects.status, sp.status));
  }

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
      (row.topic?.title ?? "Untitled project").toLowerCase().includes(query),
    );
  }

  const latestImageByProject = new Map<string, string>();
  const latestImagePathByProject = new Map<string, string>();
  if (rows.length > 0) {
    const projectIds = rows.map((row) => row.id);
    /* Only the covers. The read time that used to sit beside them cost every
       draft's FULL BODY TEXT, fetched and word-counted for every row on the
       page, to render two words in a column nobody sorted by. The column is
       gone and so is the query. */
    const imageRows = await db
      .select({
        id: images.id,
        projectId: images.projectId,
        storagePath: images.storagePath,
      })
      .from(images)
      .where(inArray(images.projectId, projectIds))
      .orderBy(desc(images.createdAt));
    for (const image of imageRows) {
      if (!latestImageByProject.has(image.projectId)) {
        latestImageByProject.set(image.projectId, image.id);
        latestImagePathByProject.set(image.projectId, image.storagePath);
      }
    }
  }

  // One batched signing request lets the browser load every card image straight
  // from Supabase Storage. Without it, each card hits /api/images/[id], and a
  // full grid means ~27 serverless invocations each opening a DB connection.
  const signedUrlByPath = await createSignedImageUrls([
    ...latestImagePathByProject.values(),
  ]);
  const imageUrlByProject = new Map<string, string>();
  for (const [projectId, imageId] of latestImageByProject) {
    const storagePath = latestImagePathByProject.get(projectId);
    const signed = storagePath ? signedUrlByPath.get(storagePath) : undefined;
    // Fall back to the API route for legacy `local:` images or if signing failed.
    imageUrlByProject.set(projectId, signed ?? `/api/images/${imageId}`);
  }

  const sort = [
    "updated_desc",
    "created_desc",
    "title_asc",
    "title_desc",
  ].includes(sp.sort)
    ? sp.sort
    : "updated_desc";
  rows.sort((a, b) => {
    if (sort === "created_desc")
      return b.createdAt.getTime() - a.createdAt.getTime();
    if (sort === "title_asc" || sort === "title_desc") {
      const comparison = (a.topic?.title || "Untitled project").localeCompare(
        b.topic?.title || "Untitled project",
        undefined,
        { sensitivity: "base" },
      );
      return sort === "title_asc" ? comparison : -comparison;
    }
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  });
  const hasActiveFilters = Boolean(sp.category || sp.status || query);

  /* PAGED AFTER SORTING, NOT BEFORE. The sort decides what "first" means, so
     slicing earlier would hand out the first twenty of an arbitrary order and
     call it page one. */
  const PER_PAGE = 20;
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / PER_PAGE));
  /* Clamped rather than trusted: `?page=0`, `?page=99` and `?page=abc` all
     resolve to a page that exists instead of an empty table. */
  const requested = Number.parseInt(sp.page ?? "1", 10);
  const page = Math.min(Math.max(Number.isFinite(requested) ? requested : 1, 1), pageCount);
  const start = (page - 1) * PER_PAGE;
  const pageRows = rows.slice(start, start + PER_PAGE);

  const hrefForPage = (n: number) => {
    const next = new URLSearchParams();
    if (sp.q) next.set("q", sp.q);
    if (sp.category) next.set("category", sp.category);
    if (sp.status) next.set("status", sp.status);
    if (sp.sort) next.set("sort", sp.sort);
    if (n > 1) next.set("page", String(n));
    return next.size ? `/library?${next.toString()}` : "/library";
  };
  const publishedCount = rows.filter(
    (row) => row.status === "published",
  ).length;
  const draftCount = rows.length - publishedCount;
  const noun = rows.length === 1 ? "article" : "articles";

  const toItemProps = (row: (typeof rows)[number]) => ({
    id: row.id,
    title: row.topic?.title || "Untitled project",
    category: row.categoryName || "Uncategorized",
    dateLabel: new Date(row.updatedAt).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }),
    status: row.status,
    imageUrl: imageUrlByProject.get(row.id) ?? null,
  });

  return (
    <div className="min-h-svh bg-sunken">
      {/* Not sticky and no rule beneath it: the title is content, so it scrolls
          away like the heading on Create. Pinned to the top it also stacked
          under the app's mobile header and covered the hamburger. */}
      <header className="mx-auto w-full max-w-7xl px-5 pt-10 sm:px-8 sm:pt-14 lg:px-12 xl:px-16">
        <PageHeading
          title="Everything on the desk."
          /* The counts were already computed for the grid. Stating them costs
             nothing and tells an editor more than a sentence of prose. */
          description={
            hasActiveFilters
              ? `${rows.length} matching ${noun}.`
              : `${rows.length} ${noun} — ${draftCount} in draft, ${publishedCount} published.`
          }
        />

        <div className="mt-7">
          <FilterBar
            categories={cats.map((c) => ({ value: c.id, label: c.name }))}
          />
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-5 pb-24 pt-8 sm:px-8 sm:pt-10 lg:px-12 xl:px-16">
        {rows.length === 0 ? (
          <EmptyState
            title={hasActiveFilters ? "Nothing matches those filters" : "Nothing here yet"}
            description={
              hasActiveFilters
                ? "Try a different direction or status, or clear them above."
                : "The first article you start will land here."
            }
            /* No button while a filter is on: the useful action then is
               clearing it, and that control is already in the bar above. */
            action={
              hasActiveFilters ? undefined : (
                <Link href="/" className="cs-btn-primary">
                  <IconNew width={16} height={16} />
                  New content
                </Link>
              )
            }
          />
        ) : (
          /* The table sits on a plate, the way every other list in the product
             does — the rules inside it are the structure, so the container
             needs nothing but a surface to hold them. */
          <div className="overflow-hidden rounded-2xl border border-line bg-surface">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-4 text-ink-3">Title</TableHead>
                  <TableHead className="hidden px-4 text-ink-3 sm:table-cell">Direction</TableHead>
                  <TableHead className="px-4 text-ink-3">Status</TableHead>
                  <TableHead className="hidden px-4 text-ink-3 md:table-cell">Updated</TableHead>
                  {/* The delete control's column. Named for assistive
                      technology, blank on screen: a header that said "Actions"
                      would be a word wider than the thing beneath it. */}
                  <TableHead className="w-px px-4">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((r) => (
                  <LibraryRow key={r.id} {...toItemProps(r)} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {rows.length > 0 && (
          <Pagination
            page={page}
            pageCount={pageCount}
            total={total}
            from={start + 1}
            to={start + pageRows.length}
            hrefFor={{
              previous: page > 1 ? hrefForPage(page - 1) : null,
              next: page < pageCount ? hrefForPage(page + 1) : null,
            }}
          />
        )}
      </main>
    </div>
  );
}
