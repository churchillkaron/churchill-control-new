export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { ChannelAssetRuntime } from "@/lib/platform/channels/runtime/ChannelAssetRuntime";
import { ChannelConnectionRuntime } from "@/lib/platform/channels/runtime/ChannelConnectionRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { CredentialRuntime } from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";
import {
  getLineBotInfo,
  issueLineStatelessChannelAccessToken,
} from "@/lib/platform/service-runtime/providers/line/LINEChannelAccessTokenRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const PROVIDER = "line";
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

function canManageIntegrations(access) {
  return [access?.role, access?.access?.role, access?.membership?.role, access?.staff?.role]
    .map(upper)
    .some((role) => INTEGRATION_ROLES.has(role));
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

function lineWebhookUrl(origin, connectionId) {
  return `${origin}/api/commercial/communications/webhooks/line/${encodeURIComponent(connectionId)}`;
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
    accountLabel: metadata.display_name || metadata.basic_id || null,
    connectedAt: metadata.connected_at || null,
    webhookUrl: metadata.webhook_url || null,
    webhookActive: metadata.webhook_active === true,
    webhookConfigured: Boolean(metadata.webhook_url),
    actionRequired:
      metadata.webhook_url && metadata.webhook_active !== true
        ? "Enable Use webhook in the LINE Messaging API channel settings."
        : null,
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
    accounts: (assetsResult.data || [])
      .filter((row) => row.asset_type === "line_official_account")
      .map((row) => ({
        id: row.id,
        name: row.name || "LINE Official Account",
        basicId: row.metadata?.basic_id || null,
        entityId: row.entity_id || null,
      })),
  };
}

async function lineJson(path, accessToken, options = {}) {
  const response = await fetch(`https://api.line.me${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    cache: "no-store",
  });
  const raw = await response.text();
  const payload = raw ? JSON.parse(raw) : {};
  if (!response.ok) {
    throw new Error(payload?.message || `LINE webhook configuration failed (${response.status})`);
  }
  return payload;
}

async function configureLineWebhook({ accessToken, endpoint }) {
  await lineJson("/v2/bot/channel/webhook/endpoint", accessToken, {
    method: "PUT",
    body: JSON.stringify({ endpoint }),
  });
  return lineJson("/v2/bot/channel/webhook/endpoint", accessToken);
}

async function connectLine({ access, channelId, channelSecret, origin }) {
  const id = text(channelId);
  const secret = text(channelSecret);
  if (!id) throw new Error("LINE Messaging API Channel ID is required");
  if (!secret) throw new Error("LINE Messaging API Channel secret is required");
  if (!text(origin).startsWith("https://")) {
    throw new Error("LINE requires a public HTTPS application URL before Communications can receive messages");
  }

  const issued = await issueLineStatelessChannelAccessToken({
    channel_id: id,
    channel_secret: secret,
  });
  const bot = await getLineBotInfo(issued.access_token);
  if (!text(bot?.userId)) {
    throw new Error("LINE did not return an Official Account identity");
  }

  const credential = await CredentialRuntime.store({
    provider_id: PROVIDER,
    credential_type: "messaging_api_channel_secret",
    secret_reference: secret,
    metadata: {
      organization_id: access.organizationId,
      purpose: "ORGANIZATION_LINE_MESSAGING",
      channel_id: id,
      bot_user_id: bot.userId,
      basic_id: bot.basicId || null,
      enabled: true,
    },
  });

  const connectedAt = new Date().toISOString();
  let connection = await ChannelConnectionRuntime.connect({
    organization_id: access.organizationId,
    provider: PROVIDER,
    channel_type: "messaging",
    credentials_reference: credential.id,
    metadata: {
      connection_model: "ORGANIZATION_LINE_MESSAGING_API",
      channel_id: id,
      bot_user_id: bot.userId,
      basic_id: bot.basicId || null,
      display_name: bot.displayName || null,
      connected_by_party_id: access.staff?.party_id || null,
      connected_at: connectedAt,
    },
  });

  const webhookUrl = lineWebhookUrl(origin, connection.id);
  const webhookInfo = await configureLineWebhook({
    accessToken: issued.access_token,
    endpoint: webhookUrl,
  });

  connection = await ChannelConnectionRuntime.connect({
    organization_id: access.organizationId,
    provider: PROVIDER,
    channel_type: "messaging",
    credentials_reference: credential.id,
    metadata: {
      connection_model: "ORGANIZATION_LINE_MESSAGING_API",
      channel_id: id,
      bot_user_id: bot.userId,
      basic_id: bot.basicId || null,
      display_name: bot.displayName || null,
      connected_by_party_id: access.staff?.party_id || null,
      connected_at: connectedAt,
      webhook_url: webhookUrl,
      webhook_active: webhookInfo?.active === true,
      webhook_configured_at: new Date().toISOString(),
    },
  });

  await ChannelAssetRuntime.register({
    organization_id: access.organizationId,
    connection_id: connection.id,
    provider: PROVIDER,
    asset_type: "line_official_account",
    external_id: bot.userId,
    name: bot.displayName || bot.basicId || "LINE Official Account",
    metadata: {
      basic_id: bot.basicId || null,
      chat_mode: bot.chatMode || null,
      mark_as_read_mode: bot.markAsReadMode || null,
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
      { success: false, error: error?.message || "LINE integration lookup failed" },
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
        { success: false, error: "Owner, administrator, or manager access is required to manage LINE" },
        { status: 403 },
      );
    }
    if (body.action !== "connect") {
      return NextResponse.json(
        { success: false, error: "Unsupported LINE integration action" },
        { status: 400 },
      );
    }

    const result = await connectLine({
      access,
      channelId: body.channelId,
      channelSecret: body.channelSecret,
      origin: publicOrigin(request),
    });

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "LINE connection failed" },
      { status: 500 },
    );
  }
}
