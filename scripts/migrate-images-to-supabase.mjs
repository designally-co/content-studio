/**
 * One-off: move locally-stored images into Supabase Storage.
 *
 * Generated images and uploaded references were saved to ./data/images while
 * SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY were unset, so their DB rows hold
 * "local:<filename>". Those bytes only exist on the machine that generated
 * them, which breaks them on Vercel (read-only, ephemeral filesystem).
 *
 * This uploads each local file to the configured bucket and rewrites the row to
 * "supabase:<bucket>/<filename>". It is idempotent (upsert + skips rows that
 * are already migrated) and resumable (each row is updated right after its own
 * upload succeeds).
 *
 * Usage:
 *   node scripts/migrate-images-to-supabase.mjs            # dry run (default)
 *   node scripts/migrate-images-to-supabase.mjs --apply    # actually migrate
 *
 * Prerequisites: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY set in .env.local and
 * the bucket already created in the Supabase dashboard.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const APPLY = process.argv.includes("--apply");
const LOCAL_DIR = path.join(process.cwd(), "data", "images");

function loadEnv() {
  const env = { ...process.env };
  for (const file of [".env.local", ".env"]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      if (!line.includes("=") || line.trim().startsWith("#")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      if (v && !env[k]) env[k] = v;
    }
  }
  return env;
}

const env = loadEnv();
const SUPABASE_URL = env.SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = env.SUPABASE_STORAGE_BUCKET || "content-studio-images";

function authHeaders() {
  const h = { apikey: SERVICE_KEY };
  // Legacy service-role keys are JWTs (Bearer); new sb_secret_* keys are not.
  if (!SERVICE_KEY.startsWith("sb_secret_") && !SERVICE_KEY.startsWith("sb_publishable_")) {
    h.authorization = `Bearer ${SERVICE_KEY}`;
  }
  return h;
}

function mimeFor(filename) {
  return filename.endsWith(".jpg") || filename.endsWith(".jpeg") ? "image/jpeg" : "image/png";
}

async function main() {
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set before migrating.\n" +
        "  Supabase Dashboard -> Project Settings -> API"
    );
  }

  // Confirm the bucket exists up front, so we fail with a clear message rather
  // than a wall of per-file 404s.
  const bucketRes = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, { headers: authHeaders() });
  if (!bucketRes.ok) {
    throw new Error(`Could not list buckets (${bucketRes.status}). Check SUPABASE_URL / service-role key.`);
  }
  const buckets = await bucketRes.json();
  if (!Array.isArray(buckets) || !buckets.some((b) => b.name === BUCKET)) {
    throw new Error(
      `Bucket "${BUCKET}" does not exist. Create it (private) in Supabase -> Storage, then re-run.`
    );
  }
  console.log(`Bucket "${BUCKET}" found.`);
  console.log(APPLY ? "\nMODE: APPLY (will upload and rewrite rows)\n" : "\nMODE: DRY RUN (nothing will change) — pass --apply to migrate\n");

  const sql = postgres(env.DATABASE_URL, { prepare: false, ssl: "require" });
  const stats = { migrated: 0, skipped: 0, missing: 0, failed: 0 };

  try {
    for (const table of ["images", "image_references"]) {
      const rows = await sql`
        select id, storage_path from ${sql(table)}
        where storage_path like 'local:%' order by id`;
      const already = await sql`
        select count(*)::int n from ${sql(table)} where storage_path like 'supabase:%'`;
      console.log(`${table}: ${rows.length} local, ${already[0].n} already on Supabase`);

      for (const row of rows) {
        const filename = path.basename(row.storage_path.slice("local:".length));
        const full = path.join(LOCAL_DIR, filename);
        if (!fs.existsSync(full)) {
          console.log(`  MISSING  ${filename} (no local file — row left untouched)`);
          stats.missing++;
          continue;
        }
        if (!APPLY) {
          console.log(`  would migrate  ${filename}`);
          stats.migrated++;
          continue;
        }
        try {
          const data = await fsp.readFile(full);
          const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${filename}`, {
            method: "POST",
            headers: { ...authHeaders(), "content-type": mimeFor(filename), "x-upsert": "true" },
            body: new Uint8Array(data),
          });
          if (!res.ok) {
            const detail = await res.text().catch(() => "");
            throw new Error(`upload ${res.status}: ${detail.slice(0, 160)}`);
          }
          // Rewrite immediately so an interrupted run is resumable.
          await sql`
            update ${sql(table)} set storage_path = ${`supabase:${BUCKET}/${filename}`}
            where id = ${row.id}`;
          console.log(`  migrated  ${filename}`);
          stats.migrated++;
        } catch (e) {
          console.log(`  FAILED    ${filename} — ${e.message}`);
          stats.failed++;
        }
      }
    }

    // Local files nobody references any more (safe to leave; just informational).
    if (fs.existsSync(LOCAL_DIR)) {
      const referenced = new Set(
        (
          await sql`
            select storage_path from images where storage_path like 'local:%'
            union all
            select storage_path from image_references where storage_path like 'local:%'`
        ).map((r) => path.basename(r.storage_path.slice("local:".length)))
      );
      const orphans = (await fsp.readdir(LOCAL_DIR)).filter((f) => !referenced.has(f));
      if (orphans.length) console.log(`\n${orphans.length} local file(s) not referenced by any row (ignored).`);
    }
  } finally {
    await sql.end();
  }

  console.log(
    `\nDone. ${APPLY ? "migrated" : "would migrate"}=${stats.migrated} missing=${stats.missing} failed=${stats.failed}`
  );
  if (!APPLY && stats.migrated > 0) console.log("Re-run with --apply to perform the migration.");
  if (stats.failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error("\n" + e.message);
  process.exitCode = 1;
});
