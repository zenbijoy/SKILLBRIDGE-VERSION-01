import { admin } from "../lib/db.js";
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
  const { data, error } = await admin.storage
    .from(bucket)
    .list(prefix, { limit: 1000 });
  if (error) return;
  const files: string[] = [];
  for (const item of data ?? []) {
    const path = `${prefix}/${item.name}`;
    if (item.id) files.push(path);
    else await removeTree(bucket, path);
  }
  if (files.length) await admin.storage.from(bucket).remove(files);
}
