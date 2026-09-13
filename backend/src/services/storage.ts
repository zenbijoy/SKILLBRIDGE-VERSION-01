import crypto from "node:crypto";
import { admin } from "../lib/db.js";
import { logger } from "../lib/logger.js";
import { env } from "../config/env.js";
import { logDomainEvent } from "../lib/domainLogger.js";

export interface PresignedUploadTicket {
  url: string;
  path: string;
  token?: string;
  provider: "supabase" | "r2";
  publicUrl?: string;
  mediaObjectId?: string;
}

export interface StorageProvider {
  name: "supabase" | "r2";
  signedUpload(bucket: string, path: string): Promise<PresignedUploadTicket>;
  createSignedDownloadUrl(bucket: string, path: string, expiresIn?: number): Promise<string>;
  removeFiles(bucket: string, files: string[]): Promise<void>;
}

// -----------------------------------------------------------------------------
// SigV4 Presigner for Cloudflare R2 (Zero External Dependencies)
// -----------------------------------------------------------------------------

function hmac(key: crypto.BinaryLike | crypto.KeyObject, data: string): Buffer {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest();
}

function sha256(data: string): string {
  return crypto.createHash("sha256").update(data, "utf8").digest("hex");
}

function createR2PresignedUrl(params: {
  method: "GET" | "PUT";
  accountId: string;
  bucket: string;
  key: string;
  accessKeyId: string;
  secretAccessKey: string;
  expiresInSeconds?: number;
}): string {
  const { method, accountId, bucket, key, accessKeyId, secretAccessKey, expiresInSeconds = 3600 } = params;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const datestamp = amzDate.slice(0, 8);
  const region = "auto";
  const service = "s3";
  const host = `${bucket}.${accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${key.split("/").map(encodeURIComponent).join("/")}`;
  const credentialScope = `${datestamp}/${region}/${service}/aws4_request`;

  const queryParams: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${accessKeyId}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresInSeconds),
    "X-Amz-SignedHeaders": "host",
  };

  const canonicalQueryString = Object.keys(queryParams)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k] ?? "")}`)
    .join("&");

  const canonicalHeaders = `host:${host}\n`;
  const signedHeaders = "host";
  const payloadHash = "UNSIGNED-PAYLOAD";

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join("\n");

  const kDate = hmac(`AWS4${secretAccessKey}`, datestamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = crypto.createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");

  return `https://${host}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}

// -----------------------------------------------------------------------------
// Storage Providers
// -----------------------------------------------------------------------------

// 1. Supabase Storage Provider
export class SupabaseStorageProvider implements StorageProvider {
  name = "supabase" as const;

  async signedUpload(bucket: string, path: string): Promise<PresignedUploadTicket> {
    if (path.includes("..") || path.startsWith("/")) {
      throw new Error("Invalid storage path: directory traversal prohibited");
    }

    const { data, error } = await admin.storage.from(bucket).createSignedUploadUrl(path);
    if (error) throw error;
    return {
      url: data.signedUrl,
      path: data.path,
      token: data.token,
      provider: "supabase",
    };
  }

  async createSignedDownloadUrl(bucket: string, path: string, expiresIn = 3600): Promise<string> {
    const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, expiresIn);
    if (error) throw error;
    return data.signedUrl;
  }

  async removeFiles(bucket: string, files: string[]): Promise<void> {
    const { error } = await admin.storage.from(bucket).remove(files);
    if (error) {
      logger.warn({ event: "storage_remove_files_failed", bucket, err: error.message }, "Failed removing files");
    }
  }
}

// 2. Cloudflare R2 Storage Provider (Hardened SigV4)
export class CloudflareR2StorageProvider implements StorageProvider {
  name = "r2" as const;

  private isConfigured(): boolean {
    return Boolean(env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY);
  }

