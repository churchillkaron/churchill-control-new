export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { ChannelAssetRuntime } from "@/lib/platform/channels/runtime/ChannelAssetRuntime";
import { ChannelConnectionRuntime } from "@/lib/platform/channels/runtime/ChannelConnectionRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { CredentialRuntime } from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";
import { OrganizationServiceRuntime } from "@/lib/platform/service-runtime/services/runtime/OrganizationServiceRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const PROVIDER = "whatsapp";
const PENDING_PURPOSE = "ORGANIZATION_WHATSAPP_EXISTING_SELECTION";
const PENDING_TTL_MS = 15 * 60 * 1000;

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

function publicOrigin(request) {
  const configured =
    text(process.env.NEXT_PUBLIC_APP_URL) ||
    text(process.env.NEXT_PUBLIC_BASE_URL) ||
    text(process.env.NEXT_PUBLIC_SITE_URL) ||
    text(process.env.APP_URL);
  const origin = configured || new URL(request.url).origin;
  return origin.replace(/\/$/, "");
}

function whatsappWebhookUrl(origin) {
  return `${origin}/api/commercial/communications/webhooks/whatsapp`;
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

async function ensureWhatsAppService(organizationId) {
  const existing = await OrganizationServiceRuntime.get({
    organization_id: organizationId,
    service_id: PROVIDER,
  }).catch(() => null);

  if (existing && upper(existing.status) === "ACTIVE") return existing;

  return OrganizationServiceRuntime.save({
    ...(existing || {}),
    organization_id: organizationId,
    service_category_id: existing?.service_category_id || "communication",
    service_id: PROVIDER,
    package_id: existing?.package_id || "core",
    status: "ACTIVE",
    managed_by: existing?.managed_by || "organization",
    authorization_required: true,
    usage_enabled: true,
    billing_enabled: true,
    billing_mode: existing?.billing_mode || "USAGE",
    pricing_mode: existing?.pricing_mode || "PROVIDER",
    fallback_enabled: false,
    activated_at: existing?.activated_at || new Date().toISOString(),
    metadata: {
      ...(existing?.metadata || {}),
      provider: PROVIDER,
      connection_model: "ORGANIZATION_WHATSAPP_EMBEDDED_SIGNUP",
    },
    configuration: existing?.configuration || {},
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
    webhookUrl: metadata.webhook_url || null,
    webhookSubscribed: metadata.webhook_subscribed === true,
    webhookVerifiedAt: metadata.webhook_verified_at || null,
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

async function snapshot(organizationId, origin = null) {
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

  const verifyTokenReady = Boolean(text(process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN));
  const webhookUrl = origin ? whatsappWebhookUrl(origin) : null;
  const webhookUrlReady = !webhookUrl || webhookUrl.startsWith("https://");

  return {
    connection: safeConnection(connection),
    phoneNumbers: (assetsResult.data || [])
      .filter((row) => row.asset_type === "whatsapp_phone_number")
      .map(safePhone),
    publicConfig: {
      ready: Boolean(
        text(process.env.META_APP_ID) &&
        text(process.env.META_APP_SECRET) &&
        text(process.env.META_WHATSAPP_CONFIG_ID) &&
        verifyTokenReady &&
        webhookUrlReady,
      ),
      appId: text(process.env.META_APP_ID) || null,
      configId: text(process.env.META_WHATSAPP_CONFIG_ID) || null,
      graphVersion: graphVersion(),
      webhookReady: verifyTokenReady && webhookUrlReady,
      webhookUrl,
    },
  };
}

async function graphJson(path, accessToken, options = {}) {
  const response = await fetch(
    `https://graph.facebook.com/${graphVersion()}/${String(path).replace(/^\//, "")}`,
    {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
      cache: "no-store",
    },
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) {
    const error = new Error(
      payload?.error?.error_user_msg ||
        payload?.error?.message ||
        `WhatsApp request failed (${response.status})`,
    );
    error.metaCode = payload?.error?.code || null;
    throw error;
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

async function resolveAuthorizationToken({ code, sdkAccessToken }) {
  if (text(sdkAccessToken)) return text(sdkAccessToken);
  if (text(code)) return exchangeCode(code);
  throw new Error("Meta did not return an authorization credential");
}

async function debugMetaToken(accessToken) {
  const appId = text(process.env.META_APP_ID);
  const appSecret = text(process.env.META_APP_SECRET);
  if (!appId || !appSecret) {
    throw new Error("Meta app credentials are not configured");
  }

  const url = new URL(`https://graph.facebook.com/${graphVersion()}/debug_token`);
  url.searchParams.set("input_token", accessToken);
  url.searchParams.set("access_token", `${appId}|${appSecret}`);

  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error || !payload?.data) {
    throw new Error(payload?.error?.message || "Meta authorization could not be inspected");
  }
  if (payload.data.is_valid === false) {
    throw new Error("Meta authorization is no longer valid");
  }
  return payload.data;
}

function sharedWabaIdsFromDebug(debugData) {
  const scopes = Array.isArray(debugData?.granular_scopes) ? debugData.granular_scopes : [];
  const management = scopes.filter(
    (row) => text(row?.scope) === "whatsapp_business_management",
  );
  const messaging = scopes.filter(
    (row) => text(row?.scope) === "whatsapp_business_messaging",
  );
  const source = management.length ? management : messaging;

  return [...new Set(
    source
      .flatMap((row) => (Array.isArray(row?.target_ids) ? row.target_ids : []))
      .map(text)
      .filter(Boolean),
  )];
}

async function describeWaba(wabaId, accessToken) {
  try {
    const [waba, phonesResult] = await Promise.all([
      graphJson(`${wabaId}?fields=id,name`, accessToken),
      graphJson(
        `${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,name_status`,
        accessToken,
      ),
    ]);

    const phones = Array.isArray(phonesResult?.data) ? phonesResult.data : [];
    return {
      id: text(waba?.id) || text(wabaId),
      name: text(waba?.name) || "WhatsApp Business Account",
      phones: phones
        .map((phone) => ({
          id: text(phone?.id),
          displayPhoneNumber: text(phone?.display_phone_number) || null,
          verifiedName: text(phone?.verified_name) || null,
          qualityRating: text(phone?.quality_rating) || null,
          nameStatus: text(phone?.name_status) || null,
        }))
        .filter((phone) => phone.id),
    };
  } catch {
    return null;
  }
}

async function discoverExistingWabas({ accessToken, wabaId = null, phoneNumberId = null }) {
  let ids = [];

  if (text(wabaId)) {
    ids = [text(wabaId)];
  } else {
    const debugData = await debugMetaToken(accessToken);
    ids = sharedWabaIdsFromDebug(debugData);
  }

  const described = (
    await Promise.all(ids.map((id) => describeWaba(id, accessToken)))
  ).filter(Boolean);

  const phoneHint = text(phoneNumberId);
  if (phoneHint) {
    for (const candidate of described) {
      candidate.phones = candidate.phones.filter((phone) => phone.id === phoneHint);
    }
  }

  return described.filter((candidate) => candidate.phones.length > 0);
}

async function storePendingSelection({ access, accessToken, candidates }) {
  const expiresAt = new Date(Date.now() + PENDING_TTL_MS).toISOString();
  const { data, error } = await supabaseAdmin
    .from("provider_credentials")
    .insert({
      provider_id: PROVIDER,
      credential_type: "oauth_pending_selection",
      secret_reference: accessToken,
      status: "INACTIVE",
      metadata: {
        organization_id: access.organizationId,
        purpose: PENDING_PURPOSE,
        authorized_by_party_id: access.staff?.party_id || null,
        candidate_wabas: candidates,
        expires_at: expiresAt,
        enabled: false,
      },
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

async function loadPendingSelection({ access, pendingCredentialId }) {
  const id = text(pendingCredentialId);
  if (!id) throw new Error("Pending WhatsApp authorization is missing");

  const { data, error } = await supabaseAdmin
    .from("provider_credentials")
    .select("*")
    .eq("id", id)
    .eq("provider_id", PROVIDER)
    .eq("credential_type", "oauth_pending_selection")
    .eq("status", "INACTIVE")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Pending WhatsApp authorization expired or was already used");

  const metadata = data.metadata || {};
  if (text(metadata.organization_id) !== text(access.organizationId)) {
    throw new Error("Pending WhatsApp authorization belongs to another organization");
  }
  if (text(metadata.purpose) !== PENDING_PURPOSE) {
    throw new Error("Pending WhatsApp authorization is invalid");
  }

  const expiresAt = Date.parse(text(metadata.expires_at));
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    await supabaseAdmin
      .from("provider_credentials")
      .update({ status: "REVOKED", secret_reference: "", updated_at: new Date().toISOString() })
      .eq("id", data.id);
    throw new Error("Pending WhatsApp authorization expired. Authorize Meta again.");
  }

  return data;
}

async function clearPendingSelection(id) {
  await supabaseAdmin
    .from("provider_credentials")
    .update({
      status: "REVOKED",
      secret_reference: "",
      updated_at: new Date().toISOString(),
      metadata: { revoked_at: new Date().toISOString(), purpose: PENDING_PURPOSE },
    })
    .eq("id", id)
    .eq("provider_id", PROVIDER);
}

async function subscribeWaba({ wabaId, accessToken, callbackUrl }) {
  const verifyToken = text(process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN);
  if (!verifyToken) {
    throw new Error("META_WHATSAPP_WEBHOOK_VERIFY_TOKEN is required before WhatsApp can receive messages");
  }
  if (!text(callbackUrl).startsWith("https://")) {
    throw new Error("WhatsApp requires a public HTTPS application URL before Communications can receive messages");
  }

  await graphJson(`${wabaId}/subscribed_apps`, accessToken, {
    method: "POST",
    body: JSON.stringify({
      override_callback_uri: callbackUrl,
      verify_token: verifyToken,
    }),
  });

  const subscriptions = await graphJson(`${wabaId}/subscribed_apps`, accessToken);
  const appId = text(process.env.META_APP_ID);
  const subscription = (subscriptions?.data || []).find((row) => {
    const rowAppId = text(row?.whatsapp_business_api_data?.id);
    return (!appId || rowAppId === appId) && text(row?.override_callback_uri) === callbackUrl;
  });

  if (!subscription) {
    throw new Error("WhatsApp webhook subscription could not be verified");
  }
  return subscription;
}

async function activateExistingSelection({
  access,
  accessToken,
  waba,
  phone,
  origin,
}) {
  const callbackUrl = whatsappWebhookUrl(origin);
  await subscribeWaba({ wabaId: waba.id, accessToken, callbackUrl });

  const credential = await CredentialRuntime.store({
    provider_id: PROVIDER,
    credential_type: "oauth_access_token",
    secret_reference: accessToken,
    metadata: {
      organization_id: access.organizationId,
      purpose: "ORGANIZATION_WHATSAPP_BUSINESS",
      phone_number_id: phone.id,
      waba_id: waba.id,
      enabled: true,
    },
  });

  const connection = await ChannelConnectionRuntime.connect({
    organization_id: access.organizationId,
    provider: PROVIDER,
    channel_type: "messaging",
    credentials_reference: credential.id,
    metadata: {
      connection_model: "ORGANIZATION_WHATSAPP_EXISTING_WABA",
      phone_number_id: phone.id,
      waba_id: waba.id,
      display_phone_number: phone.displayPhoneNumber || null,
      verified_name: phone.verifiedName || null,
      business_name: waba.name || null,
      connected_by_party_id: access.staff?.party_id || null,
      connected_at: new Date().toISOString(),
      webhook_url: callbackUrl,
      webhook_subscribed: true,
      webhook_verified_at: new Date().toISOString(),
    },
  });

  await ChannelAssetRuntime.register({
    organization_id: access.organizationId,
    connection_id: connection.id,
    provider: PROVIDER,
    asset_type: "whatsapp_phone_number",
    external_id: phone.id,
    name: phone.verifiedName || phone.displayPhoneNumber || "WhatsApp Business",
    metadata: {
      display_phone_number: phone.displayPhoneNumber || null,
      verified_name: phone.verifiedName || null,
      quality_rating: phone.qualityRating || null,
      name_status: phone.nameStatus || null,
      waba_id: waba.id,
    },
  });

  await ChannelAssetRuntime.register({
    organization_id: access.organizationId,
    connection_id: connection.id,
    provider: PROVIDER,
    asset_type: "whatsapp_business_account",
    external_id: waba.id,
    name: waba.name || "WhatsApp Business Account",
    metadata: {
      phone_number_id: phone.id,
    },
  });

  await ensureWhatsAppService(access.organizationId);
  return snapshot(access.organizationId, origin);
}

async function prepareExistingSelection({
  access,
  code,
  sdkAccessToken,
  wabaId,
  phoneNumberId,
}) {
  const accessToken = await resolveAuthorizationToken({ code, sdkAccessToken });
  const candidates = await discoverExistingWabas({
    accessToken,
    wabaId,
    phoneNumberId,
  });

  if (!candidates.length) {
    const error = new Error(
      "Meta authorized Avantiqo, but no existing WhatsApp Business Account with an existing phone number was shared. Do not create another account or number. Choose the existing business assets in Meta and authorize them for Avantiqo.",
    );
    error.code = "WHATSAPP_EXISTING_WABA_NOT_SHARED";
    throw error;
  }

  const pendingCredentialId = await storePendingSelection({
    access,
    accessToken,
    candidates,
  });

  return {
    selectionRequired: true,
    pendingCredentialId,
    candidates,
  };
}

async function confirmExistingSelection({
  access,
  pendingCredentialId,
  wabaId,
  phoneNumberId,
  origin,
}) {
  const pending = await loadPendingSelection({ access, pendingCredentialId });
  const candidates = Array.isArray(pending.metadata?.candidate_wabas)
    ? pending.metadata.candidate_wabas
    : [];

  const waba = candidates.find((row) => text(row?.id) === text(wabaId));
  if (!waba) throw new Error("Selected WhatsApp Business Account was not authorized");

  const phone = (Array.isArray(waba.phones) ? waba.phones : []).find(
    (row) => text(row?.id) === text(phoneNumberId),
  );
  if (!phone) throw new Error("Selected WhatsApp phone number was not authorized");

  const result = await activateExistingSelection({
    access,
    accessToken: pending.secret_reference,
    waba,
    phone,
    origin,
  });

  await clearPendingSelection(pending.id);
  return result;
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
      ...(await snapshot(access.organizationId, publicOrigin(request))),
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

    const origin = publicOrigin(request);
    let result;

    if (
      body.action === "recover-existing-embedded-signup" ||
      body.action === "complete-embedded-signup"
    ) {
      result = await prepareExistingSelection({
        access,
        code: body.code,
        sdkAccessToken: body.accessToken,
        wabaId: body.wabaId || null,
        phoneNumberId: body.phoneNumberId || null,
      });
    } else if (body.action === "confirm-existing-selection") {
      result = await confirmExistingSelection({
        access,
        pendingCredentialId: body.pendingCredentialId,
        wabaId: body.wabaId,
        phoneNumberId: body.phoneNumberId,
        origin,
      });
    } else {
      return NextResponse.json(
        { success: false, error: "Unsupported WhatsApp integration action" },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      ...result,
    });
  } catch (error) {
    const code = text(error?.code) || "WHATSAPP_CONNECTION_FAILED";
    const status = code === "WHATSAPP_EXISTING_WABA_NOT_SHARED" ? 409 : 500;

    return NextResponse.json(
      {
        success: false,
        code,
        error: error?.message || "WhatsApp Business connection failed",
      },
      { status },
    );
  }
}
