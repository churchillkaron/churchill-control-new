import {
  CreativeBrandRuntime,
} from "@/lib/creative/brand/runtime/CreativeBrandRuntime";
import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";
import {
  resolveEntity,
} from "@/lib/platform/entities/resolveEntity";
import {
  resolveFinanceOrganizationProfile,
} from "@/lib/finance/organization-profile/FinanceOrganizationProfile";

function first(...values) {
  return values.find(
    (value) => value !== undefined && value !== null && value !== ""
  );
}

export async function resolveBrand({
  organizationId,
  entityId,
}) {
  if (!organizationId) {
    return {};
  }

  const [brands, entity, organizationProfile] = await Promise.all([
    CreativeBrandRuntime.list({ organization_id: organizationId }),
    entityId
      ? resolveEntity({ organizationId, entityId })
      : Promise.resolve(null),
    resolveFinanceOrganizationProfile({ organizationId }),
  ]);

  const creativeBrand = brands?.[0] || null;

  const { data: paymentConfig } = await supabaseAdmin
    .from("organization_payment_config")
    .select(`
      payment_method,
      configuration
    `)
    .eq("organization_id", organizationId)
    .eq("payment_method", "bank_transfer")
    .eq("enabled", true)
    .maybeSingle();

  let logoUrl = null;

  if (creativeBrand?.logo_asset_id) {
    const { data: logoAsset } = await supabaseAdmin
      .from("creative_assets")
      .select(`
        id,
        image_url,
        file_url
      `)
      .eq("id", creativeBrand.logo_asset_id)
      .maybeSingle();

    logoUrl = logoAsset?.image_url || logoAsset?.file_url || null;
  }

  const legalName = first(
    entity?.legal_name,
    organizationProfile?.legal_name
  );
  const displayName = first(
    creativeBrand?.name,
    entity?.display_name,
    entity?.legal_name,
    organizationProfile?.trading_name,
    organizationProfile?.legal_name,
    "Company"
  );

  return {
    id: creativeBrand?.id || null,
    name: displayName,
    logo_asset_id: creativeBrand?.logo_asset_id || null,
    logo_url: logoUrl,
    colors: creativeBrand?.colors || [],
    fonts: creativeBrand?.fonts || [],
    voice_tone: creativeBrand?.voice_tone || "",
    style_keywords: creativeBrand?.style_keywords || [],
    currency_code: first(
      entity?.currency,
      organizationProfile?.functional_currency
    ),
    locale: first(
      entity?.locale,
      organizationProfile?.locale
    ),
    legal: {
      legal_name: legalName || null,
      tax_id: first(
        entity?.tax_id,
        organizationProfile?.tax_registration_number
      ) || null,
      registration_number: first(
        entity?.registration_number,
        organizationProfile?.company_registration_number
      ) || null,
      address: first(
        entity?.address,
        organizationProfile?.registered_address
      ) || null,
      country: first(
        entity?.country,
        organizationProfile?.country_code
      ) || null,
      currency: first(
        entity?.currency,
        organizationProfile?.functional_currency
      ) || null,
      phone: first(
        entity?.phone,
        organizationProfile?.contact_phone
      ) || null,
      email: first(
        entity?.email,
        organizationProfile?.contact_email
      ) || null,
    },
    payment: paymentConfig?.configuration || {},
    website: organizationProfile?.website || null,
    metadata: {
      ...(creativeBrand?.metadata || {}),
      accounting_standard: organizationProfile?.accounting_standard || null,
      reporting_currency: organizationProfile?.reporting_currency || null,
      fiscal_year_start_month:
        organizationProfile?.fiscal_year_start_month || null,
      timezone: organizationProfile?.timezone || null,
      locale: organizationProfile?.locale || null,
    },
  };
}