  async signedUpload(bucket: string, path: string): Promise<PresignedUploadTicket> {
    if (!this.isConfigured()) {
      logDomainEvent({
        event: "storage_fallback_used",
        operation: "upload",
        bucket,
        originalProvider: "r2",
        fallbackProvider: "supabase",
      });
      return new SupabaseStorageProvider().signedUpload(bucket, path);
    }

    if (path.includes("..") || path.startsWith("/")) {
      throw new Error("Invalid storage path: directory traversal prohibited");
    }

    const targetBucket = env.R2_BUCKET_NAME || bucket;
    const signedPutUrl = createR2PresignedUrl({
      method: "PUT",
      accountId: env.R2_ACCOUNT_ID!,
      bucket: targetBucket,
      key: path,
      accessKeyId: env.R2_ACCESS_KEY_ID!,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
      expiresInSeconds: 3600,
    });

    const publicBase = env.R2_PUBLIC_DOMAIN || `https://${targetBucket}.${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

    return {
      url: signedPutUrl,
      path,
      provider: "r2",
      publicUrl: `${publicBase}/${path}`,
    };
  }

  async createSignedDownloadUrl(bucket: string, path: string, expiresIn = 3600): Promise<string> {
    if (!this.isConfigured()) {
      logDomainEvent({
        event: "storage_fallback_used",
        operation: "download",
        bucket,
        originalProvider: "r2",
        fallbackProvider: "supabase",
      });
      return new SupabaseStorageProvider().createSignedDownloadUrl(bucket, path, expiresIn);
    }

    if (env.R2_PUBLIC_DOMAIN) {
      return `${env.R2_PUBLIC_DOMAIN}/${path}`;
    }

    const targetBucket = env.R2_BUCKET_NAME || bucket;
    return createR2PresignedUrl({
      method: "GET",
      accountId: env.R2_ACCOUNT_ID!,
      bucket: targetBucket,
      key: path,
      accessKeyId: env.R2_ACCESS_KEY_ID!,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
      expiresInSeconds: expiresIn,
    });
  }

  async removeFiles(bucket: string, files: string[]): Promise<void> {
    if (!this.isConfigured()) {
      return new SupabaseStorageProvider().removeFiles(bucket, files);
    }
    // R2 direct file removal can be extended via REST API if configured
  }
}

// Factory to resolve active storage provider
export function getStorageProvider(): StorageProvider {
  if (env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY) {
    return new CloudflareR2StorageProvider();
  }
  return new SupabaseStorageProvider();
}

// Backward-compatible upload function
export async function signedUpload(bucket: string, path: string): Promise<PresignedUploadTicket> {
  const provider = getStorageProvider();
  return provider.signedUpload(bucket, path);
}

// Safe storage status check without exposing secrets
export function getStorageStatus(): {
  provider: "supabase" | "r2";
  available: boolean;
  r2Configured: boolean;
  publicDomain: string | null;
} {
  const isR2 = Boolean(env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY);
  return {
    provider: isR2 ? "r2" : "supabase",
    available: true,
    r2Configured: isR2,
    publicDomain: env.R2_PUBLIC_DOMAIN || null,
  };
}

export function resolveMediaObjectPublicUrl(media: {
  bucket: string;
  object_key: string;
  provider?: string;
}): string {
  if (media.provider === "r2" && env.R2_PUBLIC_DOMAIN) {
    const domain = env.R2_PUBLIC_DOMAIN.replace(/\/$/, "");
    return `${domain}/${media.object_key}`;
  }
  return `${env.SUPABASE_URL}/storage/v1/object/public/${media.bucket}/${media.object_key}`;
}

// Media Registry helper (Lifecycle management: pending_upload -> uploaded -> ready)
export async function registerMediaObject(params: {
  bucket: string;
  objectKey: string;
  mimeType: string;
  fileSizeBytes?: number;
  uploaderId: string;
  entityType: "avatar" | "resource" | "post_attachment" | "chat_attachment" | "recording";
  entityId?: string;
  provider?: "supabase" | "r2";
  status?: "pending_upload" | "uploaded" | "ready" | "quarantined" | "deleted";
}) {
  try {
    const { data, error } = await admin.from("media_objects").insert({
      provider: params.provider || (env.R2_ACCOUNT_ID ? "r2" : "supabase"),
      bucket: params.bucket,
      object_key: params.objectKey,
      mime_type: params.mimeType,
      file_size_bytes: params.fileSizeBytes ?? 0,
      uploader_id: params.uploaderId,
      entity_type: params.entityType,
      entity_id: params.entityId,
      status: params.status || "pending_upload",
    }).select().single();

    if (error) {
      logger.warn({ err: error.message, key: params.objectKey }, "Failed registering media object");
    }
    return data;
  } catch (err) {
    logger.warn({ err }, "media_objects register exception ignored");
    return null;
  }
}

// Finalize upload lifecycle: transitions status to 'ready'
export async function finalizeMediaObject(params: {
  mediaObjectId: string;
  fileSizeBytes?: number;
  checksumSha256?: string;
}) {
  try {
    const { data, error } = await admin
      .from("media_objects")
      .update({
        status: "ready",
        file_size_bytes: params.fileSizeBytes,
        checksum_sha256: params.checksumSha256,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.mediaObjectId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    logger.warn({ err, id: params.mediaObjectId }, "Failed finalizing media object");
    return null;
  }
}

export async function removeTree(
  bucket: string,
  prefix: string,
): Promise<void> {
  let offset = 0;
  const pageSize = 100;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await admin.storage
      .from(bucket)
      .list(prefix, { limit: pageSize, offset });

    if (error) {
      logger.warn(
        {
          event: "storage_list_files_failed",
          bucket,
          prefix,
          err: error.message,
        },
        `Failed listing files in bucket ${bucket} prefix ${prefix}`,
      );
      break;
    }

    if (!data || data.length === 0) {
      hasMore = false;
      break;
    }

    const files: string[] = [];
    for (const item of data) {
      const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id) {
        files.push(fullPath);
      } else {
        await removeTree(bucket, fullPath);
      }
    }

    if (files.length > 0) {
      const { error: rmError } = await admin.storage.from(bucket).remove(files);
      if (rmError) {
        logger.warn(
          {
            event: "storage_remove_files_failed",
            bucket,
            filesCount: files.length,
            err: rmError.message,
          },
          `Failed removing files in bucket ${bucket}`,
        );
      }
    }

    if (data.length < pageSize) {
      hasMore = false;
    } else {
      offset += pageSize;
    }
  }
}
