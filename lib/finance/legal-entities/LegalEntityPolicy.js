import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function cleanText(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function upper(value) {
  return cleanText(value)?.toUpperCase() || null;
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function validTimezone(value) {
  try {
    Intl.DateTimeFormat("en-GB", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function validLocale(value) {
  try {
    return Boolean(new Intl.Locale(value).baseName);
  } catch {
    return false;
  }
}

export function normalizeLegalEntityPayload(payload = {}) {
  return {
    code: upper(payload.code || payload.entity_code),
    legal_name: cleanText(payload.legal_name),
    display_name: cleanText(payload.display_name),
    registration_number: cleanText(payload.registration_number),
    tax_id: cleanText(
      payload.tax_id || payload.tax_number || payload.tax_registration_number
    ),
    country: upper(payload.country || payload.country_code),
    currency: upper(payload.currency || payload.base_currency),
    timezone: cleanText(payload.timezone),
    locale: cleanText(payload.locale),
    address: cleanText(payload.address),
    phone: cleanText(payload.phone),
    email: cleanText(payload.email)?.toLowerCase() || null,
    parent_entity_id: cleanText(payload.parent_entity_id),
    is_holding_company: normalizeBoolean(payload.is_holding_company, false),
    is_default_accounting_entity: normalizeBoolean(
      payload.is_default_accounting_entity,
      false
    ),
    is_active: normalizeBoolean(payload.is_active, true),
  };
}

async function assertConfiguredCurrency({ organizationId, currencyCode }) {
  const { data, error } = await supabaseAdmin
    .from("currencies")
    .select("id, code")
    .eq("code", currencyCode)
    .or(`organization_id.eq.${organizationId},organization_id.is.null`)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error("Functional Currency is not configured for this organisation");
  }
}

async function assertParentScope({ organizationId, parentEntityId, recordId }) {
  if (!parentEntityId) return;
  if (recordId && String(parentEntityId) === String(recordId)) {
    throw new Error("A Legal Entity cannot be its own parent");
  }

  const { data: parent, error } = await supabaseAdmin
    .from("legal_entities")
    .select("id, parent_entity_id, is_active")
    .eq("organization_id", organizationId)
    .eq("id", parentEntityId)
    .maybeSingle();

  if (error) throw error;
  if (!parent) throw new Error("Parent Legal Entity not found in this organisation");
  if (parent.is_active === false) throw new Error("Parent Legal Entity must be active");

  if (!recordId) return;

  let current = parent;
  const visited = new Set();

  while (current?.parent_entity_id) {
    if (visited.has(current.id)) {
      throw new Error("Legal Entity hierarchy contains a cycle");
    }
    visited.add(current.id);

    if (String(current.parent_entity_id) === String(recordId)) {
      throw new Error("Legal Entity hierarchy cannot contain a cycle");
    }

    const { data: next, error: nextError } = await supabaseAdmin
      .from("legal_entities")
      .select("id, parent_entity_id")
      .eq("organization_id", organizationId)
      .eq("id", current.parent_entity_id)
      .maybeSingle();

    if (nextError) throw nextError;
    current = next;
  }
}

async function assertUniqueFields({ organizationId, candidate, recordId }) {
  let query = supabaseAdmin
    .from("legal_entities")
    .select("id, code, registration_number, tax_id")
    .eq("organization_id", organizationId);

  if (recordId) query = query.neq("id", recordId);

  const { data, error } = await query.limit(1000);
  if (error) throw error;

  const rows = data || [];
  if (rows.some((row) => upper(row.code) === candidate.code)) {
    throw new Error("A Legal Entity with this code already exists");
  }
  if (
    candidate.registration_number &&
    rows.some(
      (row) =>
        cleanText(row.registration_number)?.toLowerCase() ===
        candidate.registration_number.toLowerCase()
    )
  ) {
    throw new Error("A Legal Entity with this registration number already exists");
  }
  if (
    candidate.tax_id &&
    rows.some(
      (row) => cleanText(row.tax_id)?.toLowerCase() === candidate.tax_id.toLowerCase()
    )
  ) {
    throw new Error("A Legal Entity with this tax registration already exists");
  }
}

export async function validateLegalEntityWrite({
  organizationId,
  payload,
  recordId = null,
}) {
  if (!organizationId) throw new Error("organizationId required");

  let existing = null;
  if (recordId) {
    const { data, error } = await supabaseAdmin
      .from("legal_entities")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("id", recordId)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error("Legal Entity not found");
    existing = data;
  }

  const candidate = normalizeLegalEntityPayload({ ...(existing || {}), ...payload });

  if (!candidate.code) throw new Error("Entity Code required");
  if (!/^[A-Z0-9][A-Z0-9._-]{0,31}$/.test(candidate.code)) {
    throw new Error("Entity Code must use 1-32 letters, numbers, dots, hyphens or underscores");
  }
  if (!candidate.legal_name) throw new Error("Registered Legal Name required");
  if (!candidate.country || !/^[A-Z]{2}$/.test(candidate.country)) {
    throw new Error("Country must use a two-letter country code");
  }
  if (!candidate.currency || !/^[A-Z]{3}$/.test(candidate.currency)) {
    throw new Error("Functional Currency must use a three-letter currency code");
  }
  if (!candidate.timezone || !validTimezone(candidate.timezone)) {
    throw new Error("Timezone must be a valid IANA timezone");
  }
  if (!candidate.locale || !validLocale(candidate.locale)) {
    throw new Error("Locale must be valid");
  }
  if (candidate.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate.email)) {
    throw new Error("Finance Contact Email must be valid");
  }
  if (candidate.is_default_accounting_entity && !candidate.is_active) {
    throw new Error("The default accounting entity must remain active");
  }

  await assertConfiguredCurrency({
    organizationId,
    currencyCode: candidate.currency,
  });
  await assertParentScope({
    organizationId,
    parentEntityId: candidate.parent_entity_id,
    recordId,
  });
  await assertUniqueFields({ organizationId, candidate, recordId });

  return candidate;
}

export function decorateLegalEntity(entity = {}) {
  return {
    ...entity,
    name: entity.display_name || entity.legal_name || "Legal Entity",
    title: entity.legal_name || entity.display_name || "Legal Entity",
    code: entity.code || entity.entity_code || null,
    country: entity.country || entity.country_code || null,
    currency: entity.currency || entity.base_currency || null,
    status: entity.is_active === false ? "INACTIVE" : "ACTIVE",
  };
}
