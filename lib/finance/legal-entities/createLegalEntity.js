import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

function required(value, field) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    throw new Error(`${field} required`);
  }

  return normalized;
}

export default async function createLegalEntity({
  organization_id,
  code,
  legal_name,
  display_name = null,
  tax_id = null,
  registration_number = null,
  country,
  currency,
  address = null,
  phone = null,
  email = null,
  is_holding_company = false,
  is_default_accounting_entity = false,
}) {
  try {
    const organizationId = required(
      organization_id,
      "organization_id"
    );
    const entityCode = required(code, "code");
    const legalName = required(legal_name, "legal_name");
    const entityCountry = required(country, "country");
    const entityCurrency = required(currency, "currency")
      .toUpperCase();

    const { data: existing } =
      await supabaseAdmin
        .from("legal_entities")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("code", entityCode)
        .maybeSingle();

    if (existing) {
      return {
        success: true,
        entity: existing,
        existing: true,
      };
    }

    if (is_default_accounting_entity) {
      await supabaseAdmin
        .from("legal_entities")
        .update({
          is_default_accounting_entity: false,
          updated_at: new Date().toISOString(),
        })
        .eq("organization_id", organizationId);
    }

    const { data, error } =
      await supabaseAdmin
        .from("legal_entities")
        .insert([
          {
            organization_id: organizationId,
            code: entityCode,
            legal_name: legalName,
            display_name,
            tax_id,
            registration_number,
            country: entityCountry,
            currency: entityCurrency,
            address,
            phone,
            email,
            is_holding_company,
            is_default_accounting_entity,
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ])
        .select()
        .single();

    if (error) {
      throw error;
    }

    return {
      success: true,
      entity: data,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}
