import crypto from "node:crypto";

export const AVANTIQO_VIDEO_RUNPOD_S3_CONTRACT = "AVANTIQO_VIDEO_RUNPOD_VOLUME_S3_V1";
export const AVANTIQO_VIDEO_RUNPOD_S3_ENDPOINT = "https://s3api-eu-ro-1.runpod.io";
export const AVANTIQO_VIDEO_RUNPOD_S3_REGION = "EU-RO-1";
export const AVANTIQO_VIDEO_RUNPOD_S3_BUCKET = "t4erb6kxi1";
export const AVANTIQO_VIDEO_RUNPOD_S3_VOLUME_NAME = "avantiqo-video-cache-eu-ro-1";

const text = (value) => String(value ?? "").trim();
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const hmac = (key, value, encoding = undefined) => crypto.createHmac("sha256", key).update(value).digest(encoding);

function credentials() {
  const accessKeyId = text(process.env.RUNPOD_S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID);
  const secretAccessKey = text(process.env.RUNPOD_S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY);
  if (!accessKeyId || !secretAccessKey) throw new Error("AVANTIQO_VIDEO_RUNPOD_S3_CREDENTIALS_REQUIRED");
  return { accessKeyId, secretAccessKey };
}

function encodePathPart(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function canonicalObjectPath(key) {
  const clean = text(key).replace(/^\/+/, "");
  if (!clean) throw new Error("AVANTIQO_VIDEO_RUNPOD_S3_KEY_REQUIRED");
  return `/${encodePathPart(AVANTIQO_VIDEO_RUNPOD_S3_BUCKET)}/${clean.split("/").map(encodePathPart).join("/")}`;
}

function amzDate(now) {
  return now.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function dateStamp(now) {
  return now.toISOString().slice(0, 10).replace(/-/g, "");
}

function signingKey(secretAccessKey, stamp) {
  const kDate = hmac(Buffer.from(`AWS4${secretAccessKey}`, "utf8"), stamp);
  const kRegion = hmac(kDate, AVANTIQO_VIDEO_RUNPOD_S3_REGION);
  const kService = hmac(kRegion, "s3");
  return hmac(kService, "aws4_request");
}

function encodeQuery(value) {
  return encodeURIComponent(String(value)).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function presignAvantiqoVideoRunpodVolumeObject({
  key,
  method = "GET",
  expires_seconds = 900,
  now = new Date(),
} = {}) {
  const verb = text(method).toUpperCase();
  if (!["GET", "PUT", "DELETE", "HEAD"].includes(verb)) throw new Error(`AVANTIQO_VIDEO_RUNPOD_S3_METHOD_INVALID:${verb}`);
  const expires = Math.max(60, Math.min(3600, Math.round(Number(expires_seconds) || 900)));
  const { accessKeyId, secretAccessKey } = credentials();
  const endpoint = new URL(AVANTIQO_VIDEO_RUNPOD_S3_ENDPOINT);
  const host = endpoint.host;
  const path = canonicalObjectPath(key);
  const stamp = dateStamp(now);
  const timestamp = amzDate(now);
  const scope = `${stamp}/${AVANTIQO_VIDEO_RUNPOD_S3_REGION}/s3/aws4_request`;
  const query = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${accessKeyId}/${scope}`,
    "X-Amz-Date": timestamp,
    "X-Amz-Expires": String(expires),
    "X-Amz-SignedHeaders": "host",
  };
  const canonicalQuery = Object.entries(query)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${encodeQuery(name)}=${encodeQuery(value)}`)
    .join("&");
  const canonicalHeaders = `host:${host}\n`;
  const canonicalRequest = [
    verb,
    path,
    canonicalQuery,
    canonicalHeaders,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    timestamp,
    scope,
    sha256(canonicalRequest),
  ].join("\n");
  const signature = hmac(signingKey(secretAccessKey, stamp), stringToSign, "hex");
  return {
    contract: AVANTIQO_VIDEO_RUNPOD_S3_CONTRACT,
    method: verb,
    key: text(key).replace(/^\/+/, ""),
    url: `${AVANTIQO_VIDEO_RUNPOD_S3_ENDPOINT}${path}?${canonicalQuery}&X-Amz-Signature=${signature}`,
    expires_seconds: expires,
    bucket: AVANTIQO_VIDEO_RUNPOD_S3_BUCKET,
    region: AVANTIQO_VIDEO_RUNPOD_S3_REGION,
    volume_name: AVANTIQO_VIDEO_RUNPOD_S3_VOLUME_NAME,
    secrets_printed: false,
  };
}

export function avantiqoVideoRunpodVolumePath(key) {
  const clean = text(key).replace(/^\/+/, "");
  if (!clean) throw new Error("AVANTIQO_VIDEO_RUNPOD_S3_KEY_REQUIRED");
  return `/runpod-volume/${clean}`;
}

export function avantiqoVideoRunpodMasterObjectKeys(ownerRequestId) {
  const safe = text(ownerRequestId).replace(/[^A-Za-z0-9_-]/g, "");
  if (!safe) throw new Error("AVANTIQO_VIDEO_RUNPOD_MASTER_OWNER_REQUIRED");
  const root = `avantiqo-video-master/${safe}`;
  return {
    root,
    input_rgb: `${root}/input.rgb`,
    output_rgb: `${root}/output.rgb`,
    receipt: `${root}/receipt.json`,
  };
}

export async function deleteAvantiqoVideoRunpodVolumeObject(key) {
  const signed = presignAvantiqoVideoRunpodVolumeObject({ key, method: "DELETE", expires_seconds: 300 });
  const response = await fetch(signed.url, { method: "DELETE", signal: AbortSignal.timeout(120_000) });
  if (!response.ok && response.status !== 404) {
    throw new Error(`AVANTIQO_VIDEO_RUNPOD_S3_DELETE_HTTP_${response.status}`);
  }
  return { success: true, contract: AVANTIQO_VIDEO_RUNPOD_S3_CONTRACT, key: signed.key };
}
