import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

const TABLE = "provider_credentials";

function text(value) {
  return String(value ?? "").trim();
}

function metadataObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

export async function save(record) {
  const {
    data,
    error,
  } = await supabaseAdmin
    .from(TABLE)
    .upsert(record)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function get(id) {
  const {
    data,
    error,
  } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function getActiveByProviderAndId({
  provider_id,
  credential_id,
}) {
  const providerId = text(provider_id).toLowerCase();
  const credentialId = text(credential_id);

  if (!providerId) {
    throw new Error("provider_id required");
  }

  if (!credentialId) {
    throw new Error("credential_id required");
  }

  const {
    data,
    error,
  } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("id", credentialId)
    .eq("provider_id", providerId)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

export async function listActiveByProvider(provider_id) {
  const providerId = text(provider_id).toLowerCase();

  if (!providerId) {
    throw new Error("provider_id required");
  }

  const {
    data,
    error,
  } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("provider_id", providerId)
    .eq("status", "ACTIVE");

  if (error) {
    throw error;
  }

  return data || [];
}

export async function deactivateOtherActiveScopedCredentials({
  provider_id,
  organization_id,
  purpose,
  except_id = null,
}) {
  const providerId = text(provider_id).toLowerCase();
  const organizationId = text(organization_id);
  const normalizedPurpose = text(purpose).toUpperCase();
  const exceptId = text(except_id);

  if (!providerId) throw new Error("provider_id required");
  if (!organizationId) throw new Error("organization_id required");
  if (!normalizedPurpose) throw new Error("credential purpose required");

  const rows = await listActiveByProvider(providerId);
  const ids = rows
    .filter((row) => {
      const metadata = metadataObject(row?.metadata);
      return (
        text(row?.id) !== exceptId &&
        text(metadata.organization_id) === organizationId &&
        text(metadata.purpose).toUpperCase() === normalizedPurpose
      );
    })
    .map((row) => text(row.id))
    .filter(Boolean);

  if (!ids.length) return [];

  const {
    data,
    error,
  } = await supabaseAdmin
    .from(TABLE)
    .update({ status: "INACTIVE" })
    .in("id", ids)
    .select("id");

  if (error) {
    throw error;
  }

  return data || [];
}
