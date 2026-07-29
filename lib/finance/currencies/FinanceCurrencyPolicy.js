import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const IGNORABLE_SCHEMA_CODES = new Set([
  "42P01",
  "42703",
  "PGRST204",
  "PGRST205",
]);

function cleanText(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function upper(value) {
  return cleanText(value)?.toUpperCase() || null;
}

function normalizeBoolean(value, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "on", "active"].includes(
    String(value).trim().toLowerCase()
  );
}

function supportedCurrencyCodes() {
  if (typeof Intl.supportedValuesOf !== "function") return null;

  try {
    return new Set(Intl.supportedValuesOf("currency"));
  } catch {
    return null;
  }
}

function assertCurrencyCode(code) {
  if (!code || !/^[A-Z]{3}$/.test(code)) {
    throw new Error("Currency Code must use three uppercase letters");
  }

  const supported = supportedCurrencyCodes();
  if (supported && !supported.has(code)) {
    throw new Error("Currency Code is not recognised by the runtime currency standard");
  }

  try {
    new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: code,
    }).format(0);
  } catch {
    throw new Error("Currency Code is not valid");
  }
}

function defaultMinorUnits(code) {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: code,
    }).resolvedOptions().maximumFractionDigits;
  } catch {
    return 2;
  }
}

function defaultSymbol(code) {
  try {
    const part = new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
    })
      .formatToParts(0)
      .find((item) => item.type === "currency");

    return cleanText(part?.value);
  } catch {
    return null;
  }
}

export function normalizeFinanceCurrencyPayload(payload = {}) {
  const code = upper(payload.code || payload.currency_code);
  const decimalsValue =
    payload.decimal_places === undefined ||
    payload.decimal_places === null ||
    payload.decimal_places === ""
      ? code
        ? defaultMinorUnits(code)
        : null
      : Number(payload.decimal_places);

  return {
    code,
    name: cleanText(payload.name || payload.currency_name),
    symbol: cleanText(payload.symbol) || (code ? defaultSymbol(code) : null),
    decimal_places: decimalsValue,
    is_active: normalizeBoolean(payload.is_active, true),
  };
}

export function decorateFinanceCurrency(row = {}) {
  const code = upper(row.code);

  return {
    ...row,
    code,
    name: cleanText(row.name) || code || "Currency",
    title: code ? `${code} Currency` : "Currency",
    status: row.is_active === false ? "INACTIVE" : "ACTIVE",
    source_scope: row.organization_id ? "ORGANISATION" : "SYSTEM_REFERENCE",
  };
}

export async function listFinanceCurrencies({
  organizationId,
  includeInactive = true,
} = {}) {
  if (!organizationId) throw new Error("organizationId required");

  const { data, error } = await supabaseAdmin
    .from("currencies")
    .select("*")
    .or(`organization_id.eq.${organizationId},organization_id.is.null`)
    .order("code", { ascending: true });

  if (error) throw error;

  const byCode = new Map();

  for (const raw of data || []) {
    const row = decorateFinanceCurrency(raw);
    if (!row.code) continue;

    const current = byCode.get(row.code);
    const isOrganisationOverride = String(row.organization_id || "") === String(organizationId);
    const currentIsOrganisationOverride =
      String(current?.organization_id || "") === String(organizationId);

    if (!current || (isOrganisationOverride && !currentIsOrganisationOverride)) {
      byCode.set(row.code, row);
    }
  }

  return [...byCode.values()]
    .filter((row) => includeInactive || row.is_active !== false)
    .sort((left, right) => String(left.code).localeCompare(String(right.code)));
}

async function loadCurrencyRow({ organizationId, recordId }) {
  if (!recordId) return null;

  const { data, error } = await supabaseAdmin
    .from("currencies")
    .select("*")
    .eq("id", recordId)
    .or(`organization_id.eq.${organizationId},organization_id.is.null`)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Currency not found");

  return data;
}

async function hasReference({ table, column, organizationId, code, activeColumn = null }) {
  let query = supabaseAdmin
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq(column, code);

  if (activeColumn) query = query.neq(activeColumn, false);

  const { count, error } = await query;

  if (error) {
    if (IGNORABLE_SCHEMA_CODES.has(String(error.code || ""))) return false;
    throw error;
  }

  return Number(count || 0) > 0;
}

async function assertCurrencyCanDeactivate({ organizationId, code }) {
  const checks = [
    ["legal_entities", "currency", "is_active"],
    ["finance_organization_profiles", "functional_currency", null],
    ["finance_organization_profiles", "reporting_currency", null],
    ["bank_accounts", "currency_code", "is_active"],
  ];

  for (const [table, column, activeColumn] of checks) {
    if (
      await hasReference({
        table,
        column,
        organizationId,
        code,
        activeColumn,
      })
    ) {
      throw new Error(
        "Currency cannot be deactivated while it is used by an active Finance configuration"
      );
    }
  }
}

