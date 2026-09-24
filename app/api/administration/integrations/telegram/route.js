export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { CredentialRuntime } from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";
import { deactivateOtherActiveScopedCredentials } from "@/lib/platform/service-runtime/credentials/repositories/CredentialRepository";
import { ChannelConnectionRuntime } from "@/lib/platform/channels/runtime/ChannelConnectionRuntime";
import { ChannelAssetRuntime } from "@/lib/platform/channels/runtime/ChannelAssetRuntime";
import { configureTelegramWebhook, removeTelegramWebhook, validateTelegramBot } from "@/lib/platform/channels/telegram/TelegramConnectionRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function text(value) { return String(value ?? "").trim(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }

async function accessContext(request, body = {}) {
  const url = new URL(request.url);
  const organizationId = text(body.organizationId || body.organization_id || url.searchParams.get("organizationId") || url.searchParams.get("organization_id"));
  const access = await requireOrganizationAccess({ organizationId, request });
  if (!access.success) {
    const error = new Error(access.error || "Organization access denied");
    error.status = access.status || 403;
    throw error;
  }
  return access;
}

async function snapshot(organizationId) {
  const connection = await ChannelConnectionRuntime.get({ organization_id:organizationId, provider:"telegram" }).catch(()=>null);
  const assets = connection?.id
    ? await ChannelAssetRuntime.list({ organization_id:organizationId, connection_id:connection.id })
    : [];
  const bot = assets.find((asset)=>asset.asset_type === "telegram_bot") || null;
  return {
    connection: connection ? {
      id:connection.id,
      status:connection.status,
      channel_type:connection.channel_type,
      webhookReady:object(connection.metadata).webhook_ready === true,
      webhookConfiguredAt:text(object(connection.metadata).webhook_configured_at) || null,
    } : null,
    bot: bot ? {
      id:bot.external_id,
      name:bot.name,
      username:text(object(bot.metadata).username) || null,
    } : null,
  };
}

function publicOrigin(request) {
  const candidates = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.AVANTIQO_PUBLIC_ORIGIN,
    new URL(request.url).origin,
  ];
  for (const candidate of candidates) {
    try {
      const origin = new URL(text(candidate)).origin;
      if (origin.startsWith("https://")) return origin;
    } catch {}
  }
  throw new Error("TELEGRAM_PUBLIC_HTTPS_ORIGIN_REQUIRED");
}

export async function GET(request) {
  try {
    const access = await accessContext(request);
    return NextResponse.json({ success:true, organizationId:access.organizationId, ...(await snapshot(access.organizationId)) });
  } catch (error) {
    return NextResponse.json({ success:false, error:error?.message || "Unable to load Telegram setup" }, { status:error?.status || 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(()=>({}));
    const access = await accessContext(request, body);
    const action = text(body.action || "connect").toLowerCase();

    if (action === "disconnect") {
      const connection = await ChannelConnectionRuntime.get({ organization_id:access.organizationId, provider:"telegram" }).catch(()=>null);
      if (connection?.credentials_reference) {
        const credential = await CredentialRuntime.resolve(connection.credentials_reference, { organization_id:access.organizationId }).catch(()=>null);
        if (credential?.secret_reference) await removeTelegramWebhook({ botToken:credential.secret_reference }).catch(()=>null);
        await supabaseAdmin.from("provider_credentials").update({ status:"INACTIVE" }).eq("id",connection.credentials_reference).eq("provider_id","telegram");
      }
      await ChannelConnectionRuntime.disconnect({ organization_id:access.organizationId, provider:"telegram" });
      return NextResponse.json({ success:true, organizationId:access.organizationId, ...(await snapshot(access.organizationId)) });
    }

    const botToken = text(body.botToken || body.bot_token);
    if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(botToken)) {
      return NextResponse.json({ success:false, error:"Enter the Telegram bot token supplied by BotFather" }, { status:400 });
    }
    const bot = await validateTelegramBot(botToken);
    const origin = publicOrigin(request);
    const credential = await CredentialRuntime.storeSecret({
      provider_id:"telegram",
      credential_type:"bot_token",
      secret:botToken,
      organization_id:access.organizationId,
      vault_name:`telegram-bot-${access.organizationId}-${bot.id}`,
      vault_description:"Organization Telegram bot token",
      metadata:{
        organization_id:access.organizationId,
        purpose:"ORGANIZATION_TELEGRAM_BOT",
        enabled:true,
        bot_id:bot.id,
        bot_username:bot.username,
      },
    });
    await deactivateOtherActiveScopedCredentials({
      provider_id:"telegram",
      organization_id:access.organizationId,
      purpose:"ORGANIZATION_TELEGRAM_BOT",
      except_id:credential.id,
    });
    let connection = await ChannelConnectionRuntime.connect({
      organization_id:access.organizationId,
      provider:"telegram",
      channel_type:"messaging",
      credentials_reference:credential.id,
      metadata:{
        bot_id:bot.id,
        bot_username:bot.username,
        display_name:bot.first_name || bot.username || "Telegram Bot",
        webhook_ready:false,
      },
    });
    const webhook = await configureTelegramWebhook({
      botToken,
      organizationId:access.organizationId,
      connectionId:connection.id,
      publicOrigin:origin,
    });
    const now = new Date().toISOString();
    connection = await ChannelConnectionRuntime.connect({
      organization_id:access.organizationId,
      provider:"telegram",
      channel_type:"messaging",
      credentials_reference:credential.id,
      metadata:{
        ...object(connection.metadata),
        bot_id:bot.id,
        bot_username:bot.username,
        display_name:bot.first_name || bot.username || "Telegram Bot",
        webhook_ready:true,
        webhook_url: webhook.webhookUrl,
        webhook_configured_at:now,
      },
    });
    await ChannelAssetRuntime.register({
      organization_id:access.organizationId,
      connection_id:connection.id,
      provider:"telegram",
      asset_type:"telegram_bot",
      external_id:bot.id,
      name:bot.first_name || bot.username || `Telegram Bot ${bot.id}`,
      selected_by_party_id:access.staff?.party_id || null,
      selected_at:now,
      metadata:{ username:bot.username, can_join_groups:bot.can_join_groups, supports_inline_queries:bot.supports_inline_queries },
    });
    return NextResponse.json({ success:true, organizationId:access.organizationId, ...(await snapshot(access.organizationId)) });
  } catch (error) {
    return NextResponse.json({ success:false, error:error?.message || "Telegram setup failed" }, { status:error?.status || 500 });
  }
}
