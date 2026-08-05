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

function supabaseSignedStorageReference(value) {
  const source = text(value);
  if (!/^https:\/\//i.test(source)) return null;

  let parsed;
  try {
    parsed = new URL(source);
  } catch {
    return null;
  }

  const marker = "/storage/v1/object/sign/";
  const index = parsed.pathname.indexOf(marker);
  if (index < 0) return null;

  const remainder = parsed.pathname.slice(index + marker.length);
  const separator = remainder.indexOf("/");
  if (separator <= 0 || separator === remainder.length - 1) {
    throw new Error("CREATIVE_PROVIDER_INPUT_SIGNED_URL_INVALID");
  }

  return {
    bucket: decodeURIComponent(remainder.slice(0, separator)),
    path: remainder
      .slice(separator + 1)
      .split("/")
      .map((segment) => decodeURIComponent(segment))
      .join("/"),
  };
}

function directUrl(value) {
  if (typeof value === "string") return text(value);
  if (!value || typeof value !== "object") return "";
  return text(
    value.storage_reference ||
    value.storageReference ||
    value.storage_url ||
    value.storageUrl ||
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
  if (typeof value === "string") {
    const source = text(value);
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(source)) {
      return source;
    }
    return "";
  }
  if (!value || typeof value !== "object") return "";
  return text(value.asset_id || value.assetId || value.id);
}

function validateOrganizationPath(organizationId, path) {
  const expectedPrefix = `${organizationId}/`;
  if (!text(path).startsWith(expectedPrefix)) {
    throw new Error("CREATIVE_STORAGE_REFERENCE_ORGANIZATION_MISMATCH");
  }
}

function providerInputTtl() {
  const expiresIn = positiveInteger(
    process.env.CREATIVE_PROVIDER_INPUT_URL_TTL_SECONDS,
  );
  if (!expiresIn) {
    throw new Error("CREATIVE_PROVIDER_INPUT_URL_TTL_SECONDS_REQUIRED");
  }
  return expiresIn;
}

async function signParsedStorageReference({ organization_id, parsed }) {
  if (!organization_id) throw new Error("organization_id required");
  validateOrganizationPath(organization_id, parsed.path);

  const supabase = getServiceSupabase();
  const { data, error } = await supabase.storage
    .from(parsed.bucket)
    .createSignedUrl(parsed.path, providerInputTtl());
  if (error) throw error;
  if (!data?.signedUrl) {
    throw new Error("CREATIVE_PROVIDER_INPUT_SIGNED_URL_REQUIRED");
  }
  return data.signedUrl;
}

async function signStorageReference({ organization_id, reference }) {
  const parsed = storageReference(reference);
  if (!parsed) return reference;
  return signParsedStorageReference({ organization_id, parsed });
}

async function refreshSignedUrl({ organization_id, url }) {
  const parsed = supabaseSignedStorageReference(url);
  if (!parsed) return url;
  return signParsedStorageReference({ organization_id, parsed });
}

export async function resolveCreativeProviderAssetUrl({
  organization_id,
  value,
} = {}) {
  if (!organization_id) throw new Error("organization_id required");

  const direct = directUrl(value);
  if (direct.startsWith(STORAGE_PREFIX)) {
    return signStorageReference({ organization_id, reference: direct });
  }
  if (/^https?:\/\//i.test(direct)) {
    return refreshSignedUrl({ organization_id, url: direct });
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
  if (assetUrl.startsWith(STORAGE_PREFIX)) {
    return signStorageReference({ organization_id, reference: assetUrl });
  }
  if (/^https?:\/\//i.test(assetUrl)) {
    return refreshSignedUrl({ organization_id, url: assetUrl });
  }
  throw new Error("CREATIVE_PROVIDER_INPUT_ASSET_URL_UNSUPPORTED");
}

function candidatePriority(value) {
  const direct = directUrl(value);
  if (assetId(value)) return 0;
  if (direct.startsWith(STORAGE_PREFIX)) return 1;
  if (supabaseSignedStorageReference(direct)) return 2;
  if (/^https?:\/\//i.test(direct)) return 3;
  return 4;
}

export async function resolveFirstCreativeProviderAssetUrl({
  organization_id,
  values = [],
} = {}) {
  const candidates = (Array.isArray(values) ? values.flat(Infinity) : [values])
    .filter((value) => value !== undefined && value !== null && value !== "")
    .map((value, index) => ({ value, index, priority: candidatePriority(value) }))
    .sort((left, right) =>
      left.priority - right.priority || left.index - right.index,
    );

  for (const candidate of candidates) {
    const resolved = await resolveCreativeProviderAssetUrl({
      organization_id,
      value: candidate.value,
    });
    if (resolved) return resolved;
  }
  return null;
}

export const CreativeProviderAssetUrlRuntime = Object.freeze({
  storageReference,
  supabaseSignedStorageReference,
  candidatePriority,
});
