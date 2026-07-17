import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { imageReferences } from "@/db/schema";
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
  const [row] = await db
    .select()
    .from(imageReferences)
    .where(eq(imageReferences.id, id))
    .limit(1);
  if (!row) return new Response("Not found", { status: 404 });

  const resolved = await resolveImage(row.storagePath);
  if (!resolved) return new Response("Image unavailable", { status: 404 });
  if (resolved.kind === "redirect") return Response.redirect(resolved.url, 302);
  return new Response(new Uint8Array(resolved.data), {
    headers: {
      "content-type": resolved.mimeType,
      "cache-control": "private, max-age=3600",
    },
  });
}
