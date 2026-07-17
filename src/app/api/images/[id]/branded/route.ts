import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { images } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { getBrand } from "@/lib/brand";
import { resolveImage } from "@/lib/image/storage";
import { compositeLogo } from "@/lib/image/branding";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Resolve a stored image to raw bytes, fetching from Supabase Storage if needed. */
async function baseBytes(storagePath: string): Promise<Buffer | null> {
  const resolved = await resolveImage(storagePath);
  if (!resolved) return null;
  return resolved.data;
}

/**
 * Serve a generated image with the brand logo composited on. Uses the image's
 * saved branding settings (falling back to the brand default). Non-destructive:
 * the clean original is untouched and still served by /api/images/[id].
 */
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

  const brand = await getBrand();
  if (!brand.logoData) return new Response("No brand logo configured", { status: 404 });

  const base = await baseBytes(row.storagePath);
  if (!base) return new Response("Image unavailable", { status: 404 });

  const overlay = row.branding ?? brand.logoOverlay;
  const logo = Buffer.from(brand.logoData, "base64");
  const out = await compositeLogo(base, logo, overlay);

  return new Response(new Uint8Array(out), {
    headers: {
      "content-type": "image/png",
      "cache-control": "private, max-age=0, must-revalidate",
    },
  });
}
