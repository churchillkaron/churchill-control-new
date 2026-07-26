import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { CreativeAssetsRuntime } from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";

const STORAGE_PREFIX = "storage://";

function text(value) {
  return String(value ?? "").trim();
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function storageReference(value) {
  const source = text(value);
  if (!source.startsWith(STORAGE_PREFIX)) return null;
  const remainder = source.slice(STORAGE_PREFIX.length);
  const separator = remainder.indexOf("/");
  if (separator <= 0 || separator === remainder.length - 1) {
    throw new Error("CREATIVE_STORAGE_REFERENCE_INVALID");
  }
  return {
    bucket: remainder.slice(0, separator),
    path: remainder.slice(separator + 1),
  };
}

function directUrl(value) {
  if (typeof value === "string") return text(value);
  if (!value || typeof value !== "object") return "";
  return text(
    value.file_url ||
    value.fileUrl ||
    value.image_url ||
    value.imageUrl ||
    value.video_url ||
    value.videoUrl ||
    value.audio_url ||
    value.audioUrl ||
    value.url,
  );
}

function assetId(value) {
  if (typeof value === "string") return text(value);
  if (!value || typeof value !== "object") return "";
  return text(value.asset_id || value.assetId || value.id);
}

async function signStorageReference({ organization_id, reference }) {
  const parsed = storageReference(reference);
  if (!parsed) return reference;
  if (!organization_id) throw new Error("organization_id required");

  const expectedPrefix = `${organization_id}/`;
  if (!parsed.path.startsWith(expectedPrefix)) {
    throw new Error("CREATIVE_STORAGE_REFERENCE_ORGANIZATION_MISMATCH");
  }

  const expiresIn = positiveInteger(
    process.env.CREATIVE_PROVIDER_INPUT_URL_TTL_SECONDS,
  );
  if (!expiresIn) {
    throw new Error("CREATIVE_PROVIDER_INPUT_URL_TTL_SECONDS_REQUIRED");
  }

  const supabase = getServiceSupabase();
  const { data, error } = await supabase.storage
    .from(parsed.bucket)
    .createSignedUrl(parsed.path, expiresIn);
  if (error) throw error;
  if (!data?.signedUrl) {
    throw new Error("CREATIVE_PROVIDER_INPUT_SIGNED_URL_REQUIRED");
  }
  return data.signedUrl;
}

export async function resolveCreativeProviderAssetUrl({
  organization_id,
  value,
} = {}) {
  if (!organization_id) throw new Error("organization_id required");

  const direct = directUrl(value);
  if (/^https?:\/\//i.test(direct)) return direct;
  if (direct.startsWith(STORAGE_PREFIX)) {
    return signStorageReference({ organization_id, reference: direct });
  }

  const id = assetId(value);
  if (!id) return null;
  const asset = await CreativeAssetsRuntime.get(id);
  if (!asset || String(asset.organization_id) !== String(organization_id)) {
    throw new Error("CREATIVE_PROVIDER_INPUT_ASSET_NOT_FOUND");
  }
  if (asset.archived === true || asset.disabled === true || asset.deleted_at) {
    throw new Error("CREATIVE_PROVIDER_INPUT_ASSET_UNAVAILABLE");
  }

  const assetUrl = directUrl(asset);
  if (!assetUrl) throw new Error("CREATIVE_PROVIDER_INPUT_ASSET_URL_REQUIRED");
  if (/^https?:\/\//i.test(assetUrl)) return assetUrl;
  if (assetUrl.startsWith(STORAGE_PREFIX)) {
    return signStorageReference({ organization_id, reference: assetUrl });
  }
  throw new Error("CREATIVE_PROVIDER_INPUT_ASSET_URL_UNSUPPORTED");
}

export async function resolveFirstCreativeProviderAssetUrl({
  organization_id,
  values = [],
} = {}) {
  const candidates = Array.isArray(values) ? values.flat(Infinity) : [values];
  for (const value of candidates) {
    if (value === undefined || value === null || value === "") continue;
    const resolved = await resolveCreativeProviderAssetUrl({
      organization_id,
      value,
    });
    if (resolved) return resolved;
  }
  return null;
}
