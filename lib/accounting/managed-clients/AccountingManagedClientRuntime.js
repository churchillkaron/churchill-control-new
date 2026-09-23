import { randomUUID } from "crypto";
import { createOrganization } from "@/lib/organizations/createOrganization";
import { applyTaxSetup } from "@/lib/finance/tax/workflows/applyTaxSetup";
import createLegalEntity from "@/lib/finance/legal-entities/createLegalEntity";
import { createAccountingPeriod } from "@/lib/finance/createAccountingPeriod";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function clean(value) {
  return String(value ?? "").trim();
}

const ACCOUNTING_STANDARDS = new Set([
  "TFRS",
  "IFRS",
  "IFRS_FOR_SMES",
  "US_GAAP",
  "LOCAL_GAAP",
]);

function emailAddress(value) {
  const email = clean(value).toLowerCase();
  if (!email) return null;
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function currencyCode(value) {
  const code = clean(value).toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return null;
  try {
    if (typeof Intl.supportedValuesOf === "function" && !Intl.supportedValuesOf("currency").includes(code)) {
      return null;
    }
  } catch {}
  return code;
}

function countryIdentityKey(value) {
  const raw = clean(value);
  if (!raw) return null;
  if (/^[A-Za-z]{2}$/.test(raw)) {
    const code = raw.toUpperCase();
    try {
      const display = new Intl.DisplayNames(["en"], { type: "region" });
      const label = clean(display.of(code));
      if (!label || label.toUpperCase() === code || label.toLowerCase() === "unknown region") return null;
    } catch {}
    return code;
  }

  const aliases = new Map([
    ["thailand", "TH"],
    ["tha", "TH"],
    ["united states", "US"],
    ["united states of america", "US"],
    ["usa", "US"],
    ["united kingdom", "GB"],
    ["uk", "GB"],
    ["great britain", "GB"],
    ["singapore", "SG"],
    ["sweden", "SE"],
    ["norway", "NO"],
    ["united arab emirates", "AE"],
    ["uae", "AE"],
  ]);
  const wanted = raw.toLowerCase();
  if (aliases.has(wanted)) return aliases.get(wanted);

  try {
    const displays = ["en", "th", "sv"].map((locale) => new Intl.DisplayNames([locale], { type: "region" }));
    for (let first = 65; first <= 90; first += 1) {
      for (let second = 65; second <= 90; second += 1) {
        const code = String.fromCharCode(first, second);
        if (displays.some((display) => clean(display.of(code)).toLowerCase() === wanted)) return code;
      }
    }
  } catch {}

  return null;
}

function identityKey(value, country) {
  const normalized = clean(value).toUpperCase().normalize("NFKC").replace(/[^\p{L}\p{N}]/gu, "");
  const jurisdiction = countryIdentityKey(country);
  return normalized && jurisdiction ? `${jurisdiction}:${normalized}` : null;
}

function duplicateManagedClientError(kind) {
  const error = new Error(`This accounting firm already has a managed client with the same ${kind}.`);
  error.code = "MANAGED_CLIENT_DUPLICATE_IDENTITY";
  return error;
}

async function reserveIdentity({ firmId, kind, key, reservationToken }) {
  if (!key) return;
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const inserted = await supabaseAdmin
      .from("accounting_managed_client_identity_reservations")
      .insert({
        firm_organization_id: firmId,
        identity_kind: kind,
        identity_key: key,
        reservation_token: reservationToken,
        expires_at: expiresAt,
      });
    if (!inserted.error) return;
    if (inserted.error.code === "42P01") throw new Error("Managed-client database migration is not installed");
    if (inserted.error.code !== "23505") throw inserted.error;

    const existing = await supabaseAdmin
      .from("accounting_managed_client_identity_reservations")
      .select("id,expires_at")
      .eq("firm_organization_id", firmId)
      .eq("identity_kind", kind)
      .eq("identity_key", key)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (!existing.data) continue;

    const expired = new Date(existing.data.expires_at || 0).getTime() <= Date.now();
    if (!expired) throw duplicateManagedClientError(kind === "tax" ? "tax/VAT number" : "registration number");

    const cleared = await supabaseAdmin
      .from("accounting_managed_client_identity_reservations")
      .delete()
      .eq("id", existing.data.id)
      .lte("expires_at", new Date().toISOString());
    if (cleared.error) throw cleared.error;
  }

  throw duplicateManagedClientError(kind === "tax" ? "tax/VAT number" : "registration number");
}

async function releaseIdentityReservations(reservationToken) {
  if (!reservationToken) return;
  const released = await supabaseAdmin
    .from("accounting_managed_client_identity_reservations")
    .delete()
    .eq("reservation_token", reservationToken);
  if (released.error && released.error.code !== "42P01") throw released.error;
}

function entityCode(name, organizationId) {
  const prefix = clean(name).replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 4) || "CLNT";
  const suffix = clean(organizationId).replace(/-/g, "").toUpperCase().slice(0, 8);
  return `${prefix}-${suffix}`;
}

