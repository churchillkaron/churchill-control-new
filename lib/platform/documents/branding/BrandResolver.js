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

async function resolvedCreativeAssetUrl(asset) {
  if (!asset) return null;
  const storagePath = asset?.metadata?.storage_path || null;
  const bucket = asset?.metadata?.storage_bucket || "creative-assets";
  if (storagePath) {
    const signed = await supabaseAdmin.storage.from(bucket).createSignedUrl(storagePath, 60 * 60);
    if (signed?.data?.signedUrl) return signed.data.signedUrl;
  }
  const direct = asset?.image_url || asset?.file_url || null;
  return direct && !String(direct).startsWith("storage://") ? direct : null;
}

export async function resolveBrand({
  organizationId,
  entityId,
}) {
  if (!organizationId) {
    return {};
  }

  const [brands, entity, organizationProfile, organizationResult] = await Promise.all([
    CreativeBrandRuntime.list({ organization_id: organizationId }),
    entityId
      ? resolveEntity({ organizationId, entityId })
      : Promise.resolve(null),
    resolveFinanceOrganizationProfile({ organizationId }),
    supabaseAdmin.from("organizations").select("id,name").eq("id", organizationId).maybeSingle(),
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

  let bankQuery = supabaseAdmin
    .from("bank_accounts")
    .select("bank_name,account_name,account_number,swift_bic,currency,currency_code,is_default,active")
    .eq("organization_id", organizationId)
    .eq("active", true)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1);
  if (entityId) bankQuery = bankQuery.eq("entity_id", entityId);
  const { data: bankRows, error: bankError } = await bankQuery;
  if (bankError && !["42P01", "PGRST205"].includes(bankError.code)) throw bankError;
  const financeBank = bankRows?.[0] || null;
  const configuredPayment = paymentConfig?.configuration || {};
  const payment = Object.keys(configuredPayment).length
    ? configuredPayment
    : financeBank
      ? {
          bank_name: financeBank.bank_name || null,
          account_name: financeBank.account_name || null,
          account_number: financeBank.account_number || null,
          swift: financeBank.swift_bic || null,
          currency: financeBank.currency_code || financeBank.currency || null,
        }
      : {};

  const organization = organizationResult?.data || null;
  let logoUrl = null;
  let logoIconUrl = null;
  const logoIconAssetId = creativeBrand?.metadata?.logo_icon_asset_id || null;

  if (creativeBrand?.logo_asset_id) {
    const { data: logoAsset } = await supabaseAdmin
      .from("creative_assets")
      .select(`
        id,
        image_url,
        file_url,
        metadata
      `)
      .eq("id", creativeBrand.logo_asset_id)
      .maybeSingle();

    logoUrl = await resolvedCreativeAssetUrl(logoAsset);
  }

  let logoIconValid = false;
  let logoIconAspectRatio = null;
  if (logoIconAssetId) {
    const { data: logoIconAsset } = await supabaseAdmin
      .from("creative_assets")
      .select("id,image_url,file_url,metadata")
      .eq("id", logoIconAssetId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    const width = Number(logoIconAsset?.metadata?.width || logoIconAsset?.metadata?.technical_metadata?.width || 0);
    const height = Number(logoIconAsset?.metadata?.height || logoIconAsset?.metadata?.technical_metadata?.height || 0);
    logoIconAspectRatio = width > 0 && height > 0 ? width / height : null;
    logoIconValid = logoIconAspectRatio == null || (logoIconAspectRatio >= 0.72 && logoIconAspectRatio <= 1.38);
    if (logoIconValid) logoIconUrl = await resolvedCreativeAssetUrl(logoIconAsset);
  }

  const legalName = first(
    entity?.legal_name,
    organizationProfile?.legal_name
  );
  const displayName = first(
    creativeBrand?.name,
    organization?.name,
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
    logo_icon_asset_id: logoIconAssetId,
    logo_icon_url: logoIconUrl,
    logo_icon_valid: logoIconValid,
    logo_icon_aspect_ratio: logoIconAspectRatio,
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
    payment,
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
