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
    <SetupForm
      categories={cats.filter((c) => c.active).map((c) => ({ id: c.id, name: c.name }))}
      anthropicReady={anthropicReady}
    />
  );
}
