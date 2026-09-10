/**
 * Re-encode already-stored images as resized WebP, in place.
 *
 * Generated covers were stored at native size and PNG until 10 September 2026,
 * when `saveGeneratedImage` started capping them at 1600px wide and encoding
 * WebP at q80. This brings the back catalogue to the same shape so the bucket
 * stops carrying multi-megabyte originals nothing asks for.
 *
 * IT RUNS AGAINST PRODUCTION, so it is built to be interrupted. Three phases,
 * each a separate invocation, and nothing destructive happens until the phase
 * before it has been read by a person:
 *
 *   --survey   (default) counts and measures. Writes nothing, anywhere.
 *   --apply               converts, uploads the WebP, repoints the row.
 *                         The original object is LEFT IN PLACE.
 *   --sweep               deletes the originals that --apply superseded.
 *
 * The gap between `apply` and `sweep` is the whole safety design: after apply,
 * every row points at a new object that has been read back and verified, and
 * the old bytes are still there to roll back to. Sweep is the only step that
 * cannot be undone, and by the time it runs the new files have been serving.
 *
 * Per image the order is: convert, upload, READ BACK, then update the row. A
 * crash at any point leaves the row pointing at a file that exists — either the
 * original, or a verified new one. There is no ordering here that can leave a
 * row addressing bytes that are not there.
 *
 * Re-runnable. Rows already ending `.webp` are skipped, so an interrupted apply
 * is resumed by running it again.
 */
import postgres from "postgres";
import sharp from "sharp";

const MAX_WIDTH = 1600;
const QUALITY = 80;

const mode = process.argv.includes("--apply")
  ? "apply"
  : process.argv.includes("--sweep")
    ? "sweep"
    : "survey";

