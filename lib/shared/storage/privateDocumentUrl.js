import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export function parsePrivateStorageReference(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^storage:\/\/([^/]+)\/(.+)$/);
  if (!match) return null;
  return { bucket: match[1], path: match[2] };
}

export async function signedStorageReference(value, expiresIn = 900) {
  const reference = parsePrivateStorageReference(value);
  if (!reference) return value || null;

  const { data, error } = await supabaseAdmin.storage
    .from(reference.bucket)
    .createSignedUrl(reference.path, expiresIn);
  if (error) throw error;
  return data?.signedUrl || null;
}
