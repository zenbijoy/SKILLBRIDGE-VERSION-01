import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function hmac(key, data) {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function createR2SignedPut({ accountId, bucket, key, accessKeyId, secretAccessKey, contentType, payloadHash }) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const datestamp = amzDate.slice(0, 8);
  const region = 'auto';
  const service = 's3';
  const host = `${bucket}.${accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${key.split('/').map(encodeURIComponent).join('/')}`;
  const credentialScope = `${datestamp}/${region}/${service}/aws4_request`;

  const canonicalHeaders =
    `content-type:${contentType}\n` +
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;

  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = `PUT\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${sha256(canonicalRequest)}`;

  const kDate = hmac(`AWS4${secretAccessKey}`, datestamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    url: `https://${host}${canonicalUri}`,
    headers: {
      Host: host,
      'Content-Type': contentType,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
      Authorization: authorization,
    },
  };
}

async function uploadApk() {
  const apkPath = path.resolve('release-apk/SkillBridge.apk');
  if (!fs.existsSync(apkPath)) {
    console.error('APK file not found at:', apkPath);
    process.exit(1);
  }

  const fileBuffer = fs.readFileSync(apkPath);
  const fileSizeMB = (fileBuffer.length / (1024 * 1024)).toFixed(2);
  console.log(`[+] Read APK: ${fileSizeMB} MB`);

  const accountId = '67f44ec178f1789db2a9c6a999b2e859';
  const bucket = 'skillbridge-media';
  const accessKeyId = '0b5eb29178500056bd24d8ff6cf81c30';
  const secretAccessKey = '7fecf15674497bd486269c5049604cc04c308f65ec2e19dafb0905cc7c763839';
  const key = 'releases/SkillBridge.apk';
  const contentType = 'application/vnd.android.package-archive';

  console.log(`[+] Computing SHA-256 and signing request...`);
  const payloadHash = sha256(fileBuffer);
  const { url, headers } = createR2SignedPut({
    accountId,
    bucket,
    key,
    accessKeyId,
    secretAccessKey,
    contentType,
    payloadHash,
  });

  console.log(`[+] Uploading ${fileSizeMB} MB to Cloudflare R2: ${url}...`);
  const res = await fetch(url, {
    method: 'PUT',
    headers,
    body: fileBuffer,
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error(`[-] Upload failed (${res.status}):`, errorText);
    process.exit(1);
  }

  console.log(`[+] Successfully uploaded to Cloudflare R2!`);
  console.log(`[+] Public CDN URL: https://pub-44498fcb7a6f4c4b83da4e693454b891.r2.dev/${key}`);
}

uploadApk().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
