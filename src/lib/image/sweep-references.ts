import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { imageReferences } from "@/db/schema";
import { deleteStoredImage } from "./storage";

/**
 * Throw away the reference photographs a published article no longer needs.
 *
 * References guide image generation — they are the picture the cover was drawn
 * to look like — and once the article is live nothing regenerates its cover, so
 * the files sit in the bucket doing nothing for the life of the project. They
 * were the largest thing left in it after the covers themselves.
 *
 * THE ROW IS KEPT AND ONLY THE FILE IS DELETED. All the weight is in storage:
 * measured on 10 September 2026, 62 rows were 80kB of Postgres against 11.6MB
 * of objects, so dropping rows would reclaim nothing you could see on a bill
 * while losing two things worth having. The licence and attribution recorded
 * against each photograph — 59 of those 62 carried one — and the link from
 * `images.reference_ids` back to the source a given cover came from. Both are
 * answers to questions asked long after the bytes stop mattering.
 *
 * NEVER FATAL. This runs at the end of publishing, after the article is already
 * live on the Hub. A storage error here must not turn a successful publish into
 * a failed one, so every failure is swallowed and the row is left unswept —
 * which simply means the file is still there and the next publish tries again.
 */
export async function sweepPublishedReferences(projectId: string): Promise<{
  swept: number;
}> {
  try {
    const db = await getDb();
    const rows = await db
      .select({ id: imageReferences.id, storagePath: imageReferences.storagePath })
      .from(imageReferences)
      .where(and(eq(imageReferences.projectId, projectId), isNull(imageReferences.sweptAt)));

    let swept = 0;
    for (const row of rows) {
      try {
        await deleteStoredImage(row.storagePath);
        // Stamped only once the bytes are actually gone, so an interrupted
        // sweep leaves a row that still describes a file that still exists.
        await db
          .update(imageReferences)
          .set({ sweptAt: new Date() })
          .where(eq(imageReferences.id, row.id));
        swept += 1;
      } catch {
        // This one stays. The next publish will find it unswept and retry.
      }
    }
    return { swept };
  } catch {
    return { swept: 0 };
  }
}