function fiscalDates(startMonth = 1, now = new Date()) {
  const month = Math.min(12, Math.max(1, Number(startMonth) || 1));
  const currentMonth = now.getUTCMonth() + 1;
  const startYear = currentMonth >= month ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const start = new Date(Date.UTC(startYear, month - 1, 1));
  const end = new Date(Date.UTC(startYear + 1, month - 1, 0));
  return { fiscalYear: startYear, startDate: start.toISOString().slice(0,10), endDate: end.toISOString().slice(0,10) };
}
export async function createManagedAccountingClient({
  firmOrganizationId,
  createdByAuthUserId,
  legalName,
  registrationNumber = null,
  taxNumber = null,
  contactEmail = null,
  country,
  currency,
  accountingStandard,
  fiscalYearStartMonth = 1,
  billingModel = "firm_pays",
}) {
  const name = clean(legalName);
  const firmId = clean(firmOrganizationId);
  const normalizedCountry = clean(country);
  const countryCode = countryIdentityKey(normalizedCountry);
  const normalizedCurrency = currencyCode(currency);
  const standard = clean(accountingStandard).toUpperCase();
  const fiscalMonth = Number(fiscalYearStartMonth);
  const normalizedContactEmail = clean(contactEmail) ? emailAddress(contactEmail) : null;

  if (!firmId || !name || !normalizedCountry || !standard) {
    throw new Error("Firm, legal name, country, currency and accounting standard are required");
  }
  if (!countryCode) {
    throw new Error("Country must be a recognized country name or two-letter ISO code");
  }
  if (!normalizedCurrency) {
    throw new Error("Base currency must be a valid three-letter ISO currency code");
  }
  if (!ACCOUNTING_STANDARDS.has(standard)) {
    throw new Error("Unsupported accounting standard");
  }
  if (!Number.isInteger(fiscalMonth) || fiscalMonth < 1 || fiscalMonth > 12) {
    throw new Error("Fiscal year start month must be an integer from 1 to 12");
  }
  if (clean(contactEmail) && !normalizedContactEmail) {
    throw new Error("Client contact email is invalid");
  }
  if (!["firm_pays","client_pays"].includes(billingModel)) {
    throw new Error("Invalid billing model");
  }

  const registrationKey = identityKey(registrationNumber, countryCode);
  const taxKey = identityKey(taxNumber, countryCode);

  const reservationToken = registrationKey || taxKey ? randomUUID() : null;
  let organization = null;
  let relationship = null;
  try {
    const schemaProbe = await supabaseAdmin
      .from("accounting_managed_clients")
      .select("id")
      .limit(1);
    if (schemaProbe.error?.code === "42P01") {
      throw new Error("Managed-client database migration is not installed");
    }
    if (schemaProbe.error) throw schemaProbe.error;

    if (registrationKey || taxKey) {
      const filters = [];
      if (registrationKey) filters.push(`registration_number_key.eq.${registrationKey}`);
      if (taxKey) filters.push(`tax_number_key.eq.${taxKey}`);
      const duplicate = await supabaseAdmin
        .from("accounting_managed_clients")
        .select("id,registration_number_key,tax_number_key")
        .eq("firm_organization_id", firmId)
        .neq("management_status", "ARCHIVED")
        .or(filters.join(","))
        .limit(1)
        .maybeSingle();
      if (duplicate.error?.code === "42P01") {
        throw new Error("Managed-client database migration is not installed");
      }
      if (duplicate.error) throw duplicate.error;
      if (duplicate.data) {
        if (registrationKey && duplicate.data.registration_number_key === registrationKey) {
          throw duplicateManagedClientError("registration number");
        }
        if (taxKey && duplicate.data.tax_number_key === taxKey) {
          throw duplicateManagedClientError("tax/VAT number");
        }
        throw duplicateManagedClientError("legal identity");
      }

      await reserveIdentity({ firmId, kind: "registration", key: registrationKey, reservationToken });
      await reserveIdentity({ firmId, kind: "tax", key: taxKey, reservationToken });
    }

    organization = await createOrganization({
      name,
      organizationType: "client_company",
      legalName: name,
      country: normalizedCountry,
      status: "provisioning",
      organizationStatus: "PROVISIONING",
    });

    const taxSetup = await applyTaxSetup({
      organizationId: organization.id,
      taxRegime: countryCode === "TH" ? "THAILAND" : "UNCONFIGURED",
      accountingStandard: standard,
      accountingMode: "managed_accounting_client",
      baseCurrency: normalizedCurrency,
    });
    if (!taxSetup?.success) throw new Error(taxSetup?.error || "Tax and accounting setup failed");

    const legalEntityResult = await createLegalEntity({
      organization_id: organization.id,
      code: entityCode(name, organization.id),
      legal_name: name,
      display_name: name,
      country: normalizedCountry,
      currency: normalizedCurrency,
      email: normalizedContactEmail,
      is_holding_company: false,
      is_default_accounting_entity: true,
    });
    if (!legalEntityResult?.success) throw new Error(legalEntityResult?.error || "Legal entity setup failed");
    const dates = fiscalDates(fiscalMonth);
    const period = await createAccountingPeriod({
      organization_id: organization.id,
      entity_id: legalEntityResult.entity.id,
      fiscal_year: dates.fiscalYear,
      period_number: 1,
      period_name: `${dates.fiscalYear}/${dates.fiscalYear + 1}`,
      start_date: dates.startDate,
      end_date: dates.endDate,
      status: "OPEN",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const relationshipResult = await supabaseAdmin
      .from("organization_clients")
      .upsert({
        firm_organization_id: firmId,
        client_organization_id: organization.id,
        relationship_status: "inactive",
        billing_model: billingModel,
      }, { onConflict: "firm_organization_id,client_organization_id" })
      .select("id,firm_organization_id,client_organization_id,relationship_status,billing_model")
      .single();
    if (relationshipResult.error) throw relationshipResult.error;
    relationship = relationshipResult.data;
    const managedResult = await supabaseAdmin
      .from("accounting_managed_clients")
      .insert({
        firm_organization_id: firmId,
        client_organization_id: organization.id,
        organization_client_relationship_id: relationship.id,
        management_status: "UNCLAIMED",
        contact_email: normalizedContactEmail,
        registration_number: clean(registrationNumber) || null,
        registration_number_key: registrationKey,
        tax_number: clean(taxNumber) || null,
        tax_number_key: taxKey,
        fiscal_year_start_month: fiscalMonth,
        created_by_auth_user_id: createdByAuthUserId || null,
      })
      .select("*")
      .single();
    if (managedResult.error) {
      if (managedResult.error.code === "23505") {
        const detail = String(managedResult.error.details || managedResult.error.message || "").toLowerCase();
        if (detail.includes("registration")) throw duplicateManagedClientError("registration number");
        if (detail.includes("tax")) throw duplicateManagedClientError("tax/VAT number");
        throw duplicateManagedClientError("legal identity");
      }
      throw managedResult.error;
    }

    const setupActivation = await supabaseAdmin.rpc(
      "activate_accounting_managed_client_setup",
      {
        p_managed_client_id: managedResult.data.id,
        p_relationship_id: relationship.id,
        p_organization_id: organization.id,
        p_firm_organization_id: firmId,
      }
    );
    if (setupActivation.error) throw setupActivation.error;
    const activationRow = Array.isArray(setupActivation.data)
      ? setupActivation.data[0] || null
      : setupActivation.data || null;
    if (
      !activationRow?.managed_client_id ||
      activationRow.relationship_status !== "active" ||
      activationRow.organization_status !== "ACTIVE"
    ) {
      throw new Error("Managed client setup did not activate atomically");
    }

    organization = {
      ...organization,
      status: "active",
      organization_status: "ACTIVE",
    };
    relationship = {
      ...relationship,
      relationship_status: "active",
    };

    return {
      organization,
      relationship,
      managedClient: managedResult.data,
      entity: legalEntityResult.entity,
      period,
    };
  } catch (error) {
    if (relationship?.id) {
      try {
        await supabaseAdmin
          .from("organization_clients")
          .update({ relationship_status: "inactive" })
          .eq("id", relationship.id)
          .eq("firm_organization_id", firmId)
          .eq("client_organization_id", organization?.id || relationship.client_organization_id);
      } catch {}
      try {
        await supabaseAdmin
          .from("organization_clients")
          .delete()
          .eq("id", relationship.id)
          .eq("firm_organization_id", firmId);
      } catch {}
    }
    if (organization?.id) {
      await supabaseAdmin.from("organizations").update({
        status: "setup_failed",
        organization_status: "SETUP_FAILED",
      }).eq("id", organization.id).neq("organization_status", "ACTIVE");
    }
    throw error;
  } finally {
    if (reservationToken) {
      await releaseIdentityReservations(reservationToken).catch(() => {});
    }
  }
}

export async function listManagedAccountingClients(firmOrganizationId) {
  const { data, error } = await supabaseAdmin
    .from("accounting_managed_clients")
    .select("id,firm_organization_id,client_organization_id,organization_client_relationship_id,management_status,contact_email,registration_number,tax_number,fiscal_year_start_month,claim_email,claim_expires_at,claim_invited_at,created_at,claimed_at")
    .eq("firm_organization_id", firmOrganizationId)
    .neq("management_status", "ARCHIVED")
    .order("created_at", { ascending: false });
  if (error) {
    if (error.code === "42P01") return [];
    throw error;
  }

  const ids = [...new Set((data || []).map((row) => row.client_organization_id).filter(Boolean))];
  const orgs = ids.length
    ? await supabaseAdmin.from("organizations").select("id,name,legal_name,country,organization_status,status").in("id", ids)
    : { data: [], error: null };
  if (orgs.error) throw orgs.error;
  const byId = new Map((orgs.data || []).map((org) => [String(org.id), org]));
  return (data || []).map((row) => ({ ...row, client: byId.get(String(row.client_organization_id)) || null }));
}
