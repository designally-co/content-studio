import Link from "next/link";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  projects,
  categories,
  apiUsageLog,
  images,
} from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { fmtUsd } from "@/lib/format";
import { IconNew, IconArrowRight } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const db = await getDb();

  const recent = await db
    .select({
      id: projects.id,
      status: projects.status,
      stage: projects.stage,
      approvalOutcome: projects.approvalOutcome,
      categoryName: categories.name,
      topic: projects.selectedTopic,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .leftJoin(categories, eq(projects.categoryId, categories.id))
    .orderBy(desc(projects.updatedAt))
    .limit(6);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const approvedOutcomes = ["approved_first", "approved_edited"] as const;

  const [
    projectStatsRows,
    usageTotalRows,
    imageTotalRows,
    usageMonthRows,
    imageMonthRows,
    usageApprovedRows,
    imageApprovedRows,
  ] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)`,
        decided: sql<number>`count(*) filter (where ${projects.approvalOutcome} is not null)`,
        approvedFirst: sql<number>`count(*) filter (where ${projects.approvalOutcome} = 'approved_first')`,
        approvedAny: sql<number>`count(*) filter (where ${projects.approvalOutcome} in ('approved_first', 'approved_edited'))`,
      })
      .from(projects),
    db.select({ cost: sql<string>`coalesce(sum(${apiUsageLog.costUsd}), 0)` }).from(apiUsageLog),
    db.select({ cost: sql<string>`coalesce(sum(${images.costUsd}), 0)` }).from(images),
    db.select({ cost: sql<string>`coalesce(sum(${apiUsageLog.costUsd}), 0)` }).from(apiUsageLog)
      .where(and(gte(apiUsageLog.createdAt, monthStart), lt(apiUsageLog.createdAt, nextMonthStart))),
    db.select({ cost: sql<string>`coalesce(sum(${images.costUsd}), 0)` }).from(images)
      .where(and(gte(images.createdAt, monthStart), lt(images.createdAt, nextMonthStart))),
    db.select({ cost: sql<string>`coalesce(sum(${apiUsageLog.costUsd}), 0)` })
      .from(apiUsageLog)
      .innerJoin(projects, eq(apiUsageLog.projectId, projects.id))
      .where(inArray(projects.approvalOutcome, approvedOutcomes)),
    db.select({ cost: sql<string>`coalesce(sum(${images.costUsd}), 0)` })
      .from(images)
      .innerJoin(projects, eq(images.projectId, projects.id))
      .where(inArray(projects.approvalOutcome, approvedOutcomes)),
  ]);

  const recentIds = recent.map((project) => project.id);
  const [usageRows, imageRows] = recentIds.length
    ? await Promise.all([
        db.select({ projectId: apiUsageLog.projectId, cost: sql<string>`sum(${apiUsageLog.costUsd})` })
          .from(apiUsageLog).where(inArray(apiUsageLog.projectId, recentIds)).groupBy(apiUsageLog.projectId),
        db.select({ projectId: images.projectId, cost: sql<string>`sum(${images.costUsd})` })
          .from(images).where(inArray(images.projectId, recentIds)).groupBy(images.projectId),
      ])
    : [[], []];

  const costByProject = new Map<string, number>();
  for (const r of usageRows)
    if (r.projectId) costByProject.set(r.projectId, Number(r.cost));
  for (const r of imageRows)
    if (r.projectId)
      costByProject.set(r.projectId, (costByProject.get(r.projectId) ?? 0) + Number(r.cost));

  const stats = projectStatsRows[0];
  const totalProjects = Number(stats?.total ?? 0);
  const decidedCount = Number(stats?.decided ?? 0);
  const approvedFirstCount = Number(stats?.approvedFirst ?? 0);
  const approvedAnyCount = Number(stats?.approvedAny ?? 0);
  const monthlySpend = Number(usageMonthRows[0]?.cost ?? 0) + Number(imageMonthRows[0]?.cost ?? 0);
  const totalSpend = Number(usageTotalRows[0]?.cost ?? 0) + Number(imageTotalRows[0]?.cost ?? 0);
  const approvedSpend = Number(usageApprovedRows[0]?.cost ?? 0) + Number(imageApprovedRows[0]?.cost ?? 0);
  const approvalRate = decidedCount
    ? Math.round((approvedFirstCount / decidedCount) * 100)
    : null;
  const avgCostApproved = approvedAnyCount ? approvedSpend / approvedAnyCount : 0;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="First-draft approval rate, spend, and recent activity."
        actions={
          <Link href="/new" className="cs-btn-primary">
            <IconNew width={16} height={16} />
            New content
          </Link>
        }
      />

      <div className="space-y-6 p-4 sm:p-6 lg:space-y-8 lg:p-8">
        {/* KPI strip */}
        <div className="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="First-draft approval rate"
            value={approvalRate === null ? "—" : `${approvalRate}%`}
            hint={
              decidedCount
                ? `${approvedFirstCount} of ${decidedCount} decided`
                : "No decided projects yet"
            }
          />
          <Stat label="Spend this month" value={fmtUsd(monthlySpend)} hint="Text + images" />
          <Stat
            label="Avg cost / approved"
            value={approvedAnyCount ? fmtUsd(avgCostApproved) : "—"}
            hint={`${approvedAnyCount} approved`}
          />
          <Stat label="Total spend" value={fmtUsd(totalSpend)} hint={`${totalProjects} projects`} />
        </div>

        <div>
          {/* recent projects */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold tracking-tight text-ink">Recent projects</h2>
              <Link href="/library" className="rounded-sm text-sm text-accent-ink hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                View all
              </Link>
            </div>
            {recent.length === 0 ? (
              <EmptyRecent />
            ) : (
              <ul className="cs-card divide-y divide-line">
                {recent.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/pipeline/${p.id}`}
                      className="group flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 hover:bg-sunken/40 sm:flex-nowrap sm:px-5 sm:py-3.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-ink group-hover:text-accent-ink">
                          {p.topic?.title || "Untitled project"}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-ink-3">
                          {p.categoryName || "Uncategorized"}
                        </p>
                      </div>
                      <StatusBadge status={p.status} stage={p.stage} outcome={p.approvalOutcome} />
                      <span className="num ml-auto w-16 text-right text-sm text-ink-2 sm:ml-0">
                        {fmtUsd(costByProject.get(p.id) ?? 0)}
                      </span>
                      <IconArrowRight
                        width={16}
                        height={16}
                        className="hidden text-ink-3 transition-opacity sm:block sm:opacity-40 sm:group-hover:opacity-100"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

        </div>
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="bg-surface px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-3">{label}</p>
      <p className="num mt-1.5 text-2xl font-semibold tracking-tight text-ink">{value}</p>
      <p className="mt-0.5 text-xs text-ink-3">{hint}</p>
    </div>
  );
}

function EmptyRecent() {
  return (
    <div className="cs-card grid place-items-center px-6 py-14 text-center">
      <p className="font-medium text-ink">No projects yet</p>
      <p className="mt-1 max-w-sm text-sm text-ink-2">
        Start a content project to see approval rate and spend build up here.
      </p>
      <Link href="/new" className="cs-btn-primary mt-5">
        <IconNew width={16} height={16} />
        New content
      </Link>
    </div>
  );
}
