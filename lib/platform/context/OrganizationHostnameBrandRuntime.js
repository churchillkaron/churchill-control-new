import { resolveBrand } from "@/lib/platform/documents/branding/BrandResolver";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const PROVIDER = "avantiqo";
const ASSET_TYPE = "platform_hostname";

function text(value) { return String(value ?? "").trim(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function slug(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "organization";
}

async function durableLogoDescriptor({ organizationId, brand }) {
  const primaryId = text(brand?.logo_asset_id);
  const iconId = brand?.logo_icon_valid === false ? "" : text(brand?.logo_icon_asset_id);
  const assetId = primaryId || iconId;
  if (!assetId) return null;

  const { data: asset, error } = await supabaseAdmin
    .from("creative_assets")
    .select("id,image_url,file_url,metadata")
    .eq("id", assetId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw error;
  if (!asset) return null;

  const metadata = object(asset.metadata);
  const storagePath = text(metadata.storage_path);
  const storageBucket = text(metadata.storage_bucket) || "creative-assets";
  const direct = text(asset.image_url || asset.file_url);
  const durableDirect = direct && !direct.startsWith("storage://") && !/\/storage\/v1\/object\/sign\//.test(direct)
    ? direct
    : null;

  return {
    logo_asset_id:asset.id,
    logo_storage_bucket:storagePath ? storageBucket : null,
    logo_storage_path:storagePath || null,
    logo_direct_url:durableDirect,
    logo_layout:primaryId ? "wide" : "compact",
  };
}

export async function buildOrganizationHostnameBrandMetadata({ organizationId, existingMetadata = {} }) {
  const existing = object(existingMetadata);
  const [{ data: organization, error }, brand] = await Promise.all([
    supabaseAdmin.from("organizations").select("id,name").eq("id", organizationId).maybeSingle(),
    resolveBrand({ organizationId, entityId:null }).catch(() => null),
  ]);
  if (error) throw error;

  const name = text(organization?.name) || text(existing.display_name) || "Organization";
  const durableLogo = await durableLogoDescriptor({ organizationId, brand });
  const existingLogoSrc = text(existing.logo_src);
  const durableLegacyLogo = existingLogoSrc && !/\/storage\/v1\/object\/sign\//.test(existingLogoSrc)
    ? existingLogoSrc
    : null;

  const next = {
    ...existing,
    display_name:name,
    brand_name:name,
    brand_id:text(existing.brand_id) || slug(name),
    identity_label:text(existing.identity_label) || name,
    ...(durableLogo || {}),
    ...(!durableLogo && durableLegacyLogo ? { logo_src:durableLegacyLogo } : {}),
    logo_alt:name,
    logo_layout:durableLogo?.logo_layout || text(existing.logo_layout) || "compact",
    tagline:text(existing.tagline) || "Business Operating System",
    strapline:text(existing.strapline) || "Operate · Control · Grow",
    welcome_title:text(existing.welcome_title) || `Welcome to ${name}`,
    workspace_title:text(existing.workspace_title) || name,
    workspace_description:text(existing.workspace_description) || `Business operating system for ${name}.`,
    runtime_label:text(existing.runtime_label) || `${name} Operations Active`,
    security_label:text(existing.security_label) || `Secure ${name} Access`,
  };

  if (durableLogo) delete next.logo_src;
  return next;
}

export async function syncOrganizationHostnameBranding({ organizationId }) {
  const { data: rows, error } = await supabaseAdmin
    .from("organization_channel_assets")
    .select("id,metadata")
    .eq("organization_id", organizationId)
    .eq("channel_provider", PROVIDER)
    .eq("asset_type", ASSET_TYPE);
  if (error) throw error;

  let updated = 0;
  for (const row of rows || []) {
    const metadata = await buildOrganizationHostnameBrandMetadata({
      organizationId,
      existingMetadata:row.metadata,
    });
    const result = await supabaseAdmin
      .from("organization_channel_assets")
      .update({ metadata, updated_at:new Date().toISOString() })
      .eq("id", row.id)
      .eq("organization_id", organizationId);
    if (result.error) throw result.error;
    updated += 1;
  }

  return { updated };
}
