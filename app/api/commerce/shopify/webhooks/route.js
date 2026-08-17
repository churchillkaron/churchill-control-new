export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { ProviderEventRuntime } from "@/lib/platform/service-runtime/events/runtime/ProviderEventRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const LIFECYCLE_EVENT_TYPES = {
  "orders/paid": "SHOPIFY_ORDER_PAID_OBSERVED",
  "order_transactions/create": "SHOPIFY_ORDER_TRANSACTION_OBSERVED",
  "orders/fulfilled": "SHOPIFY_ORDER_FULFILLED_OBSERVED",
  "orders/partially_fulfilled": "SHOPIFY_ORDER_PARTIALLY_FULFILLED_OBSERVED",
  "refunds/create": "SHOPIFY_REFUND_OBSERVED",
  "fulfillments/create": "SHOPIFY_FULFILLMENT_OBSERVED",
  "fulfillments/update": "SHOPIFY_FULFILLMENT_OBSERVED",
};

function text(value) {
  return String(value ?? "").trim();
}

function clientSecret() {
  return text(process.env.SHOPIFY_CLIENT_SECRET || process.env.SHOPIFY_API_SECRET);
}

function safeEqual(leftValue, rightValue) {
  const left = Buffer.from(String(leftValue || ""));
  const right = Buffer.from(String(rightValue || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function verifiedWebhook(rawBody, signature) {
  const secret = clientSecret();
  if (!secret || !signature) return false;
  const digest = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("base64");
  return safeEqual(digest, signature);
}

async function resolveConnection(shop) {
  const { data, error } = await supabaseAdmin
    .from("organization_channel_connections")
    .select("id,organization_id,provider,status,metadata")
    .eq("provider", "shopify")
    .eq("status", "ACTIVE");
  if (error) throw error;

  return (data || []).find(
    (row) => text(row?.metadata?.shop).toLowerCase() === shop,
  ) || null;
}

function eventValue(payload) {
  for (const candidate of [
    payload?.current_total_price,
    payload?.total_price,
    payload?.subtotal_price,
    payload?.amount,
  ]) {
    const value = Number(candidate);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function customerReference(payload) {
  return text(payload?.customer?.id || payload?.customer_id) || null;
}

function lifecycleIdentity(topic, payload) {
  if (
    topic === "refunds/create" ||
    topic === "order_transactions/create" ||
    topic.startsWith("fulfillments/")
  ) {
    return text(payload?.id) || null;
  }
  return text(payload?.id || payload?.order_id) || null;
}

function lifecycleOrderId(topic, payload) {
  if (
    topic === "refunds/create" ||
    topic === "order_transactions/create" ||
    topic.startsWith("fulfillments/")
  ) {
    return text(payload?.order_id) || null;
  }
  return text(payload?.id || payload?.order_id) || null;
}

async function recordLifecycleObservation({
  connection,
  event,
  topic,
  shop,
  webhookId,
  triggeredAt,
  payload,
}) {
  const eventType = LIFECYCLE_EVENT_TYPES[topic];
  if (!eventType) return null;

  const identity = lifecycleIdentity(topic, payload) || webhookId;
  const result = await supabaseAdmin.rpc("record_system_event_atomic", {
    p_organization_id: connection.organization_id,
    p_type: eventType,
    p_payload: {
      organization_id: connection.organization_id,
      provider: "shopify",
      provider_event_id: event?.id || null,
      connection_id: connection.id,
      shop,
      topic,
      external_id: identity,
      shopify_order_id: lifecycleOrderId(topic, payload),
      shopify_transaction_id:
        topic === "order_transactions/create" ? text(payload?.id) || null : null,
      shopify_refund_id: topic === "refunds/create" ? text(payload?.id) || null : null,
      shopify_fulfillment_id:
        topic.startsWith("fulfillments/") ? text(payload?.id) || null : null,
      observed_at: triggeredAt || new Date().toISOString(),
      provider_payload: payload,
    },
    p_idempotency_key: `shopify-lifecycle:${webhookId}`,
  });
  if (result.error) throw result.error;
  return result.data?.event?.id || null;
}

export async function POST(request) {
  try {
    const rawBody = Buffer.from(await request.arrayBuffer());
    const signature = request.headers.get("x-shopify-hmac-sha256");
    if (!verifiedWebhook(rawBody, signature)) {
      return NextResponse.json({ success: false }, { status: 401 });
    }

    const shop = text(request.headers.get("x-shopify-shop-domain")).toLowerCase();
    const topic = text(request.headers.get("x-shopify-topic")).toLowerCase();
    const webhookId = text(request.headers.get("x-shopify-webhook-id"));
    const triggeredAt = text(request.headers.get("x-shopify-triggered-at")) || null;
    if (!shop || !topic || !webhookId) {
      return NextResponse.json({ success: false }, { status: 400 });
    }

    const connection = await resolveConnection(shop);
    if (!connection) {
      return NextResponse.json({ success: false }, { status: 404 });
    }

    const payload = JSON.parse(rawBody.toString("utf8") || "{}");
    const event = await ProviderEventRuntime.ingest({
      organization_id: connection.organization_id,
      connection_id: connection.id,
      provider_id: "shopify",
      event_type: `shopify.${topic.replace(/\//g, ".")}`,
      external_event_id: webhookId,
      customer_reference: customerReference(payload),
      value: eventValue(payload),
      currency: text(payload?.currency || payload?.presentment_currency) || null,
      payload: {
        topic,
        shop,
        webhook_id: webhookId,
        triggered_at: triggeredAt,
        api_version: text(request.headers.get("x-shopify-api-version")) || null,
        data: payload,
      },
    });

    const lifecycleEventId = await recordLifecycleObservation({
      connection,
      event,
      topic,
      shop,
      webhookId,
      triggeredAt,
      payload,
    });

    return NextResponse.json({
      success: true,
      accepted: true,
      duplicate: event?.duplicate === true,
      lifecycle_event_id: lifecycleEventId,
    });
  } catch (error) {
    console.error("SHOPIFY_WEBHOOK_INGEST_FAILED", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
