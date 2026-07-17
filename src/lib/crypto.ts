import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import path from "node:path";
import fs from "node:fs";

/**
 * At-rest encryption key for API keys stored in the database: ENCRYPTION_KEY
 * env var in production; in local dev a generated key persisted under
 * ./data so encrypted values survive restarts (mirrors AUTH_SECRET in auth.ts).
 */
function getKey(): Buffer {
  if (process.env.ENCRYPTION_KEY) {
    return scryptSync(process.env.ENCRYPTION_KEY, "content-studio-api-keys", 32);
  }
  const file = path.join(process.cwd(), "data", "encryption-key");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, randomBytes(32).toString("hex"), { mode: 0o600 });
  }
  return Buffer.from(fs.readFileSync(file, "utf8"), "hex");
}

/** AES-256-GCM encrypt; output is `iv:authTag:ciphertext` (all hex). */
export function encryptSecret(plainText: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("hex"), authTag.toString("hex"), encrypted.toString("hex")].join(":");
}

export function decryptSecret(encoded: string): string {
  const [ivHex, authTagHex, dataHex] = encoded.split(":");
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
