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

function messagingWebhookVerifyToken() {
  const configured = text(process.env.META_MESSAGING_WEBHOOK_VERIFY_TOKEN);
  if (configured) return configured;

  const appSecret = text(process.env.META_APP_SECRET);
  if (!appSecret) return null;

  return crypto
    .createHash("sha256")
    .update(`avantiqo:meta-messaging-webhook:${appSecret}`)
    .digest("hex");
}

function validSignature(rawBody, signatureHeader) {
  const appSecret = text(process.env.META_APP_SECRET);
  const provided = text(signatureHeader);
  if (!appSecret || !provided.startsWith("sha256=")) return false;

  const expected = `sha256=${crypto
    .createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex")}`;
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

function stableEventId(prefix, event = {}) {
  const seed = JSON.stringify({
    prefix,
    sender: event?.sender?.id || null,
    recipient: event?.recipient?.id || null,
    timestamp: event?.timestamp || null,
    postback: event?.postback?.payload || null,
    referral: event?.referral || null,
  });
  return `${prefix}_${crypto.createHash("sha256").update(seed).digest("hex")}`;
}

function messageAttachments(message = {}) {
  return (Array.isArray(message.attachments) ? message.attachments : [])
    .map((entry, index) => {
      const attachment = object(entry);
      const payload = object(attachment.payload);
      const url = text(payload.url || attachment.url);
      if (!url) return null;
      const providerType = text(attachment.type).toLowerCase() || "file";
      return {
        external_url: url,
        file_name:
          text(attachment.title || payload.title || attachment.name) ||
          `${providerType}-${index + 1}`,
        mime_type: text(attachment.mime_type || payload.mime_type) || null,
        metadata: {
          source: "META_MESSAGING_WEBHOOK",
          provider_attachment_type: providerType,
          provider_attachment: attachment,
        },
      };
    })
    .filter(Boolean);
}

function messageBody(message = {}) {
  if (message.text != null) return String(message.text);
  const attachment = Array.isArray(message.attachments)
    ? message.attachments[0]
    : null;
  return attachment?.title || attachment?.payload?.title || null;
}

function messageType(message = {}) {
  const attachments = messageAttachments(message);
  if (message.text != null && attachments.length) return "mixed";
  if (message.text != null) return "text";
  const attachmentType = text(message?.attachments?.[0]?.type);
  return attachmentType || "message";
}

function messageMetadata(event = {}) {
  const message = object(event.message);
  return {
    webhook_provider: "meta_messaging",
    attachment_count: Array.isArray(message.attachments) ? message.attachments.length : 0,
    quick_reply: message.quick_reply || null,
    reply_to: message.reply_to || null,
    referral: event.referral || null,
    message_echo: message.is_echo === true,
  };
}

async function connectionForEvent({ objectType, entryId, recipientId }) {
  const ids = [...new Set([text(entryId), text(recipientId)].filter(Boolean))];
  const preferInstagram = text(objectType).toLowerCase() === "instagram";
  const types = preferInstagram
    ? ["instagram_business", "facebook_page"]
    : ["facebook_page", "instagram_business"];

  for (const assetType of types) {
    for (const externalId of ids) {
      const connection = await resolveCommunicationConnectionByAsset({
        provider: "meta",
        assetType,
        externalId,
      });
      if (connection) {
        return {
          connection,
          providerOverride:
            assetType === "instagram_business"
              ? "instagram_messaging"
              : "facebook_messenger",
          channelTypeOverride:
            assetType === "instagram_business" ? "instagram" : "messenger",
        };
      }
    }
  }

  return null;
}

export async function GET(request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expectedToken = messagingWebhookVerifyToken();

  if (
    mode === "subscribe" &&
    expectedToken &&
    token === expectedToken &&
    challenge != null
  ) {
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return NextResponse.json(
    { success: false, error: "Webhook verification failed" },
    { status: 403 },
  );
}

export async function POST(request) {
  const rawBody = await request.text();
  if (!validSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json(
      { success: false, error: "Invalid Meta webhook signature" },
      { status: 401 },
    );
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid webhook payload" },
      { status: 400 },
    );
  }

  let processedMessages = 0;
  let processedStatuses = 0;
  let ignoredEvents = 0;
  let totalEvents = 0;
  let resolvedInstagramEvents = 0;
  let resolvedMessengerEvents = 0;
  const objectType = text(payload?.object).toLowerCase();
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];

  for (const entry of entries) {
    const events = Array.isArray(entry?.messaging) ? entry.messaging : [];
    totalEvents += events.length;

    for (const event of events) {
      const resolved = await connectionForEvent({
        objectType,
        entryId: entry?.id,
        recipientId: event?.recipient?.id,
      });
      if (!resolved) {
        ignoredEvents += 1;
        continue;
      }

      const { connection, providerOverride, channelTypeOverride } = resolved;
      if (channelTypeOverride === "instagram") {
        resolvedInstagramEvents += 1;
      } else if (channelTypeOverride === "messenger") {
        resolvedMessengerEvents += 1;
      }

      const participantId = text(event?.sender?.id);
      const recipientId = text(event?.recipient?.id || entry?.id);

      if (event?.message) {
        if (event.message.is_echo === true) {
          if (event.message.mid) {
            await applyCommunicationDeliveryStatus({
              connection,
              providerOverride,
              externalMessageId: event.message.mid,
              status: "SENT",
              providerTimestamp: event.timestamp || null,
              metadata: {
                webhook_provider: "meta_messaging",
                message_echo: true,
              },
            });
            processedStatuses += 1;
          } else {
            ignoredEvents += 1;
          }
          continue;
        }

        const externalMessageId = text(event.message.mid);
        if (!participantId || !externalMessageId) {
          ignoredEvents += 1;
          continue;
        }

        await ingestInboundCommunication({
          connection,
          providerOverride,
          channelTypeOverride,
          conversationMetadata: {
            meta_object_type: objectType || null,
            meta_account_id: recipientId || entry?.id || null,
          },
          externalMessageId,
          externalThreadId: participantId,
          participantId,
          participantAddress: participantId,
          recipientAddress: recipientId || entry?.id || null,
          messageType: messageType(event.message),
          body: messageBody(event.message),
          receivedAt: event.timestamp || null,
          metadata: messageMetadata(event),
          attachments: messageAttachments(event.message),
        });
        processedMessages += 1;
        continue;
      }

      if (event?.postback && participantId) {
        const externalMessageId =
          text(event.postback.mid) || stableEventId("meta_postback", event);
        await ingestInboundCommunication({
          connection,
          providerOverride,
          channelTypeOverride,
          conversationMetadata: {
            meta_object_type: objectType || null,
            meta_account_id: recipientId || entry?.id || null,
          },
          externalMessageId,
          externalThreadId: participantId,
          participantId,
          participantAddress: participantId,
          recipientAddress: recipientId || entry?.id || null,
          messageType: "postback",
          body:
            event.postback.title ||
            event.postback.payload ||
            "Postback",
          receivedAt: event.timestamp || null,
          metadata: {
            webhook_provider: "meta_messaging",
            postback: event.postback,
            referral: event.referral || null,
          },
        });
        processedMessages += 1;
        continue;
      }

      if (event?.delivery?.mids?.length) {
        for (const messageId of event.delivery.mids) {
          await applyCommunicationDeliveryStatus({
            connection,
            providerOverride,
            externalMessageId: messageId,
            status: "DELIVERED",
            providerTimestamp: event.delivery.watermark || event.timestamp || null,
            metadata: {
              webhook_provider: "meta_messaging",
              delivery: event.delivery,
            },
          });
          processedStatuses += 1;
        }
        continue;
      }

      ignoredEvents += 1;
    }
  }

  console.info("META_MESSAGING_WEBHOOK_RESULT", {
    objectType: objectType || "unknown",
    entryCount: entries.length,
    totalEvents,
    resolvedInstagramEvents,
    resolvedMessengerEvents,
    processedMessages,
    processedStatuses,
    ignoredEvents,
  });

  return NextResponse.json({
    success: true,
    processedMessages,
    processedStatuses,
    ignoredEvents,
  });
}
