export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { CredentialRuntime } from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";
import {
  ingestInboundCommunication,
  resolveCommunicationConnectionById,
} from "@/lib/commercial/communications/CommunicationWebhookRuntime";
import { telegramWebhookSecret } from "@/lib/platform/channels/telegram/TelegramConnectionRuntime";

function text(value) { return String(value ?? "").trim(); }
function safeEqual(left, right) {
  const a = Buffer.from(text(left));
  const b = Buffer.from(text(right));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a,b);
}
function messageType(message) {
  if (message?.photo) return "IMAGE";
  if (message?.video || message?.video_note) return "VIDEO";
  if (message?.audio || message?.voice) return "AUDIO";
  if (message?.document) return "FILE";
  if (message?.sticker) return "IMAGE";
  return "TEXT";
}
function messageBody(message) {
  const body = text(message?.text || message?.caption);
  if (body) return body;
  if (message?.photo) return "[Telegram photo]";
  if (message?.video || message?.video_note) return "[Telegram video]";
  if (message?.audio || message?.voice) return "[Telegram audio]";
  if (message?.document) return `[Telegram document${message.document.file_name ? `: ${message.document.file_name}` : ""}]`;
  if (message?.sticker) return `[Telegram sticker${message.sticker.emoji ? ` ${message.sticker.emoji}` : ""}]`;
  return "[Telegram message]";
}

export async function POST(request, { params }) {
  try {
    const connectionId = text(params?.connectionId);
    if (!connectionId) return NextResponse.json({ ok:true });
    const connection = await resolveCommunicationConnectionById({ provider:"telegram", connectionId });
    if (!connection?.credentials_reference) return NextResponse.json({ ok:true });

    const credential = await CredentialRuntime.resolve(connection.credentials_reference, {
      organization_id:connection.organization_id,
    });
    const botToken = credential?.secret_reference;
    if (!botToken) return NextResponse.json({ ok:true });
    const expected = telegramWebhookSecret({
      botToken,
      organizationId:connection.organization_id,
      connectionId:connection.id,
    });
    const supplied = request.headers.get("x-telegram-bot-api-secret-token");
    if (!safeEqual(supplied, expected)) {
      return NextResponse.json({ ok:false }, { status:403 });
    }

    const update = await request.json().catch(()=>null);
    const message = update?.message;
    if (!message?.message_id || !message?.chat?.id || !message?.from?.id) {
      return NextResponse.json({ ok:true });
    }
    const sender = message.from;
    const senderName = [text(sender.first_name),text(sender.last_name)].filter(Boolean).join(" ") || text(sender.username) || null;
    const senderAddress = String(message.chat.id);
    await ingestInboundCommunication({
      connection,
      providerOverride:"telegram",
      channelTypeOverride:"telegram",
      externalMessageId:String(update?.update_id || `${message.chat.id}:${message.message_id}`),
      externalThreadId:String(message.chat.id),
      participantId:String(sender.id),
      participantName:senderName,
      participantAddress:senderAddress,
      recipientAddress:text(credential?.metadata?.bot_username) ? `@${text(credential.metadata.bot_username)}` : null,
      messageType:messageType(message),
      body:messageBody(message),
      receivedAt:message.date ? new Date(Number(message.date) * 1000).toISOString() : null,
      metadata:{
        telegram_message_id:String(message.message_id),
        telegram_chat_id:String(message.chat.id),
        telegram_chat_type:text(message.chat.type) || null,
        telegram_username:text(sender.username) || null,
        telegram_language_code:text(sender.language_code) || null,
        telegram_media_persistence:"PENDING_SECURE_DOWNLOAD",
      },
    });
    return NextResponse.json({ ok:true });
  } catch (error) {
    console.error("TELEGRAM_COMMUNICATION_WEBHOOK_ERROR", error);
    return NextResponse.json({ ok:true });
  }
}
