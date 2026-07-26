import { getServiceSupabase } from "@/lib/shared/supabase/service";

const STORAGE_PREFIX = "storage://";

function text(value) {
  return String(value ?? "").trim();
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

export function creativeStorageReference(value) {
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

export function creativeStorageUri(bucket, storagePath) {
  if (!text(bucket) || !text(storagePath)) {
    throw new Error("CREATIVE_STORAGE_LOCATION_REQUIRED");
  }
  return `${STORAGE_PREFIX}${text(bucket)}/${text(storagePath)}`;
}

function assertOrganizationPath(organizationId, storagePath) {
  if (!organizationId) throw new Error("organization_id required");
  if (!text(storagePath).startsWith(`${organizationId}/`)) {
    throw new Error("CREATIVE_STORAGE_REFERENCE_ORGANIZATION_MISMATCH");
  }
}

export async function downloadCreativeStorageReference({
  organization_id,
  reference,
} = {}) {
  const parsed = creativeStorageReference(reference);
  if (!parsed) throw new Error("CREATIVE_STORAGE_REFERENCE_REQUIRED");
  assertOrganizationPath(organization_id, parsed.path);
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.storage
    .from(parsed.bucket)
    .download(parsed.path);
  if (error) throw error;
  if (!data) throw new Error("CREATIVE_STORAGE_DOWNLOAD_REQUIRED");
  return {
    bucket: parsed.bucket,
    storage_path: parsed.path,
    blob: data,
  };
}

export async function signCreativeStorageReference({
  organization_id,
  reference,
  expires_in = null,
} = {}) {
  const parsed = creativeStorageReference(reference);
  if (!parsed) return reference;
  assertOrganizationPath(organization_id, parsed.path);
  const expiresIn = positiveInteger(
    expires_in ?? process.env.CREATIVE_PRIVATE_MEDIA_URL_TTL_SECONDS,
  );
  if (!expiresIn) {
    throw new Error("CREATIVE_PRIVATE_MEDIA_URL_TTL_SECONDS_REQUIRED");
  }
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.storage
    .from(parsed.bucket)
    .createSignedUrl(parsed.path, expiresIn);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("CREATIVE_PRIVATE_MEDIA_SIGNED_URL_REQUIRED");
  return data.signedUrl;
}
