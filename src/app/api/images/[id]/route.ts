import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { images } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { resolveImage } from "@/lib/image/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const db = await getDb();
  const [row] = await db.select().from(images).where(eq(images.id, id)).limit(1);
  if (!row) return new Response("Not found", { status: 404 });

  const resolved = await resolveImage(row.storagePath);
  if (!resolved) return new Response("Image unavailable", { status: 404 });

  return new Response(new Uint8Array(resolved.data), {
    headers: {
      "content-type": resolved.mimeType,
      "cache-control": "private, max-age=31536000, immutable",
    },
  });
}