const DATABASE_URL = process.env.DATABASE_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!DATABASE_URL || !SUPABASE_URL || !SERVICE_KEY) {
  console.error("Need DATABASE_URL, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

/** Matches the app's own header rule: new `sb_secret_*` keys are not JWTs. */
function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { apikey: SERVICE_KEY! };
  if (!SERVICE_KEY!.startsWith("sb_secret_") && !SERVICE_KEY!.startsWith("sb_publishable_")) {
    headers.authorization = `Bearer ${SERVICE_KEY}`;
  }
  return headers;
}

const object = (rel: string) => `${SUPABASE_URL}/storage/v1/object/${rel}`;

async function download(rel: string): Promise<Buffer | null> {
  const res = await fetch(object(rel), { headers: authHeaders() });
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

async function upload(rel: string, data: Buffer): Promise<void> {
  const res = await fetch(object(rel), {
    method: "POST",
    headers: { ...authHeaders(), "content-type": "image/webp", "x-upsert": "true" },
    body: new Uint8Array(data),
  });
  if (!res.ok) throw new Error(`upload ${res.status}: ${(await res.text()).slice(0, 160)}`);
}

async function remove(rel: string): Promise<boolean> {
  const res = await fetch(object(rel), { method: "DELETE", headers: authHeaders() });
  return res.ok;
}

const kb = (n: number) => `${(n / 1024).toFixed(0)}KB`;

const sql = postgres(DATABASE_URL, { max: 1 });

type Row = { id: string; storage_path: string; width: number | null; height: number | null };

async function main() {
  /* Generated images only. `image_references` are photographs handed BACK to an
     image provider and normalised to PNG on purpose, so they are not this
     script's business. */
  const pending = (await sql`
    select id, storage_path, width, height
    from images
    where storage_path like 'supabase:%'
      and storage_path not like '%.webp'
    order by created_at asc
  `) as unknown as Row[];

  const already = (await sql`
    select count(*)::int as n from images where storage_path like '%.webp'
  `) as unknown as { n: number }[];

  console.log(`mode: ${mode}`);
  console.log(`rows already webp: ${already[0]?.n ?? 0}`);
  console.log(`rows to convert:   ${pending.length}\n`);

  if (mode === "sweep") return sweep();

  let before = 0;
  let after = 0;
  let done = 0;
  let missing = 0;
  const failures: string[] = [];

  for (const row of pending) {
    const rel = row.storage_path.slice("supabase:".length);
    const original = await download(rel);
    if (!original) {
      missing += 1;
      console.log(`   absent   ${rel} — no bytes in the bucket, row left alone`);
      continue;
    }

    const meta = await sharp(original).metadata();
    const { data, info } = await sharp(original)
      .rotate()
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toBuffer({ resolveWithObject: true });

    before += original.length;
    after += data.length;

    const target = rel.replace(/\.[a-z0-9]+$/i, "") + ".webp";
    const line =
      `  ${meta.format} ${meta.width}x${meta.height} ${kb(original.length)}` +
      ` -> webp ${info.width}x${info.height} ${kb(data.length)}`;

    if (mode === "survey") {
      console.log(`${line}   [survey only]`);
      done += 1;
      continue;
    }

    try {
      await upload(target, data);
      // Read it back before anything points at it. An upload that returned 200
      // and stored nothing is the failure this guards against.
      const verify = await download(target);
      if (!verify || verify.length !== data.length) {
        throw new Error(`verify failed (${verify ? verify.length : "absent"} vs ${data.length})`);
      }
      await sql`
        update images
        set storage_path = ${`supabase:${target}`}, width = ${info.width}, height = ${info.height}
        where id = ${row.id}
      `;
      done += 1;
      console.log(`${line}   ok`);
    } catch (error) {
      failures.push(`${rel}: ${error instanceof Error ? error.message : "unknown"}`);
      console.log(`${line}   FAILED — row unchanged, original untouched`);
    }
  }

  console.log(
    `\n${done} ${mode === "survey" ? "would convert" : "converted"}` +
      `${missing ? `, ${missing} absent from the bucket` : ""}` +
      `${failures.length ? `, ${failures.length} failed` : ""}`
  );
  if (before) {
    console.log(
      `${kb(before)} -> ${kb(after)}  (saves ${kb(before - after)}, ${((1 - after / before) * 100).toFixed(0)}%)`
    );
  }
  for (const f of failures) console.log(`  ! ${f}`);
  if (mode === "apply") {
    console.log("\nOriginals are still in the bucket. Run with --sweep to remove them.");
  }
}

/**
 * Delete the superseded originals.
 *
 * It does not take a list from the apply phase — it derives one, by asking the
 * bucket what it holds and removing only objects that are NOT referenced by any
 * row and have a `.webp` sibling that IS. A list carried between two runs could
 * be stale; the database is the thing that knows what is live.
 */
async function sweep() {
  const referenced = new Set(
    (
      (await sql`select storage_path from images where storage_path like 'supabase:%'`) as unknown as {
        storage_path: string;
      }[]
    ).map((r) => r.storage_path.slice("supabase:".length))
  );
  const refReferenced = new Set(
    (
      (await sql`select storage_path from image_references where storage_path like 'supabase:%'`) as unknown as {
        storage_path: string;
      }[]
    ).map((r) => r.storage_path.slice("supabase:".length))
  );

  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "content-studio-images";
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${bucket}`, {
    method: "POST",
    headers: { ...authHeaders(), "content-type": "application/json" },
    body: JSON.stringify({ prefix: "", limit: 10000, sortBy: { column: "name", order: "asc" } }),
  });
  if (!res.ok) throw new Error(`list ${res.status}`);
  const objects = (await res.json()) as { name: string }[];

  let removed = 0;
  let freed = 0;
  for (const { name } of objects) {
    const rel = `${bucket}/${name}`;
    if (referenced.has(rel) || refReferenced.has(rel)) continue;
    if (name.endsWith(".webp")) continue; // never a superseded original
    const sibling = `${bucket}/${name.replace(/\.[a-z0-9]+$/i, "")}.webp`;
    // Only if the WebP that replaced it is the one a row now points at. An
    // unreferenced file with no live sibling is somebody else's problem, not
    // this script's, and is left where it is.
    if (!referenced.has(sibling)) continue;
    const bytes = (await download(rel))?.length ?? 0;
    if (await remove(rel)) {
      removed += 1;
      freed += bytes;
      console.log(`  removed ${name} (${kb(bytes)})`);
    } else {
      console.log(`  could not remove ${name}`);
    }
  }
  console.log(`\n${removed} originals removed, ${kb(freed)} freed`);
}

main()
  .then(() => sql.end())
  .catch(async (error) => {
    console.error(error);
    await sql.end();
    process.exit(1);
  });
