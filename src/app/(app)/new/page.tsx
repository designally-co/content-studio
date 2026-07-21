import { asc } from "drizzle-orm";
import { getDb } from "@/db";
import { categories } from "@/db/schema";
import { isAnthropicConfigured } from "@/lib/anthropic";
import { SetupForm } from "./setup-form";

export const dynamic = "force-dynamic";

export default async function NewContentPage() {
  const db = await getDb();
  const cats = await db.select().from(categories).orderBy(asc(categories.name));
  const anthropicReady = await isAnthropicConfigured();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-(--z-sticky) border-b border-line bg-bg">
        <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 sm:py-5 lg:px-12 xl:px-16">
          <div className="max-w-3xl">
            <h1 className="text-[length:var(--text-h1)] font-bold">Create article</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-3 sm:text-base">
              Start with a topic, share a brief, or let AI find a timely creative-industry direction.
            </p>
          </div>
        </div>
      </header>

      <SetupForm
        categories={cats.filter((c) => c.active).map((c) => ({ id: c.id, name: c.name }))}
        anthropicReady={anthropicReady}
      />
    </div>
  );
}
