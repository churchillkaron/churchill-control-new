import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function cleanText(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function upper(value) {
  return cleanText(value)?.toUpperCase() || null;
}

export function formatFinanceRegisteredAddress(profile = {}) {
  return [
    cleanText(profile.registered_address_line1),
    cleanText(profile.registered_address_line2),
    [cleanText(profile.city), cleanText(profile.state_region)]
      .filter(Boolean)
      .join(", "),
    cleanText(profile.postal_code),
    upper(profile.country_code),
  ]
    .filter(Boolean)
    .join("\n");
}

export function normalizeFinanceOrganizationProfile(profile = {}) {
  if (!profile) return null;

  return {
    ...profile,
    legal_name: cleanText(profile.legal_name),
    trading_name: cleanText(profile.trading_name),
    company_registration_number: cleanText(
      profile.company_registration_number
    ),
    tax_registration_number: cleanText(profile.tax_registration_number),
    registered_address_line1: cleanText(profile.registered_address_line1),
    registered_address_line2: cleanText(profile.registered_address_line2),
    city: cleanText(profile.city),
    state_region: cleanText(profile.state_region),
    postal_code: cleanText(profile.postal_code),
    country_code: upper(profile.country_code),
    functional_currency: upper(profile.functional_currency),
    reporting_currency: upper(profile.reporting_currency),
    accounting_standard: cleanText(profile.accounting_standard),
    timezone: cleanText(profile.timezone),
    locale: cleanText(profile.locale),
    contact_email: cleanText(profile.contact_email)?.toLowerCase() || null,
    contact_phone: cleanText(profile.contact_phone),
    website: cleanText(profile.website),
    registered_address: formatFinanceRegisteredAddress(profile),
  };
}

export async function resolveFinanceOrganizationProfile({
  organizationId,
  required = false,
} = {}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  const { data, error } = await supabaseAdmin
    .from("finance_organization_profiles")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw error;

  const profile = normalizeFinanceOrganizationProfile(data);

  if (required && !profile) {
    throw new Error("Finance Organisation Profile is not configured");
  }

  return profile;
}

export default resolveFinanceOrganizationProfile;
