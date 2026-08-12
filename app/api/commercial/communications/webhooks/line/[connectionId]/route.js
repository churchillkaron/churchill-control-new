export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import crypto from "node:crypto";
import { NextResponse } from "next/server";

import {
  ingestInboundCommunication,
  resolveCommunicationConnectionById,
} from "@/lib/commercial/communications/CommunicationWebhookRuntime";
import { get as getProviderCredential } from "@/lib/platform/service-runtime/credentials/repositories/CredentialRepository";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function resolveSecret(reference) {
  const normalized = text(reference);
  if (!normalized) return null;
  if (!normalized.toLowerCase().startsWith("env:")) return normalized;
  const environmentName = normalized.slice(4).trim();
  return environmentName ? text(process.env[environmentName]) || null : null;
}

function validSignature(rawBody, signatureHeader, channelSecret) {
  const provided = text(signatureHeader);
  if (!provided || !channelSecret) return false;
  const expected = crypto
    .createHmac("sha256", channelSecret)
    .update(rawBody)
    .digest("base64");
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

function sourceIdentity(source = {}) {
  const type = text(source.type).toLowerCase();
  const userId = text(source.userId);
  const groupId = text(source.groupId);
  const roomId = text(source.roomId);
  return {
    participantId: userId || groupId || roomId || null,
    threadId: groupId || roomId || userId || null,
    sourceType: type || null,
    userId: userId || null,
    groupId: groupId || null,
    roomId: roomId || null,
  };
}

function messageBody(message = {}) {
  const type = text(message.type).toLowerCase();
  if (type === "text") return message.text ?? null;
  if (type === "file") return message.fileName || null;
  if (type === "location") {
    if (message.address) return message.address;
    if (message.latitude != null && message.longitude != null) {
      return `${message.latitude}, ${message.longitude}`;
    }
  }
  if (type === "sticker") return `Sticker ${message.packageId || ""}/${message.stickerId || ""}`.trim();
  return null;
}

function messageMetadata(event, message = {}) {
  const type = text(message.type).toLowerCase();
  const metadata = {
    webhook_provider: "line",
    webhook_event_id: event?.webhookEventId || null,
    delivery_context: event?.deliveryContext || null,
    reply_token_present: Boolean(event?.replyToken),
    provider_message_type: type || null,
    quote_token: message?.quoteToken || null,
    quoted_message_id: message?.quotedMessageId || null,
  };

  if (["image", "video", "audio", "file"].includes(type)) {
    metadata.media = {
      id: message.id || null,
      content_provider: message.contentProvider || null,
      file_name: message.fileName || null,
      file_size: message.fileSize || null,
      duration: message.duration || null,
    };
  }
  if (type === "location") {
    metadata.location = {
      title: message.title || null,
      address: message.address || null,
      latitude: message.latitude ?? null,
      longitude: message.longitude ?? null,
    };
  }
  if (type === "sticker") {
    metadata.sticker = {
      package_id: message.packageId || null,
      sticker_id: message.stickerId || null,
      sticker_resource_type: message.stickerResourceType || null,
      keywords: message.keywords || null,
    };
  }
  return metadata;
}

async function verifiedConnection(connectionId, rawBody, signatureHeader) {
  const connection = await resolveCommunicationConnectionById({
    provider: "line",
    connectionId,
  });
  if (!connection?.credentials_reference) return { connection: null, valid: false };

  const credential = await getProviderCredential(connection.credentials_reference);
  const metadata = object(credential?.metadata);
  const credentialMatches =
    text(credential?.provider_id).toLowerCase() === "line" &&
    text(metadata.organization_id) === text(connection.organization_id) &&
    text(metadata.purpose).toUpperCase() === "ORGANIZATION_LINE_MESSAGING" &&
    metadata.enabled !== false;
  if (!credentialMatches) return { connection: null, valid: false };

  const channelSecret = resolveSecret(credential.secret_reference);
  return {
    connection,
    valid: validSignature(rawBody, signatureHeader, channelSecret),
  };
}

export async function POST(request, { params }) {
  const { connectionId } = await params;
  const rawBody = await request.text();
  const verified = await verifiedConnection(
    connectionId,
    rawBody,
    request.headers.get("x-line-signature"),
  );

  if (!verified.valid || !verified.connection) {
    return NextResponse.json({ success: false, error: "Invalid LINE webhook signature" }, { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ success: false, error: "Invalid webhook payload" }, { status: 400 });
  }

  const connection = verified.connection;
  const expectedDestination = text(object(connection.metadata).bot_user_id);
  if (expectedDestination && text(payload?.destination) !== expectedDestination) {
    return NextResponse.json({ success: false, error: "LINE webhook destination mismatch" }, { status: 403 });
  }

  let processedMessages = 0;
  let ignoredEvents = 0;

  for (const event of payload?.events || []) {
    if (event?.type !== "message" || !event?.message?.id) {
      ignoredEvents += 1;
      continue;
    }

    const source = sourceIdentity(event.source || {});
    if (!source.participantId || !source.threadId) {
      ignoredEvents += 1;
      continue;
    }

    await ingestInboundCommunication({
      connection,
      externalMessageId: event.message.id,
      externalThreadId: source.threadId,
      participantId: source.participantId,
      participantAddress: source.participantId,
      recipientAddress: payload.destination || expectedDestination || null,
      messageType: event.message.type || "unknown",
      body: messageBody(event.message),
      receivedAt: event.timestamp || null,
      metadata: {
        ...messageMetadata(event, event.message),
        source_type: source.sourceType,
        source_user_id: source.userId,
        source_group_id: source.groupId,
        source_room_id: source.roomId,
        mode: event.mode || null,
      },
    });
    processedMessages += 1;
  }

  return NextResponse.json({ success: true, processedMessages, ignoredEvents });
}
