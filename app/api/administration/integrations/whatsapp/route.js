export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { ChannelAssetRuntime } from "@/lib/platform/channels/runtime/ChannelAssetRuntime";
import { ChannelConnectionRuntime } from "@/lib/platform/channels/runtime/ChannelConnectionRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { CredentialRuntime } from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const PROVIDER = "whatsapp";
const INTEGRATION_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
  "ADMIN",
  "MANAGER",
]);

function text(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function graphVersion() {
  const configured = text(process.env.META_GRAPH_API_VERSION);
  if (!configured) return "v23.0";
  return configured.startsWith("v") ? configured : `v${configured}`;
}

function canManageIntegrations(access) {
  return [access?.role, access?.access?.role, access?.membership?.role, access?.staff?.role]
    .map(upper)
    .some((role) => INTEGRATION_ROLES.has(role));
}

async function resolveAccess(request, body = {}) {
  const url = new URL(request.url);
  return requireOrganizationAccess({
    organizationId:
      body.organizationId ||
      body.organization_id ||
      url.searchParams.get("organizationId") ||
      url.searchParams.get("organization_id"),
    request,
  });
}

function safeConnection(connection) {
  if (!connection) return null;
  const metadata = connection.metadata || {};
  return {
    id: connection.id,
    status: connection.status,
    accountLabel:
      metadata.verified_name ||
      metadata.display_phone_number ||
      metadata.business_name ||
      null,
    authorizedAt: connection.authorized_at || null,
  };
}

function safePhone(asset) {
  return {
    id: asset.id,
    name: asset.name || "WhatsApp Business",
    displayPhoneNumber: asset.metadata?.display_phone_number || null,
    entityId: asset.entity_id || null,
  };
}

async function snapshot(organizationId) {
  const [connection, assetsResult] = await Promise.all([
    ChannelConnectionRuntime.get({ organization_id: organizationId, provider: PROVIDER }),
    supabaseAdmin
      .from("organization_channel_assets")
      .select("id,name,asset_type,entity_id,metadata")
      .eq("organization_id", organizationId)
      .eq("channel_provider", PROVIDER)
      .order("created_at", { ascending: true }),
  ]);

  if (assetsResult.error) throw assetsResult.error;

  return {
    connection: safeConnection(connection),
    phoneNumbers: (assetsResult.data || [])
      .filter((row) => row.asset_type === "whatsapp_phone_number")
      .map(safePhone),
    publicConfig: {
      ready: Boolean(
        text(process.env.META_APP_ID) &&
        text(process.env.META_APP_SECRET) &&
        text(process.env.META_WHATSAPP_CONFIG_ID),
      ),
      appId: text(process.env.META_APP_ID) || null,
      configId: text(process.env.META_WHATSAPP_CONFIG_ID) || null,
      graphVersion: graphVersion(),
    },
  };
}

async function graphJson(path, accessToken) {
  const response = await fetch(
    `https://graph.facebook.com/${graphVersion()}/${String(path).replace(/^\//, "")}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) {
    throw new Error(
      payload?.error?.error_user_msg ||
      payload?.error?.message ||
      `WhatsApp request failed (${response.status})`,
    );
  }
  return payload;
}

async function exchangeCode(code) {
  if (!text(process.env.META_APP_ID) || !text(process.env.META_APP_SECRET)) {
    throw new Error("WhatsApp connection is not configured by Avantiqo yet");
  }

  const url = new URL(`https://graph.facebook.com/${graphVersion()}/oauth/access_token`);
  url.searchParams.set("client_id", process.env.META_APP_ID);
  url.searchParams.set("client_secret", process.env.META_APP_SECRET);
  url.searchParams.set("code", code);

  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.access_token) {
    throw new Error(payload?.error?.message || "Meta did not return a WhatsApp access token");
  }
  return payload.access_token;
}

async function completeEmbeddedSignup({ access, code, phoneNumberId, wabaId, businessId }) {
  if (!text(code) || !text(phoneNumberId) || !text(wabaId)) {
    throw new Error("WhatsApp signup did not return the required business account information");
  }

  const accessToken = await exchangeCode(code);
  const [phone, businessAccount] = await Promise.all([
    graphJson(`${phoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating`, accessToken),
    graphJson(`${wabaId}?fields=id,name`, accessToken),
  ]);

  const credential = await CredentialRuntime.store({
    provider_id: PROVIDER,
    credential_type: "oauth_access_token",
    secret_reference: accessToken,
    metadata: {
      organization_id: access.organizationId,
      purpose: "ORGANIZATION_WHATSAPP_BUSINESS",
      phone_number_id: phoneNumberId,
      waba_id: wabaId,
      business_id: businessId || null,
      enabled: true,
    },
  });

  const connection = await ChannelConnectionRuntime.connect({
    organization_id: access.organizationId,
    provider: PROVIDER,
    channel_type: "messaging",
    credentials_reference: credential.id,
    metadata: {
      connection_model: "ORGANIZATION_WHATSAPP_EMBEDDED_SIGNUP",
      phone_number_id: phoneNumberId,
      waba_id: wabaId,
      business_id: businessId || null,
      display_phone_number: phone?.display_phone_number || null,
      verified_name: phone?.verified_name || null,
      business_name: businessAccount?.name || null,
      connected_by_party_id: access.staff?.party_id || null,
      connected_at: new Date().toISOString(),
    },
  });

  await ChannelAssetRuntime.register({
    organization_id: access.organizationId,
    connection_id: connection.id,
    provider: PROVIDER,
    asset_type: "whatsapp_phone_number",
    external_id: phoneNumberId,
    name: phone?.verified_name || phone?.display_phone_number || "WhatsApp Business",
    metadata: {
      display_phone_number: phone?.display_phone_number || null,
      verified_name: phone?.verified_name || null,
      quality_rating: phone?.quality_rating || null,
      waba_id: wabaId,
    },
  });

  await ChannelAssetRuntime.register({
    organization_id: access.organizationId,
    connection_id: connection.id,
    provider: PROVIDER,
    asset_type: "whatsapp_business_account",
    external_id: wabaId,
    name: businessAccount?.name || "WhatsApp Business Account",
    metadata: {
      business_id: businessId || null,
      phone_number_id: phoneNumberId,
    },
  });

  return snapshot(access.organizationId);
}

export async function GET(request) {
  try {
    const access = await resolveAccess(request);
    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error || "Organization access denied" },
        { status: access.status || 403 },
      );
    }

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      ...(await snapshot(access.organizationId)),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "WhatsApp integration lookup failed" },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await resolveAccess(request, body);
    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error || "Organization access denied" },
        { status: access.status || 403 },
      );
    }
    if (!canManageIntegrations(access)) {
      return NextResponse.json(
        { success: false, error: "Owner, administrator, or manager access is required to manage WhatsApp Business" },
        { status: 403 },
      );
    }
    if (body.action !== "complete-embedded-signup") {
      return NextResponse.json(
        { success: false, error: "Unsupported WhatsApp integration action" },
        { status: 400 },
      );
    }

    const result = await completeEmbeddedSignup({
      access,
      code: body.code,
      phoneNumberId: body.phoneNumberId,
      wabaId: body.wabaId,
      businessId: body.businessId || null,
    });

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "WhatsApp Business connection failed" },
      { status: 500 },
    );
  }
}
