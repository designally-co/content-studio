import { asc } from "drizzle-orm";
import { getDb } from "@/db";
import { categories } from "@/db/schema";
import { getArticleRules } from "@/lib/article-template";
import { CONTENT_PILLARS, pillarForDirection } from "@/lib/content-pillars";
import { toggleCategoryAction } from "../actions";
import { ArticleTemplateCard } from "../article-template-card";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Section } from "../section";

export default async function ContentSettingsPage() {
  const db = await getDb();
  const [cats, articleTemplate] = await Promise.all([
    db.select().from(categories).orderBy(asc(categories.name)),
    getArticleRules(),
  ]);

  return (
    <>
      <DirectionsCard categoriesList={cats} />
      <ArticleTemplateCard template={articleTemplate} />
    </>
  );
}

type CategoryRow = typeof categories.$inferSelect;

function DirectionsCard({ categoriesList }: { categoriesList: CategoryRow[] }) {
  // Grouped by pillar so 34 rows read as three scannable sections rather than
  // one undifferentiated wall. Anything matching no pillar still surfaces,
  // loudly last, so drift is visible instead of silent.
  const groups = CONTENT_PILLARS.map((pillar) => ({
    name: pillar.name,
    rows: categoriesList.filter((c) => pillarForDirection(c.name)?.slug === pillar.slug),
  })).filter((group) => group.rows.length > 0);
  const orphans = categoriesList.filter((c) => !pillarForDirection(c.name));
  if (orphans.length) groups.push({ name: "Not in any pillar", rows: orphans });

  return (
    <Section
      title="Content directions"
      description="Names are fixed to match the Hub's topics. Deactivate one to hide it when starting an article."
    >
      {categoriesList.length === 0 ? (
        <p className="text-sm text-ink-3">No directions yet.</p>
      ) : (
        <Accordion type="multiple" className="space-y-2">
          {groups.map((group) => {
            const activeCount = group.rows.filter((row) => row.active).length;
            return (
              <AccordionItem
                key={group.name}
                value={group.name}
                className="overflow-hidden rounded-xl border-none bg-surface"
              >
                <AccordionTrigger className="items-center px-4 hover:no-underline">
                  <span className="flex min-w-0 flex-1 items-center justify-between gap-3 pr-1">
                    <span className="text-sm font-medium">{group.name}</span>
                    <span className="text-xs font-normal text-ink-3">
                      {activeCount} of {group.rows.length} active
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-2">
                  {group.rows.map((category) => (
                    <div key={category.id} className="flex items-center gap-3 py-1.5">
                      <div className="min-w-0 flex-1">
                        <span className="text-sm">{category.name}</span>
                        {!category.active && (
                          <span className="ml-2 text-xs text-ink-faint">Inactive</span>
                        )}
                      </div>
                      <form action={toggleCategoryAction}>
                        <input type="hidden" name="id" value={category.id} />
                        <input type="hidden" name="active" value={String(category.active)} />
                        <Button type="submit" variant="ghost" size="sm">
                          {category.active ? "Deactivate" : "Activate"}
                        </Button>
                      </form>
                    </div>
                  ))}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}
    </Section>
  );
}
