import { getSessionUser } from "@/lib/auth";
import { getBrand } from "@/lib/brand";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Serve the single brand's logo (base64 in the DB) for overlay previews. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const brand = await getBrand();
  if (!brand.logoData) return new Response("Not found", { status: 404 });

  const bytes = Buffer.from(brand.logoData, "base64");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": brand.logoMime || "image/png",
      "cache-control": "private, max-age=0, must-revalidate",
    },
  });
}
