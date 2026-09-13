import crypto from "node:crypto";
import { env } from "../config/env.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // 128-bit IV for AES-GCM

/**
 * Derives a deterministic 32-byte key for AES-256 from the configured encryption key
 * or falls back to a hash of the service role key in development environments.
 */
function getEncryptionKey(): Buffer {
  const rawKey =
    env.OAUTH_TOKEN_ENCRYPTION_KEY ||
    env.SUPABASE_SERVICE_ROLE_KEY ||
    "skillbridge-dev-default-encryption-key-fallback";
  return crypto.createHash("sha256").update(rawKey).digest();
}

/**
 * Encrypts a sensitive string (e.g. OAuth access or refresh token) using AES-256-GCM.
 * Output format: `ivHex:authTagHex:encryptedHex`
 */
export function encryptToken(plainText: string): string {
  if (!plainText) return "";
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypts an encrypted token string formatted as `ivHex:authTagHex:encryptedHex`.
 * Throws an error if payload is corrupted or authentication tag fails.
 */
export function decryptToken(cipherPayload: string): string {
  if (!cipherPayload) return "";
  const parts = cipherPayload.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid cipher payload format: expected iv:authTag:encrypted");
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  if (!ivHex || !authTagHex || !encryptedHex) {
    throw new Error("Invalid cipher payload format: expected iv:authTag:encrypted");
  }

  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
