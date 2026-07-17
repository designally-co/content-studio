import Link from "next/link";
import { and, eq, desc, asc } from "drizzle-orm";
import { getDb } from "@/db";
import { projects, categories } from "@/db/schema";
import { StatusBadge } from "@/components/status-badge";
import { FilterBar } from "./filter-bar";
import { IconNew, IconArrowRight } from "@/components/icons";

export const dynamic = "force-dynamic";

const LANG_LABEL: Record<string, string> = { en: "EN", th: "TH", both: "TH+EN" };

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const db = await getDb();

  const cats = await db.select().from(categories).orderBy(asc(categories.name));

  const conds = [];
  if (sp.category) conds.push(eq(projects.categoryId, sp.category));
  if (sp.language) conds.push(eq(projects.language, sp.language as "en" | "th" | "both"));
  if (sp.status)
    conds.push(
      eq(projects.status, sp.status as "draft" | "in_pipeline" | "finalized" | "rejected")
    );

  const rows = await db
    .select({
      id: projects.id,
      status: projects.status,
      stage: projects.stage,
      language: projects.language,
      approvalOutcome: projects.approvalOutcome,
      updatedAt: projects.updatedAt,
      topic: projects.selectedTopic,
      categoryName: categories.name,
    })
    .from(projects)
    .leftJoin(categories, eq(projects.categoryId, categories.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(projects.updatedAt));

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-6 px-4 pb-16 pt-8 sm:px-6 sm:pb-20 sm:pt-12 lg:px-8 lg:pb-24 lg:pt-16">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="flex-1 text-[length:var(--text-h1)] font-bold">
          Your content
        </h1>
        <Link href="/new" className="cs-btn-primary max-sm:w-full">
          <IconNew width={16} height={16} />
          New content
        </Link>
      </div>

      <FilterBar
        categories={cats.map((c) => ({ value: c.id, label: c.name }))}
      />

      {rows.length === 0 ? (
        <div className="grid place-items-center px-6 py-12 text-center">
          <p className="text-ink-3">
            {Object.keys(sp).length
              ? "Nothing matches those filters. Try clearing a few?"
              : "Nothing here yet. Give us a topic and we'll take the first swing."}
          </p>
          <Link href="/new" className="cs-btn-primary mt-6">
            <IconNew width={16} height={16} />
            New content
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((r) => {
            const meta = [
              r.categoryName,
              LANG_LABEL[r.language],
              `Edited ${new Date(r.updatedAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}`,
            ].filter(Boolean);
            return (
              <Link
                key={r.id}
                href={`/pipeline/${r.id}`}
                className="cs-card group flex flex-wrap items-center gap-x-4 gap-y-2 p-4 transition-[box-shadow,transform] duration-(--duration-base) ease-(--ease-out) hover:-translate-y-0.5 hover:shadow-[var(--shadow-pop)] sm:flex-nowrap sm:p-6"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-heading text-lg font-bold text-ink">
                    {r.topic?.title || "Untitled project"}
                  </div>
                  <div className="mt-1 truncate text-[length:var(--text-sm)] text-ink-3">
                    {meta.join(" · ")}
                  </div>
                </div>
                <StatusBadge status={r.status} stage={r.stage} outcome={r.approvalOutcome} />
                <IconArrowRight
                  width={16}
                  height={16}
                  className="hidden shrink-0 text-ink-3 transition-opacity sm:block sm:opacity-40 sm:group-hover:opacity-100"
                />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
