import { asc } from "drizzle-orm";
import { getDb } from "@/db";
import { categories } from "@/db/schema";
import { getArticleRules } from "@/lib/article-template";
import { CONTENT_PILLARS, pillarForDirection } from "@/lib/content-pillars";
import { CategoryToggle } from "../category-toggle";
import { ArticleTemplateCard } from "../article-template-card";
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
                  {/* No "Inactive" word beside an off switch. The switch is
                      already off, and printing it competes with the name of
                      the direction — the same rule the routine toggles follow.
                      Dimming the name is what carries it instead. */}
                  {group.rows.map((category) => (
                    <div
                      key={category.id}
                      className="flex items-center justify-between gap-3 border-b border-line py-1 last:border-b-0"
                    >
                      <span
                        className={`min-w-0 flex-1 truncate text-sm ${
                          category.active ? "text-ink" : "text-ink-3"
                        }`}
                      >
                        {category.name}
                      </span>
                      <CategoryToggle
                        id={category.id}
                        name={category.name}
                        active={category.active}
                      />
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
