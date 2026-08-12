export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import crypto from "node:crypto";
import { NextResponse } from "next/server";

import {
  applyCommunicationDeliveryStatus,
  ingestInboundCommunication,
  resolveCommunicationConnectionByAsset,
} from "@/lib/commercial/communications/CommunicationWebhookRuntime";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function validSignature(rawBody, signatureHeader) {
  const appSecret = text(process.env.META_APP_SECRET);
  const provided = text(signatureHeader);
  if (!appSecret || !provided.startsWith("sha256=")) return false;

  const expected = `sha256=${crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

function messageBody(message) {
  const type = text(message?.type).toLowerCase();
  if (type === "text") return message?.text?.body ?? null;
  if (type === "button") return message?.button?.text ?? null;
  if (type === "interactive") {
    return (
      message?.interactive?.button_reply?.title ||
      message?.interactive?.list_reply?.title ||
      null
    );
  }
  if (type === "location") {
    const latitude = message?.location?.latitude;
    const longitude = message?.location?.longitude;
    return latitude != null && longitude != null ? `${latitude}, ${longitude}` : null;
  }
  if (type === "contacts") {
    return message?.contacts?.[0]?.name?.formatted_name || null;
  }
  return (
    message?.image?.caption ||
    message?.video?.caption ||
    message?.document?.caption ||
    null
  );
}

function messageMetadata(message) {
  const type = text(message?.type).toLowerCase();
  const media = object(message?.[type]);
  const metadata = {
    webhook_provider: "meta_whatsapp",
    provider_message_type: type || null,
    context_message_id: message?.context?.id || null,
    referral: message?.referral || null,
  };

  if (media?.id) {
    metadata.media = {
      id: media.id,
      mime_type: media.mime_type || null,
      sha256: media.sha256 || null,
      filename: media.filename || null,
      caption: media.caption || null,
    };
  }

  if (type === "location") metadata.location = message.location || null;
  if (type === "contacts") metadata.contacts = message.contacts || null;
  if (type === "interactive") metadata.interactive = message.interactive || null;

  return metadata;
}

function normalizedStatus(status) {
  const value = text(status).toLowerCase();
  if (value === "sent") return "SENT";
  if (value === "delivered") return "DELIVERED";
  if (value === "read") return "READ";
  if (value === "failed") return "FAILED";
  return null;
}

export async function GET(request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expectedToken = text(process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN);

  if (mode === "subscribe" && expectedToken && token === expectedToken && challenge != null) {
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  return NextResponse.json({ success: false, error: "Webhook verification failed" }, { status: 403 });
}

export async function POST(request) {
  const rawBody = await request.text();
  if (!validSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ success: false, error: "Invalid WhatsApp webhook signature" }, { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ success: false, error: "Invalid webhook payload" }, { status: 400 });
  }

  let processedMessages = 0;
  let processedStatuses = 0;
  let ignoredChanges = 0;

  for (const entry of payload?.entry || []) {
    for (const change of entry?.changes || []) {
      if (change?.field !== "messages") {
        ignoredChanges += 1;
        continue;
      }

      const value = object(change?.value);
      const phoneNumberId = text(value?.metadata?.phone_number_id);
      if (!phoneNumberId) {
        ignoredChanges += 1;
        continue;
      }

      const connection = await resolveCommunicationConnectionByAsset({
        provider: "whatsapp",
        assetType: "whatsapp_phone_number",
        externalId: phoneNumberId,
      });
      if (!connection) {
        ignoredChanges += 1;
        continue;
      }

      const contactNames = new Map(
        (value?.contacts || []).map((contact) => [
          text(contact?.wa_id),
          text(contact?.profile?.name) || null,
        ]),
      );

      for (const message of value?.messages || []) {
        const participantId = text(message?.from);
        const externalMessageId = text(message?.id);
        if (!participantId || !externalMessageId) continue;

        await ingestInboundCommunication({
          connection,
          externalMessageId,
          externalThreadId: participantId,
          participantId,
          participantName: contactNames.get(participantId) || null,
          participantAddress: participantId,
          recipientAddress: value?.metadata?.display_phone_number || phoneNumberId,
          messageType: message?.type || "unknown",
          body: messageBody(message),
          receivedAt: message?.timestamp || null,
          metadata: messageMetadata(message),
        });
        processedMessages += 1;
      }

      for (const status of value?.statuses || []) {
        const mappedStatus = normalizedStatus(status?.status);
        if (!mappedStatus || !status?.id) continue;
        const error = status?.errors?.[0] || null;

        await applyCommunicationDeliveryStatus({
          connection,
          externalMessageId: status.id,
          status: mappedStatus,
          providerTimestamp: status?.timestamp || null,
          errorCode: error?.code || null,
          errorMessage: error?.message || error?.title || null,
          metadata: {
            webhook_provider: "meta_whatsapp",
            conversation: status?.conversation || null,
            pricing: status?.pricing || null,
            recipient_id: status?.recipient_id || null,
            provider_errors: status?.errors || null,
          },
        });
        processedStatuses += 1;
      }
    }
  }

  return NextResponse.json({
    success: true,
    processedMessages,
    processedStatuses,
    ignoredChanges,
  });
}
