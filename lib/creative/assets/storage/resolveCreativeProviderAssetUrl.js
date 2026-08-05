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

function decodeStoragePath(value) {
  return text(value)
    .split("/")
    .map((segment) => decodeURIComponent(segment))
    .join("/");
}

function currentSupabaseHost() {
  const source = text(
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    process.env.AVANTIQO_SUPABASE_URL,
  );
  if (!source) return null;
  try {
    return new URL(source).hostname.toLowerCase();
  } catch {
    return null;
  }
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
    bucket: decodeURIComponent(remainder.slice(0, separator)),
    path: decodeStoragePath(remainder.slice(separator + 1)),
    mode: "STORAGE_REFERENCE",
  };
}

function supabaseStorageReference(value) {
  const source = text(value);
  if (!/^https:\/\//i.test(source)) return null;

  let parsed;
  try {
    parsed = new URL(source);
  } catch {
    return null;
  }

  const expectedHost = currentSupabaseHost();
  if (expectedHost && parsed.hostname.toLowerCase() !== expectedHost) {
    return null;
  }

  const patterns = [
    /^\/storage\/v1\/object\/(sign|public|authenticated)\/([^/]+)\/(.+)$/,
    /^\/storage\/v1\/render\/image\/(public|authenticated)\/([^/]+)\/(.+)$/,
  ];

  for (const pattern of patterns) {
    const match = parsed.pathname.match(pattern);
    if (!match) continue;
    return {
      bucket: decodeURIComponent(match[2]),
      path: decodeStoragePath(match[3]),
      mode: text(match[1]).toUpperCase(),
      host: parsed.hostname,
    };
  }

  return null;
}

function supabaseSignedStorageReference(value) {
  const parsed = supabaseStorageReference(value);
  return parsed?.mode === "SIGN" ? parsed : null;
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
    value.url ||
    value.thumbnail_url ||
    value.thumbnailUrl,
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

function validateOrganizationPath(organizationId, objectPath) {
  const expectedPrefix = `${organizationId}/`;
  if (!text(objectPath).startsWith(expectedPrefix)) {
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

async function resolveDirectReference({ organization_id, direct }) {
  const storage = storageReference(direct);
  if (storage) {
    return signParsedStorageReference({ organization_id, parsed: storage });
  }

  const supabase = supabaseStorageReference(direct);
  if (supabase) {
    return signParsedStorageReference({ organization_id, parsed: supabase });
  }

  if (/^https?:\/\//i.test(direct)) return direct;
  return null;
}

export async function resolveCreativeProviderAssetUrl({
  organization_id,
  value,
} = {}) {
  if (!organization_id) throw new Error("organization_id required");

  const direct = directUrl(value);
  if (direct) {
    const resolvedDirect = await resolveDirectReference({
      organization_id,
      direct,
    });
    if (resolvedDirect) return resolvedDirect;
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
  const resolvedAsset = await resolveDirectReference({
    organization_id,
    direct: assetUrl,
  });
  if (resolvedAsset) return resolvedAsset;
  throw new Error("CREATIVE_PROVIDER_INPUT_ASSET_URL_UNSUPPORTED");
}

function candidatePriority(value) {
  const direct = directUrl(value);
  if (direct) return 0;
  if (assetId(value)) return 1;
  return 2;
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

export const CreativeProviderAssetUrlRuntime = Object.freeze({
  storageReference,
  supabaseStorageReference,
  supabaseSignedStorageReference,
  candidatePriority,
});
