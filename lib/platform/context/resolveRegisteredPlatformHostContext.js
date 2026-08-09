import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import {
  normalizePlatformHostname,
  resolvePlatformHostContext,
} from "@/lib/platform/context/resolvePlatformHostContext";

const PLATFORM_CHANNEL_PROVIDER = "avantiqo";
const PLATFORM_HOSTNAME_ASSET_TYPE = "platform_hostname";

function activeRecord(record = {}) {
  if (record.active === false || record.is_active === false) return false;

  const status = String(
    record.status ||
      record.organization_status ||
      record.metadata?.status ||
      ""
  )
    .trim()
    .toUpperCase();

  return ![
    "INACTIVE",
    "DISABLED",
    "SUSPENDED",
    "TERMINATED",
    "ARCHIVED",
    "REVOKED",
  ].includes(status);
}

function metadataBrand(metadata = {}) {
  const nested =
    metadata?.branding && typeof metadata.branding === "object"
      ? metadata.branding
      : metadata?.brand && typeof metadata.brand === "object"
        ? metadata.brand
        : {};

  return {
    ...metadata,
    ...nested,
  };
}

function organizationHostContext({ asset, organization }) {
  const metadata = metadataBrand(asset?.metadata || {});
  const name = String(
    metadata.brand_name ||
      metadata.display_name ||
      asset?.name ||
      organization?.name ||
      "Organization"
  ).trim();

  const identityLabel = String(
    metadata.identity_label || metadata.brand_name || name
  ).trim();

  return {
    id: String(metadata.brand_id || metadata.brand_key || organization?.id || "organization"),
    name,
    displayName: String(metadata.display_name || name),
    organizationId: organization?.id || asset?.organization_id || null,
    logoSrc: metadata.logo_src ? String(metadata.logo_src) : null,
    logoAlt: String(metadata.logo_alt || name),
    identityLabel,
    tagline: String(metadata.tagline || "Business Operating System"),
    strapline: String(metadata.strapline || "Operate · Control · Grow"),
    welcomeTitle: String(metadata.welcome_title || `Welcome to ${name}`),
    workspaceTitle: String(metadata.workspace_title || name),
    workspaceDescription: String(
      metadata.workspace_description ||
        `Business operating system for ${name}.`
    ),
    runtimeLabel: String(metadata.runtime_label || `${name} Operations Active`),
    securityLabel: String(metadata.security_label || `Secure ${name} Access`),
  };
}

export async function resolveRegisteredPlatformHostContext(hostname) {
  const normalizedHostname = normalizePlatformHostname(hostname);
  const staticContext = resolvePlatformHostContext(normalizedHostname);

  if (!normalizedHostname) return staticContext;

  // Platform-owned and current static hosts resolve without database access.
  if (staticContext.organizationId || staticContext.id === "avantiqo") {
    const isKnownPlatformHost =
      normalizedHostname === "avantiqo.ai" ||
      normalizedHostname === "www.avantiqo.ai" ||
      normalizedHostname === "localhost" ||
      normalizedHostname.endsWith(".localhost") ||
      normalizedHostname.endsWith(".vercel.app");

    if (staticContext.organizationId || isKnownPlatformHost) {
      return staticContext;
    }
  }

  const { data: assets, error: assetError } = await supabaseAdmin
    .from("organization_channel_assets")
    .select(
      "id,organization_id,external_id,name,metadata,selected_at,updated_at"
    )
    .eq("channel_provider", PLATFORM_CHANNEL_PROVIDER)
    .eq("asset_type", PLATFORM_HOSTNAME_ASSET_TYPE)
    .eq("external_id", normalizedHostname)
    .order("selected_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(10);

  if (assetError) throw assetError;

  const asset = (assets || []).find(activeRecord);
  if (!asset?.organization_id) return staticContext;

  const { data: organization, error: organizationError } = await supabaseAdmin
    .from("organizations")
    .select("id,name,legal_name,status,organization_status")
    .eq("id", asset.organization_id)
    .maybeSingle();

  if (organizationError) throw organizationError;
  if (!organization || !activeRecord(organization)) return staticContext;

  return organizationHostContext({ asset, organization });
}
