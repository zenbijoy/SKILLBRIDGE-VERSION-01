import { admin } from "../lib/db.js";
import { logger } from "../lib/logger.js";

export async function signedUpload(bucket: string, path: string) {
  const { data, error } = await admin.storage
    .from(bucket)
    .createSignedUploadUrl(path);
  if (error) throw error;
  return data;
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
