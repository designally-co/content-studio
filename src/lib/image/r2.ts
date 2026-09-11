import "server-only";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

/**
 * Cloudflare R2, where images are stored.
 *
 * R2 speaks the S3 API, so this is the AWS client pointed at the account's R2
 * endpoint. Everything that knows about R2 is in this file; `storage.ts`
 * decides WHEN to use it.
 */

/** All five, or none. Listed once so every message names the same set. */
export const R2_VARS = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "R2_PUBLIC_URL",
] as const;

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** The origin the bucket is served from — `https://host`, no trailing slash. */
  publicUrl: string;
};

/**
 * The configuration, or null when none of it is set.
 *
 * SOME OF IT SET IS AN ERROR, NOT "NOT CONFIGURED". Four of five variables is
 * somebody part-way through setting R2 up, and treating it as absent would
 * quietly send images to local disk — which on Vercel lasts one request. The
 * message names the missing variables and never a value.
 */
export function r2Config(): R2Config | null {
  const values = R2_VARS.map((name) => process.env[name]?.trim() ?? "");
  const missing = R2_VARS.filter((_, index) => !values[index]);
  if (missing.length === R2_VARS.length) return null;
  if (missing.length > 0) {
    throw new Error(`R2 storage is only partly configured: ${missing.join(", ")} not set.`);
  }
  const [accountId, accessKeyId, secretAccessKey, bucket, publicUrl] = values;
  return { accountId, accessKeyId, secretAccessKey, bucket, publicUrl: publicOrigin(publicUrl) };
}

/**
 * R2_PUBLIC_URL, checked to be a bare origin.
 *
 * THE KEY IS READ BACK OUT OF THE URL'S PATH. A stored image is its full public
 * URL, and the object key is recovered from it as the path — so the path has to
 * BE the key, with nothing in front of it. A custom domain serves the bucket
 * from its root, so the right value never has a path; one that does is a
 * mistake worth refusing before it is written into rows.
 */
function publicOrigin(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("R2_PUBLIC_URL is not a URL. Set it to the bucket's custom domain, e.g. https://images.example.com.");
  }
  if (url.protocol !== "https:") throw new Error("R2_PUBLIC_URL must be https.");
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("R2_PUBLIC_URL must be the bucket's domain alone, with no path.");
  }
  return url.origin;
}

let connection: { client: S3Client; config: R2Config } | null = null;

function connect(): { client: S3Client; config: R2Config } {
  if (connection) return connection;
  const config = r2Config();
  if (!config) throw new Error(`R2 storage is not configured. Set ${R2_VARS.join(", ")}.`);
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    /* The SDK now attaches CRC checksums to every request by default, a
       newer S3 feature that S3-compatible stores do not all accept. Cloudflare's
       own guidance is to send them only when an operation requires one. */
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  connection = { client, config };
  return connection;
}

/** A readable reason from an SDK error — its name, status and message, never a credential. */
function describe(error: unknown): string {
  const name = (error as { name?: string })?.name ?? "Error";
  const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
  const message = error instanceof Error ? error.message : String(error);
  return `${name}${status ? ` (${status})` : ""}: ${message}`.slice(0, 200);
}

/** Whether a stored path is an R2 object. R2 rows are the only ones stored as a URL. */
export function isR2Url(storagePath: string): boolean {
  return storagePath.startsWith("https://");
}

/** The object key inside a stored R2 URL. */
export function r2KeyFromUrl(storedUrl: string): string {
  const key = decodeURIComponent(new URL(storedUrl).pathname.replace(/^\/+/, ""));
  if (!key) throw new Error("Stored R2 URL has no object key.");
  return key;
}

