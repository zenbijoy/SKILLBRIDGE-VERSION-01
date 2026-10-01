/**
 * Manual R2 round-trip verification (NOT part of the automated suite).
 * Run with:  npx tsx src/services/storage.r2verify.ts
 *
 * Uploads a tiny buffer through the active storage provider, mints a signed
 * download URL, and reads it back. Proves SigV4 signing works against the real
 * R2 endpoint (presigned client PUTs cannot be verified this way).
 */
import { getStorageProvider, getStorageStatus } from "./storage.js";

async function main() {
  const status = getStorageStatus();
  console.log("[verify] storage status:", status);

  if (status.provider !== "r2") {
    console.log("[verify] SKIPPED - R2 is not the active provider.");
    return;
  }

  const provider = getStorageProvider();
  const key = `verify/healthcheck-${Date.now()}.txt`;
  const payload = Buffer.from(`skillbridge-r2-ok ${Date.now()}`, "utf8");

  console.log("[verify] uploading", key, `(${payload.byteLength} bytes)`);
  await provider.uploadBuffer("attachments", key, payload, "text/plain");

  const signed = await provider.createSignedDownloadUrl("attachments", key, 300, {
    forceSigned: true,
  });
  console.log("[verify] signed GET url host:", new URL(signed).host);

  const res = await fetch(signed);
  const text = await res.text();
  console.log("[verify] GET status:", res.status);
  console.log("[verify] body:", text);

  if (!res.ok || text !== payload.toString("utf8")) {
    throw new Error("R2 round-trip verification FAILED");
  }
  console.log("[verify] SUCCESS - upload + signed download round-trip works on R2.");

  // Also verify the client-side presigned PUT path (what the mobile app uses),
  // because it signs a different canonical request (UNSIGNED-PAYLOAD).
  const ticket = await provider.signedUpload("attachments", key);
  const putUrl = new URL(ticket.url);
  console.log(
    "[verify] presigned PUT host:",
    putUrl.host,
    "| signed-headers:",
    putUrl.searchParams.get("X-Amz-SignedHeaders"),
  );
  const presignedRes = await fetch(ticket.url, {
    method: "PUT",
    headers: { "Content-Type": "text/plain" },
    body: "presigned-put-ok",
  });
  console.log("[verify] presigned PUT status:", presignedRes.status);
  if (!presignedRes.ok) {
    throw new Error(
      `presigned PUT FAILED (${presignedRes.status}): ${await presignedRes.text().catch(() => "")}`,
    );
  }
  const readBack = await fetch(
    await provider.createSignedDownloadUrl("attachments", key, 300, { forceSigned: true }),
  );
  const readBackText = await readBack.text();
  console.log("[verify] presigned PUT body read back:", readBackText);
  if (readBackText !== "presigned-put-ok") {
    throw new Error("presigned PUT round-trip mismatch");
  }
  console.log("[verify] SUCCESS - presigned client PUT also works on R2.");

  // Finally verify the DELETE path (used for cleanup / soft-deleted media).
  await provider.removeFiles("attachments", [key]);
  const afterDelete = await fetch(
    await provider.createSignedDownloadUrl("attachments", key, 60, { forceSigned: true }),
  );
  console.log("[verify] GET after delete status:", afterDelete.status, "(404 = removed)");
  if (afterDelete.status !== 404) {
    throw new Error("R2 delete did not remove the object");
  }
  console.log("[verify] SUCCESS - R2 delete works; test objects cleaned up.");
}

main().catch((err) => {
  console.error("[verify] FAILED:", err);
  process.exit(1);
});
