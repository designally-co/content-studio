import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { brandProfiles } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Serve a brand profile's uploaded image, stored as base64 bytes in Postgres. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const db = await getDb();
  const [row] = await db
    .select({
      data: brandProfiles.profileImageData,
      mime: brandProfiles.profileImageMime,
    })
    .from(brandProfiles)
    .where(eq(brandProfiles.id, id))
    .limit(1);

  if (!row || !row.data) return new Response("Not found", { status: 404 });

  const bytes = Buffer.from(row.data, "base64");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": row.mime || "application/octet-stream",
      // Avatars can change; revalidate so a replaced image isn't served stale.
      "cache-control": "private, max-age=0, must-revalidate",
    },
  });
}
