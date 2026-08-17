import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const LOCAL_URL = /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\//i;
const VISUAL_EXTENSION = /\.(?:jpe?g|png|webp|gif|svg|avif|heic|mp4|mov|webm)(?:$|[?#\s])/i;
const VIDEO_EXTENSION = /\.(?:mp4|mov|webm)(?:$|[?#\s])/i;
const VISUAL_TYPES = [
  "image",
  "video",
  "photo",
  "poster",
  "graphic",
  "creative",
  "campaign_design",
  "campaign_media",
  "person",
  "logo",
  "design",
];

function decodePath(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseStorageReference(value) {
  if (!value) return null;

  const raw = String(value).trim();

  if (raw.startsWith("storage://")) {
    const rest = raw.slice("storage://".length);
    const separator = rest.indexOf("/");
    if (separator <= 0) return null;

    return {
      bucket: rest.slice(0, separator),
      path: rest.slice(separator + 1),
    };
  }

  try {
    const url = new URL(raw);
    if (!url.hostname.endsWith(".supabase.co")) return null;

    const marker = "/storage/v1/object/";
    const markerIndex = url.pathname.indexOf(marker);
    if (markerIndex < 0) return null;

    let rest = url.pathname.slice(markerIndex + marker.length);
    rest = rest.replace(/^(?:public|authenticated|sign)\//, "");

    const separator = rest.indexOf("/");
    if (separator <= 0) return null;

    return {
      bucket: decodePath(rest.slice(0, separator)),
      path: decodePath(rest.slice(separator + 1)),
    };
  } catch {
    return null;
  }
}

export function isCreativeVisualAsset(asset) {
  if (!asset || asset.archived === true) return false;

  const mimeType = String(asset.mime_type || "").toLowerCase();
  if (mimeType.startsWith("image/") || mimeType.startsWith("video/")) return true;
  if (mimeType.startsWith("audio/")) return false;

  const assetType = String(asset.asset_type || "").toLowerCase();
  if (assetType === "audio" || assetType.includes("audio")) return false;
  if (VISUAL_TYPES.some((type) => assetType === type || assetType.includes(type))) return true;

  const haystack = [
    asset.name,
    asset.file_name,
    asset.file_url,
    asset.image_url,
    asset.thumbnail_url,
    asset.uri,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return VISUAL_EXTENSION.test(haystack);
}

export function isVideoAsset(asset) {
  const mimeType = String(asset?.mime_type || "").toLowerCase();
  if (mimeType.startsWith("video/")) return true;

  const assetType = String(asset?.asset_type || "").toLowerCase();
  if (assetType.includes("video")) return true;

  const haystack = [
    asset?.name,
    asset?.file_name,
    asset?.file_url,
    asset?.image_url,
    asset?.thumbnail_url,
    asset?.uri,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return VIDEO_EXTENSION.test(haystack);
}

export async function resolveCreativeAssetPreviewUrl(asset, { expiresIn = 3600 } = {}) {
  const candidates = [
    asset?.thumbnail_url,
    asset?.image_url,
    asset?.file_url,
    asset?.uri,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const value = String(candidate).trim();
    if (!value || LOCAL_URL.test(value)) continue;

    const storageReference = parseStorageReference(value);
    if (storageReference) {
      const { data, error } = await supabaseAdmin.storage
        .from(storageReference.bucket)
        .createSignedUrl(storageReference.path, expiresIn);

      if (!error && data?.signedUrl) return data.signedUrl;
      continue;
    }

    if (/^https:\/\//i.test(value)) return value;
  }

  return null;
}