async function currencyHasAccountingHistory({ organizationId, code }) {
  const checks = [
    ["journal_entries", "currency_code"],
    ["customer_invoices", "currency_code"],
    ["vendor_invoices", "currency_code"],
    ["bank_accounts", "currency_code"],
    ["finance_exchange_rates", "base_currency"],
    ["finance_exchange_rates", "quote_currency"],
  ];

  for (const [table, column] of checks) {
    if (await hasReference({ table, column, organizationId, code })) return true;
  }

  return false;
}

export async function validateFinanceCurrencyWrite({
  organizationId,
  payload,
  recordId = null,
}) {
  if (!organizationId) throw new Error("organizationId required");

  const existing = await loadCurrencyRow({ organizationId, recordId });
  const normalized = normalizeFinanceCurrencyPayload({
    ...(existing || {}),
    ...(payload || {}),
  });

  assertCurrencyCode(normalized.code);

  if (!normalized.name) throw new Error("Currency Name required");
  if (normalized.name.length > 100) {
    throw new Error("Currency Name must not exceed 100 characters");
  }
  if (normalized.symbol && normalized.symbol.length > 12) {
    throw new Error("Currency Symbol must not exceed 12 characters");
  }
  if (
    !Number.isInteger(normalized.decimal_places) ||
    normalized.decimal_places < 0 ||
    normalized.decimal_places > 6
  ) {
    throw new Error("Minor Unit Decimal Places must be a whole number from 0 to 6");
  }

  if (existing) {
    const existingCode = upper(existing.code);
    const codeChanged = existingCode !== normalized.code;
    const decimalsChanged =
      Number(existing.decimal_places ?? defaultMinorUnits(existingCode)) !==
      normalized.decimal_places;

    if (
      (codeChanged || decimalsChanged) &&
      (await currencyHasAccountingHistory({ organizationId, code: existingCode }))
    ) {
      throw new Error(
        "Currency Code and decimal precision cannot change after accounting usage exists"
      );
    }
  }

  if (!normalized.is_active) {
    await assertCurrencyCanDeactivate({
      organizationId,
      code: normalized.code,
    });
  }

  const { data: existingOverrides, error: duplicateError } = await supabaseAdmin
    .from("currencies")
    .select("id, code")
    .eq("organization_id", organizationId)
    .eq("code", normalized.code)
    .limit(5);

  if (duplicateError) throw duplicateError;

  const duplicate = (existingOverrides || []).find(
    (row) => !recordId || String(row.id) !== String(recordId)
  );

  if (duplicate && !existing?.organization_id) {
    return {
      normalized,
      existingOverrideId: duplicate.id,
      sourceRow: existing,
    };
  }

  if (duplicate) {
    throw new Error("This organisation already has a Currency record for this code");
  }

  return {
    normalized,
    existingOverrideId: null,
    sourceRow: existing,
  };
}

export async function upsertFinanceCurrency({
  organizationId,
  payload,
  recordId = null,
  actorId = null,
}) {
  const validation = await validateFinanceCurrencyWrite({
    organizationId,
    payload,
    recordId,
  });

  const values = {
    organization_id: organizationId,
    ...validation.normalized,
    updated_at: new Date().toISOString(),
    updated_by: actorId,
  };

  const targetId = validation.sourceRow?.organization_id
    ? validation.sourceRow.id
    : validation.existingOverrideId;

  const query = targetId
    ? supabaseAdmin
        .from("currencies")
        .update(values)
        .eq("organization_id", organizationId)
        .eq("id", targetId)
    : supabaseAdmin.from("currencies").insert({
        ...values,
        created_at: new Date().toISOString(),
        created_by: actorId,
      });

  const { data, error } = await query.select("*").single();
  if (error) throw error;

  return decorateFinanceCurrency(data);
}

export async function setFinanceCurrencyActive({
  organizationId,
  recordId,
  active,
  actorId = null,
}) {
  const source = await loadCurrencyRow({ organizationId, recordId });
  const payload = normalizeFinanceCurrencyPayload({
    ...source,
    is_active: active,
  });

  return upsertFinanceCurrency({
    organizationId,
    payload,
    recordId,
    actorId,
  });
}

export async function resolveActiveFinanceCurrency({ organizationId, code }) {
  const normalizedCode = upper(code);
  if (!organizationId || !normalizedCode) return null;

  const rows = await listFinanceCurrencies({
    organizationId,
    includeInactive: false,
  });

  return rows.find((row) => row.code === normalizedCode) || null;
}
