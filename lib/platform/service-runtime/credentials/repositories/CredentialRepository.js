import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

const TABLE = "provider_credentials";

function text(value) {
  return String(value ?? "").trim();
}

function activeCredential(row = {}) {
  const status = text(row.status).toUpperCase();
  return !status || [
    "ACTIVE",
    "CONNECTED",
    "HEALTHY",
    "VERIFIED",
  ].includes(status);
}

function timestamp(row = {}) {
  const value = Date.parse(
    row.updated_at ||
    row.created_at ||
    row.verified_at ||
    "",
  );
  return Number.isFinite(value) ? value : 0;
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

  if (error) throw error;
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

  if (error) throw error;
  return data;
}

export async function findActiveByProvider({
  provider_ids = [],
  organization_id = null,
} = {}) {
  const providerIds = [
    ...new Set(
      (Array.isArray(provider_ids) ? provider_ids : [provider_ids])
        .map(text)
        .filter(Boolean),
    ),
  ];

  if (!providerIds.length) return null;

  const {
    data,
    error,
  } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .in("provider_id", providerIds);

  if (error) throw error;

  const rows = (data || [])
    .filter(activeCredential)
    .filter((row) =>
      !row.organization_id ||
      !organization_id ||
      String(row.organization_id) === String(organization_id),
    );

  const organizationRows = organization_id
    ? rows.filter((row) =>
        row.organization_id &&
        String(row.organization_id) === String(organization_id),
      )
    : [];
  const globalRows = rows.filter((row) => !row.organization_id);
  const candidates = organizationRows.length
    ? organizationRows
    : globalRows.length
      ? globalRows
      : rows;

  return candidates
    .sort((left, right) => timestamp(right) - timestamp(left))[0] ||
    null;
}