function publicUrlFor(key: string, config: R2Config): string {
  return `${config.publicUrl}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * A stored R2 URL, rebuilt against today's R2_PUBLIC_URL.
 *
 * THE DOMAIN IN A ROW IS THE ONE IT WAS WRITTEN UNDER. If the bucket moves to
 * another domain, every row still names the old one — which is exactly how the
 * Hub's links broke when it moved from vercel.app. Rebuilding from the key
 * means a domain change costs a redeploy, not a data migration. Without a
 * usable configuration the stored URL is the best answer there is.
 */
export function currentPublicUrl(storedUrl: string): string {
  let config: R2Config | null;
  try {
    config = r2Config();
  } catch {
    config = null;
  }
  return config ? publicUrlFor(r2KeyFromUrl(storedUrl), config) : storedUrl;
}

/**
 * The only types a browser is handed to display. Everything else — a PDF, a
 * document, and SVG, which can carry script and would run on our domain if
 * opened in place — is served as a download.
 */
const INLINE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"]);

function dispositionFor(contentType: string, key: string): string | undefined {
  if (INLINE_TYPES.has(contentType)) return undefined;
  const filename = (key.split("/").pop() ?? key).replace(/["\\\r\n]/g, "_");
  return `attachment; filename="${filename}"`;
}

/** Write an object and return its full public URL, which is what gets stored. */
export async function putR2Object(input: {
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<string> {
  const { client, config } = connect();
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        ContentDisposition: dispositionFor(input.contentType, input.key),
        /* A YEAR, AND IMMUTABLE, BECAUSE IT IS TRUE. Every key is a fresh
           random UUID, written once and never overwritten, so there is no
           version of this file that could go stale. Egress is the cost that
           matters here, and this is what lets Cloudflare's cache answer the
           repeats instead of the bucket. */
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
  } catch (error) {
    throw new Error(`R2 upload failed. ${describe(error)}`);
  }
  return publicUrlFor(input.key, config);
}

/** Read an object's bytes. Null when it does not exist; throws when R2 cannot be asked. */
export async function getR2Object(key: string): Promise<{ data: Buffer; mimeType: string } | null> {
  const { client, config } = connect();
  try {
    const response = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }), {
      abortSignal: AbortSignal.timeout(30000),
    });
    if (!response.Body) return null;
    return {
      data: Buffer.from(await response.Body.transformToByteArray()),
      mimeType: response.ContentType ?? "application/octet-stream",
    };
  } catch (error) {
    if ((error as { name?: string })?.name === "NoSuchKey") return null;
    throw new Error(`R2 read failed. ${describe(error)}`);
  }
}

/** Delete an object. Deleting one that is already gone succeeds, as S3 does. */
export async function deleteR2Object(key: string): Promise<void> {
  const { client, config } = connect();
  try {
    await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
  } catch (error) {
    throw new Error(`R2 deletion failed. ${describe(error)}`);
  }
}

/**
 * Whether the credentials can actually reach the bucket — for /api/health.
 *
 * A one-key listing, because it is the cheapest call an object-scoped R2 token
 * is certain to be allowed. Reading a key that does not exist looks cheaper,
 * but S3 answers that with a 403 rather than a 404 for a caller who cannot
 * list, and a probe that reports good credentials as rejected is worse than
 * none. `ok: null` means R2 could not be reached, which is not the same as
 * being refused.
 */
export async function probeR2(): Promise<{ ok: boolean | null; status?: number; ms: number; note?: string }> {
  const t0 = Date.now();
  try {
    const { client, config } = connect();
    await client.send(new ListObjectsV2Command({ Bucket: config.bucket, MaxKeys: 1 }), {
      abortSignal: AbortSignal.timeout(6000),
    });
    return { ok: true, status: 200, ms: Date.now() - t0 };
  } catch (error) {
    const name = (error as { name?: string })?.name;
    const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    const ms = Date.now() - t0;
    if (status === 401 || status === 403) {
      return { ok: false, status, ms, note: "credentials rejected — the token is wrong, revoked, or not scoped to this bucket" };
    }
    if (name === "NoSuchBucket") return { ok: false, status, ms, note: "no bucket by that name on this account" };
    if (status) return { ok: false, status, ms, note: name };
    return { ok: null, ms, note: `unreachable: ${name ?? "unknown"}` };
  }
}
