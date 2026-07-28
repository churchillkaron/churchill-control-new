export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  normalizeFinanceOrganizationProfile,
} from "@/lib/finance/organization-profile/FinanceOrganizationProfile";

const EDITABLE_FIELDS = new Set([
  "legal_name",
  "trading_name",
  "company_registration_number",
  "tax_registration_number",
  "registered_address_line1",
  "registered_address_line2",
  "city",
  "state_region",
  "postal_code",
  "country_code",
  "functional_currency",
  "reporting_currency",
  "accounting_standard",
  "fiscal_year_start_month",
  "timezone",
  "locale",
  "contact_email",
  "contact_phone",
  "website",
]);

function queryValue(searchParams, camel, snake) {
  return searchParams.get(camel) || searchParams.get(snake) || null;
}

function cleanText(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function uppercase(value) {
  return cleanText(value)?.toUpperCase() || null;
}

function normalizeUrl(value) {
  const normalized = cleanText(value);
  if (!normalized) return null;

  const candidate = /^https?:\/\//i.test(normalized)
    ? normalized
    : `https://${normalized}`;

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("Website must be a valid web address");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Website must use HTTP or HTTPS");
  }

  return parsed.toString().replace(/\/$/, "");
}

function normalizeEmail(value) {
  const normalized = cleanText(value)?.toLowerCase() || null;
  if (!normalized) return null;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error("Contact Email must be valid");
  }

  return normalized;
}

function normalizeLocale(value) {
  const normalized = cleanText(value);
  if (!normalized) return null;

  try {
    return new Intl.Locale(normalized).toString();
  } catch {
    throw new Error("Locale must be a valid BCP 47 locale");
  }
}

function normalizeTimezone(value) {
  const normalized = cleanText(value);
  if (!normalized) throw new Error("Timezone required");

  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: normalized }).format();
    return normalized;
  } catch {
    throw new Error("Timezone must be a valid IANA timezone");
  }
}

function normalizePayload(body = {}) {
  const payload = {};

  for (const [key, value] of Object.entries(body)) {
    if (!EDITABLE_FIELDS.has(key)) continue;
    payload[key] = value;
  }

  payload.legal_name = cleanText(payload.legal_name);
  payload.trading_name = cleanText(payload.trading_name);
  payload.company_registration_number = cleanText(
    payload.company_registration_number
  );
  payload.tax_registration_number = cleanText(payload.tax_registration_number);
  payload.registered_address_line1 = cleanText(payload.registered_address_line1);
  payload.registered_address_line2 = cleanText(payload.registered_address_line2);
  payload.city = cleanText(payload.city);
  payload.state_region = cleanText(payload.state_region);
  payload.postal_code = cleanText(payload.postal_code);
  payload.country_code = uppercase(payload.country_code);
  payload.functional_currency = uppercase(payload.functional_currency);
  payload.reporting_currency = uppercase(payload.reporting_currency);
  payload.accounting_standard = cleanText(payload.accounting_standard);
  payload.timezone = normalizeTimezone(payload.timezone);
  payload.locale = normalizeLocale(payload.locale) || "en-GB";
  payload.contact_email = normalizeEmail(payload.contact_email);
  payload.contact_phone = cleanText(payload.contact_phone);
  payload.website = normalizeUrl(payload.website);
  payload.fiscal_year_start_month = Number(payload.fiscal_year_start_month);

  return payload;
}

function validateRequired(payload) {
  const required = [
    ["legal_name", "Legal Name"],
    ["registered_address_line1", "Registered Address Line 1"],
    ["city", "City"],
    ["country_code", "Country"],
    ["functional_currency", "Functional Currency"],
    ["accounting_standard", "Accounting Standard"],
    ["timezone", "Timezone"],
    ["locale", "Locale"],
  ];

  for (const [key, label] of required) {
    if (!payload[key]) throw new Error(`${label} required`);
  }

  if (!/^[A-Z]{2}$/.test(payload.country_code)) {
    throw new Error("Country must be a two-letter ISO country code");
  }

  if (!Number.isInteger(payload.fiscal_year_start_month) ||
      payload.fiscal_year_start_month < 1 ||
      payload.fiscal_year_start_month > 12) {
    throw new Error("Fiscal Year Start Month must be a whole number from 1 to 12");
  }
}

async function validateCurrency(organizationId, code, label) {
  if (!code) return;

  const { data, error } = await supabaseAdmin
    .from("currencies")
    .select("id, code")
    .eq("code", code)
    .or(`organization_id.eq.${organizationId},organization_id.is.null`)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error(`${label} is not configured for this organisation`);
}

async function validateProfile({ organizationId, payload }) {
  validateRequired(payload);
  await validateCurrency(
    organizationId,
    payload.functional_currency,
    "Functional Currency"
  );
  await validateCurrency(
    organizationId,
    payload.reporting_currency,
    "Reporting Currency"
  );
}

function responseError(error, fallback) {
  const message = error?.message || fallback;
  const status = /required|must be|not configured|valid|whole number|country code/i.test(message)
    ? 400
    : 500;

  return NextResponse.json({ success: false, error: message }, { status });
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const access = await requireOrganizationAccess({
      organizationId: queryValue(searchParams, "organizationId", "organization_id"),
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error, rows: [] },
        { status: access.status }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("finance_organization_profiles")
      .select("*")
      .eq("organization_id", access.organizationId)
      .maybeSingle();

    if (error) throw error;

    const profile = normalizeFinanceOrganizationProfile(data);
    const row = profile
      ? {
          ...profile,
          name: profile.trading_name || profile.legal_name,
          title: profile.legal_name,
          code: [profile.country_code, profile.functional_currency]
            .filter(Boolean)
            .join(" · "),
        }
      : null;

    return NextResponse.json({
      success: true,
      organization_id: access.organizationId,
      rows: row ? [row] : [],
      record: row,
    });
  } catch (error) {
    return responseError(error, "Finance Organisation Profile load failed");
  }
}

async function save(request) {
  const body = await request.json();
  const access = await requireOrganizationAccess({
    organizationId: body.organizationId || body.organization_id,
    request,
  });

  if (!access.success) {
    return NextResponse.json(
      { success: false, error: access.error },
      { status: access.status }
    );
  }

  const payload = normalizePayload(body);
  await validateProfile({ organizationId: access.organizationId, payload });

  const record = {
    ...payload,
    organization_id: access.organizationId,
    created_by: access.user?.id || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from("finance_organization_profiles")
    .upsert(record, { onConflict: "organization_id" })
    .select("*")
    .single();

  if (error) throw error;

  return NextResponse.json({
    success: true,
    record: normalizeFinanceOrganizationProfile(data),
  });
}

export async function POST(request) {
  try {
    return await save(request);
  } catch (error) {
    return responseError(error, "Finance Organisation Profile save failed");
  }
}

export async function PATCH(request) {
  try {
    return await save(request);
  } catch (error) {
    return responseError(error, "Finance Organisation Profile update failed");
  }
}
