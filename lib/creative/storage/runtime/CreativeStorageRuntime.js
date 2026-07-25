import dns from "node:dns/promises";
import net from "node:net";
import { createHash } from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const BUCKET = "creative-assets";
const DEFAULT_SIGNED_URL_SECONDS = 3600;
const DEFAULT_MAX_BYTES = 250 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 120000;
const MAX_REDIRECTS = 3;

function safeFilename(value = "asset.bin") {
  return String(value || "asset.bin")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "asset.bin";
}

function required(value, name) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${name} required`);
  return normalized;
}

function configuredHosts() {
  return new Set(
    String(process.env.CREATIVE_PROVIDER_ASSET_HOSTS || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

function isPrivateAddress(address) {
  const family = net.isIP(address);
  if (family === 4) {
    const parts = address.split(".").map(Number);
    return parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      parts[0] === 0;
  }
  if (family === 6) {
    const normalized = address.toLowerCase();
    return normalized === "::1" || normalized.startsWith("fc") ||
      normalized.startsWith("fd") || normalized.startsWith("fe80:");
  }
  return true;
}

async function validateRemoteUrl(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") {
    throw new Error("PROVIDER_ASSET_HTTPS_REQUIRED");
  }

  const hostname = parsed.hostname.toLowerCase();
  const hosts = configuredHosts();
  if (!hosts.size) throw new Error("CREATIVE_PROVIDER_ASSET_HOSTS_REQUIRED");
  if (!hosts.has(hostname)) throw new Error("PROVIDER_ASSET_HOST_NOT_ALLOWED");

  const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error("PROVIDER_ASSET_PRIVATE_ADDRESS_BLOCKED");
  }

  return parsed;
}

function assetPath({ organization_id, creative_project_id, asset_id, filename, checksum }) {
  return [
    required(organization_id, "organization_id"),
    required(creative_project_id, "creative_project_id"),
    required(asset_id, "asset_id"),
    `${required(checksum, "checksum").slice(0, 20)}-${safeFilename(filename)}`,
  ].join("/");
}

function allowedMimeType(contentType) {
  const normalized = String(contentType || "").split(";")[0].trim().toLowerCase();
  const allowed = new Set([
    "image/jpeg", "image/png", "image/webp", "image/gif",
    "video/mp4", "video/quicktime", "video/webm",
    "audio/mpeg", "audio/wav", "audio/mp4",
    "application/octet-stream",
  ]);
  if (!allowed.has(normalized)) throw new Error("PROVIDER_ASSET_MIME_NOT_ALLOWED");
  return normalized;
}

async function readLimitedBody(response, maxBytes) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > maxBytes) throw new Error("PROVIDER_ASSET_TOO_LARGE");

  const reader = response.body?.getReader();
  if (!reader) throw new Error("PROVIDER_ASSET_BODY_MISSING");
  const chunks = [];
  let total = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("PROVIDER_ASSET_TOO_LARGE");
    }
    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks, total);
}

async function fetchValidated(url, redirectCount = 0) {
  const parsed = await validateRemoteUrl(url);
  const response = await fetch(parsed, {
    redirect: "manual",
    signal: AbortSignal.timeout(Number(process.env.CREATIVE_PROVIDER_ASSET_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)),
  });

  if (response.status >= 300 && response.status < 400) {
    if (redirectCount >= MAX_REDIRECTS) throw new Error("PROVIDER_ASSET_TOO_MANY_REDIRECTS");
    const location = response.headers.get("location");
    if (!location) throw new Error("PROVIDER_ASSET_REDIRECT_LOCATION_MISSING");
    return fetchValidated(new URL(location, parsed).toString(), redirectCount + 1);
  }

  if (!response.ok) throw new Error(`PROVIDER_ASSET_DOWNLOAD_FAILED_${response.status}`);
  return response;
}

async function createSignedUrl(storagePath, expiresIn = DEFAULT_SIGNED_URL_SECONDS) {
  const normalizedExpiry = Math.max(60, Math.min(Number(expiresIn || DEFAULT_SIGNED_URL_SECONDS), 86400));
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(required(storagePath, "storage_path"), normalizedExpiry);
  if (error) throw error;
  return { signed_url: data.signedUrl, expires_in: normalizedExpiry };
}

async function uploadBuffer({
  organization_id,
  creative_project_id,
  asset_id,
  filename,
  buffer,
  content_type,
}) {
  const normalizedBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (!normalizedBuffer.length) throw new Error("PROVIDER_ASSET_EMPTY");

  const checksum = createHash("sha256").update(normalizedBuffer).digest("hex");
  const normalizedType = allowedMimeType(content_type || "application/octet-stream");
  const storagePath = assetPath({
    organization_id,
    creative_project_id,
    asset_id,
    filename: filename || "provider-output.bin",
    checksum,
  });

  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(
    storagePath,
    normalizedBuffer,
    {
      upsert: false,
      contentType: normalizedType,
      cacheControl: "31536000",
    },
  );

  if (error && !String(error.message || "").toLowerCase().includes("already exists")) {
    throw error;
  }

  return {
    storage_path: storagePath,
    checksum,
    byte_size: normalizedBuffer.length,
    content_type: normalizedType,
    delivery_mode: "PRIVATE_SIGNED_URL",
  };
}

export const CreativeStorageRuntime = {
  uploadBuffer,
  createSignedUrl,

  async uploadFromUrl({
    organization_id,
    creative_project_id,
    asset_id,
    url,
    filename = "provider-output.bin",
    max_bytes = null,
  }) {
    const response = await fetchValidated(required(url, "provider asset url"));
    const maxBytes = Math.max(
      1024,
      Math.min(Number(max_bytes || process.env.CREATIVE_PROVIDER_ASSET_MAX_BYTES || DEFAULT_MAX_BYTES), 1073741824),
    );
    const contentType = allowedMimeType(response.headers.get("content-type") || "application/octet-stream");
    const buffer = await readLimitedBody(response, maxBytes);
    return uploadBuffer({
      organization_id,
      creative_project_id,
      asset_id,
      filename,
      buffer,
      content_type: contentType,
    });
  },
};
