/**
 * Discard the reference photographs of articles that are already published.
 *
 * The app sweeps these at publish time from 10 September 2026. This is the
 * back catalogue — articles that went live before that and are still holding
 * the photographs their covers were drawn from.
 *
 * Same shape as `backfill-webp.ts`, and for the same reason: it runs against
 * production, so it surveys before it deletes and says exactly what it would
 * touch.
 *
 *   --survey  (default) counts and measures. Writes nothing.
 *   --apply             deletes the files and stamps `swept_at`.
 *
 * Only PUBLISHED projects. A draft is still being worked on and its cover may
 * yet be regenerated from these photographs.
 *
 * The ROW is kept — see `sweepPublishedReferences`, which explains why: the
 * weight is in storage, and the row carries the licence, the attribution and
 * the link from `images.reference_ids` back to the source a cover came from.
 */
import postgres from "postgres";

const apply = process.argv.includes("--apply");

const DATABASE_URL = process.env.DATABASE_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!DATABASE_URL || !SUPABASE_URL || !SERVICE_KEY) {
  console.error("Need DATABASE_URL, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { apikey: SERVICE_KEY! };
  if (!SERVICE_KEY!.startsWith("sb_secret_") && !SERVICE_KEY!.startsWith("sb_publishable_")) {
    headers.authorization = `Bearer ${SERVICE_KEY}`;
  }
  return headers;
}

const sql = postgres(DATABASE_URL, { max: 1 });
const kb = (n: number) => `${(n / 1024).toFixed(0)}KB`;

type Row = { id: string; storage_path: string; title: string | null; license: string | null };

async function main() {
  const rows = (await sql`
    select r.id, r.storage_path, r.license,
           p.selected_topic_json->>'title' as title
    from image_references r
    join projects p on p.id = r.project_id
    where p.status = 'published'
      and r.swept_at is null
      and r.storage_path like 'supabase:%'
    order by p.created_at asc
  `) as unknown as Row[];

  console.log(`${apply ? "apply" : "survey"}: ${rows.length} reference files on published articles\n`);

  let bytes = 0;
  let gone = 0;
  let failed = 0;

  for (const row of rows) {
    const rel = row.storage_path.slice("supabase:".length);
    const head = await fetch(`${SUPABASE_URL}/storage/v1/object/${rel}`, {
      method: "HEAD",
      headers: authHeaders(),
    });
    const size = Number(head.headers.get("content-length") ?? 0);
    bytes += size;

    if (!apply) {
      console.log(`  ${kb(size).padStart(7)}  ${row.license ?? "(no licence)"}  — ${row.title?.slice(0, 46) ?? "?"}`);
      continue;
    }

    const del = await fetch(`${SUPABASE_URL}/storage/v1/object/${rel}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    // A file already absent is a success: the row should still be stamped, or
    // every future run will try it again forever.
    if (del.ok || head.status === 404) {
      await sql`update image_references set swept_at = now() where id = ${row.id}`;
      gone += 1;
      console.log(`  removed ${kb(size).padStart(7)}  ${row.title?.slice(0, 46) ?? "?"}`);
    } else {
      failed += 1;
      console.log(`  FAILED  ${rel} -> ${del.status} (row left unswept, will retry)`);
    }
  }

  console.log(
    apply
      ? `\n${gone} removed, ${kb(bytes)} freed${failed ? `, ${failed} failed` : ""}`
      : `\nwould remove ${rows.length} files, ${kb(bytes)}`
  );

  const kept = (await sql`
    select count(*)::int n from image_references r join projects p on p.id = r.project_id
    where p.status <> 'published'
  `) as unknown as { n: number }[];
  console.log(`${kept[0]?.n ?? 0} references on unpublished articles are left alone.`);
}

main()
  .then(() => sql.end())
  .catch(async (error) => {
    console.error(error);
    await sql.end();
    process.exit(1);
  });
