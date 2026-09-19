import { createHash, randomBytes } from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const CUSTOMER_PORTAL_COOKIE = "avantiqo_customer_portal";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function hash(value) {
  return createHash("sha256").update(String(value || "")).digest("hex");
}

function token() {
  return randomBytes(32).toString("base64url");
}

async function one(result) {
  const resolved = await result;
  if (resolved.error) throw resolved.error;
  return resolved.data || null;
}

export async function createCustomerPortalAccessLink({
  organizationId,
  partyId,
  sourceType = null,
  sourceId = null,
  ttlMinutes = 60 * 24 * 7,
} = {}) {
  if (!organizationId || !partyId) throw new Error("CUSTOMER_PORTAL_SCOPE_REQUIRED");
  const rawToken = token();
  const expiresAt = new Date(Date.now() + Math.max(15, Number(ttlMinutes) || 10080) * 60000).toISOString();
  const created = await supabaseAdmin.from("customer_portal_access_links").insert({
    organization_id: organizationId,
    party_id: partyId,
    token_hash: hash(rawToken),
    purpose: "PORTAL_ACCESS",
    source_type: sourceType,
    source_id: sourceId ? String(sourceId) : null,
    expires_at: expiresAt,
  }).select("id,expires_at").single();
  if (created.error) throw created.error;
  const base = text(process.env.NEXT_PUBLIC_APP_URL, 1000).replace(/\/$/, "");
  return {
    access_link_id: created.data.id,
    expires_at: created.data.expires_at,
    url: base ? `${base}/customer-portal/access?token=${encodeURIComponent(rawToken)}` : `/customer-portal/access?token=${encodeURIComponent(rawToken)}`,
  };
}

export async function exchangeCustomerPortalAccessToken(rawToken) {
  const tokenHash = hash(rawToken);
  const now = new Date().toISOString();
  const link = await one(
    supabaseAdmin.from("customer_portal_access_links")
      .select("*")
      .eq("token_hash", tokenHash)
      .is("consumed_at", null)
      .is("revoked_at", null)
      .gt("expires_at", now)
      .maybeSingle(),
  );
  if (!link?.id) throw new Error("CUSTOMER_PORTAL_ACCESS_INVALID");

  const rawSession = token();
  const sessionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60000).toISOString();
  const session = await supabaseAdmin.from("customer_portal_sessions").insert({
    organization_id: link.organization_id,
    party_id: link.party_id,
    session_token_hash: hash(rawSession),
    expires_at: sessionExpiresAt,
    last_seen_at: now,
  }).select("*").single();
  if (session.error) throw session.error;

  const consumed = await supabaseAdmin.from("customer_portal_access_links")
    .update({ consumed_at: now })
    .eq("id", link.id)
    .is("consumed_at", null);
  if (consumed.error) throw consumed.error;

  return { raw_session_token: rawSession, session: session.data };
}
export async function resolveCustomerPortalSession(rawSessionToken) {
  const normalized = text(rawSessionToken, 1000);
  if (!normalized) return null;
  const now = new Date().toISOString();
  const session = await one(
    supabaseAdmin.from("customer_portal_sessions")
      .select("*")
      .eq("session_token_hash", hash(normalized))
      .is("revoked_at", null)
      .gt("expires_at", now)
      .maybeSingle(),
  );
  if (!session?.id) return null;
  await supabaseAdmin.from("customer_portal_sessions")
    .update({ last_seen_at: now })
    .eq("id", session.id);
  return session;
}

function invoiceOutstanding(row = {}) {
  const value = row.outstanding_amount ?? row.outstanding_balance ?? row.amount_due ?? row.total_amount;
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

export async function ensurePortalInvoicePaymentRequests({ organizationId, partyId, invoices = [] }) {
  for (const invoice of invoices) {
    const status = text(invoice.status, 60).toUpperCase();
    const amount = invoiceOutstanding(invoice);
    if (!invoice?.id || amount <= 0 || ["PAID","VOID","CANCELLED","CANCELED","REVERSED"].includes(status)) continue;
    const currency = text(invoice.currency_code, 20).toUpperCase();
    if (!currency) continue;
    const result = await supabaseAdmin.from("customer_portal_payment_requests").upsert({
      organization_id: organizationId,
      entity_id: invoice.entity_id || null,
      party_id: partyId,
      source_type: "CUSTOMER_INVOICE",
      source_id: String(invoice.id),
      description: `Invoice ${invoice.invoice_number || invoice.reference_number || invoice.id}`,
      amount,
      currency_code: currency,
      idempotency_key: `customer-invoice:${invoice.id}`,
      metadata: { invoice_number: invoice.invoice_number || invoice.reference_number || null },
      updated_at: new Date().toISOString(),
    }, { onConflict: "organization_id,source_type,source_id" });
    if (result.error) throw result.error;
  }
}
export async function loadCustomerPortalData({ organizationId, partyId }) {
  const [partyResult, plansResult, invoicesResult, paymentsResult, conversationsResult] = await Promise.all([
    supabaseAdmin.from("parties").select("id,display_name,email,phone,address").eq("organization_id", organizationId).eq("id", partyId).maybeSingle(),
    supabaseAdmin.from("service_plans").select("*").eq("organization_id", organizationId).eq("customer_party_id", partyId).order("updated_at", { ascending: false }).limit(100),
    supabaseAdmin.from("customer_invoices").select("*").eq("organization_id", organizationId).eq("party_id", partyId).order("invoice_date", { ascending: false }).limit(100),
    supabaseAdmin.from("customer_payments").select("*").eq("organization_id", organizationId).eq("party_id", partyId).order("payment_date", { ascending: false }).limit(100),
    supabaseAdmin.from("communication_conversations").select("id,provider,channel_type,subject,status,last_message_at,updated_at").eq("organization_id", organizationId).eq("customer_party_id", partyId).order("updated_at", { ascending: false }).limit(50),
  ]);
  for (const result of [partyResult, plansResult, invoicesResult, paymentsResult, conversationsResult]) if (result.error) throw result.error;

  const plans = plansResult.data || [];
  const planIds = plans.map((row) => row.id).filter(Boolean);
  const occurrenceResult = planIds.length
    ? await supabaseAdmin.from("service_plan_occurrences").select("*").eq("organization_id", organizationId).in("service_plan_id", planIds).order("occurrence_at", { ascending: false }).limit(200)
    : { data: [], error: null };
  if (occurrenceResult.error) throw occurrenceResult.error;

  const invoices = invoicesResult.data || [];
  const guestResult = await supabaseAdmin.from("hotel_guests")
    .select("id,party_id,full_name")
    .eq("organization_id", organizationId)
    .eq("party_id", partyId);
  if (guestResult.error) throw guestResult.error;
  const guestIds = (guestResult.data || []).map((row) => row.id).filter(Boolean);
  const hotelBookingsResult = guestIds.length
    ? await supabaseAdmin.from("hotel_bookings")
        .select("*")
        .eq("organization_id", organizationId)
        .in("guest_id", guestIds)
        .order("check_in_date", { ascending: false })
        .limit(100)
    : { data: [], error: null };
  if (hotelBookingsResult.error) throw hotelBookingsResult.error;
  const hotelBookings = hotelBookingsResult.data || [];
  const propertyIds = [...new Set(hotelBookings.map((row) => row.property_id).filter(Boolean))];
  const propertiesResult = propertyIds.length
    ? await supabaseAdmin.from("hotel_properties")
        .select("id,finance_entity_id")
        .eq("organization_id", organizationId)
        .in("id", propertyIds)
    : { data: [], error: null };
  if (propertiesResult.error) throw propertiesResult.error;
  const propertyById = new Map((propertiesResult.data || []).map((row) => [row.id, row]));

  const conversations = conversationsResult.data || [];
  const conversationIds = conversations.map((row) => row.id).filter(Boolean);
  const messagesResult = conversationIds.length
    ? await supabaseAdmin.from("communication_messages")
        .select("id,conversation_id,direction,body,status,sent_at,received_at,created_at")
        .eq("organization_id", organizationId)
        .in("conversation_id", conversationIds)
        .order("created_at", { ascending: false })
        .limit(100)
    : { data: [], error: null };
  if (messagesResult.error) throw messagesResult.error;

  await ensurePortalInvoicePaymentRequests({ organizationId, partyId, invoices });
  for (const booking of hotelBookings) {
    const outstanding = Math.max(0, Number(booking.total_amount || 0) - Number(booking.paid_amount || 0));
    const status = text(booking.status, 40).toUpperCase();
    const currency = text(booking.currency_code, 20).toUpperCase();
    const entityId = propertyById.get(booking.property_id)?.finance_entity_id || null;
    if (outstanding > 0 && currency && entityId && !["CANCELLED","CHECKED_OUT"].includes(status)) {
      const result = await supabaseAdmin.from("customer_portal_payment_requests").upsert({
        organization_id: organizationId,
        entity_id: entityId,
        party_id: partyId,
        source_type: "HOTEL_BOOKING",
        source_id: String(booking.id),
        description: `Hotel booking ${booking.booking_reference || booking.id}`,
        amount: outstanding,
        currency_code: currency,
        idempotency_key: `hotel-booking:${booking.id}`,
        metadata: { booking_reference: booking.booking_reference || null, property_id: booking.property_id },
        updated_at: new Date().toISOString(),
      }, { onConflict: "organization_id,source_type,source_id" });
      if (result.error) throw result.error;
    }
  }

  for (const plan of plans) {
    const delivery = plan?.attributes?.service_delivery || {};
    const billing = delivery?.billing || {};
    if (
      ["prepaid", "per_visit", "recurring"].includes(text(billing.mode, 40).toLowerCase()) &&
      Number(billing.amount) > 0 &&
      text(billing.currency_code, 20)
    ) {
      await ensurePortalBookingPaymentRequest({
        organizationId,
        entityId: plan.entity_id,
        partyId,
        bookingId: plan.id,
        description: delivery.service_name || plan.name || "Service booking",
        amount: billing.amount,
        currencyCode: billing.currency_code,
      });
    }
  }
  const paymentRequests = await supabaseAdmin.from("customer_portal_payment_requests")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("party_id", partyId)
    .order("created_at", { ascending: false });
  if (paymentRequests.error) throw paymentRequests.error;

  return {
    contract: "AVANTIQO_EXTERNAL_CUSTOMER_PORTAL_V1",
    customer: partyResult.data || null,
    bookings: plans,
    booking_history: occurrenceResult.data || [],
    hotel_bookings: hotelBookings,
    invoices,
    payments: paymentsResult.data || [],
    payable_items: paymentRequests.data || [],
    conversations,
    conversation_history: [...(messagesResult.data || [])].reverse(),
  };
}
export async function getPortalPaymentRequest({ organizationId, partyId, paymentRequestId }) {
  return one(
    supabaseAdmin.from("customer_portal_payment_requests")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("party_id", partyId)
      .eq("id", paymentRequestId)
      .maybeSingle(),
  );
}

export async function markPortalPaymentCheckoutCreated({ paymentRequestId, organizationId, providerSessionId }) {
  const result = await supabaseAdmin.from("customer_portal_payment_requests").update({
    status: "CHECKOUT_CREATED",
    provider_session_id: providerSessionId,
    updated_at: new Date().toISOString(),
  }).eq("organization_id", organizationId).eq("id", paymentRequestId).in("status", ["PENDING","CHECKOUT_CREATED"]).select("*").single();
  if (result.error) throw result.error;
  return result.data;
}

export async function ensurePortalBookingPaymentRequest({
  organizationId,
  entityId,
  partyId,
  bookingId,
  description,
  amount,
  currencyCode,
} = {}) {
  const numericAmount = Number(amount);
  const currency = text(currencyCode, 20).toUpperCase();
  if (!organizationId || !entityId || !partyId || !bookingId || !Number.isFinite(numericAmount) || numericAmount <= 0 || !currency) {
    return null;
  }
  const result = await supabaseAdmin.from("customer_portal_payment_requests").upsert({
    organization_id: organizationId,
    entity_id: entityId,
    party_id: partyId,
    source_type: "SERVICE_BOOKING",
    source_id: String(bookingId),
    description: text(description, 500) || "Service booking",
    amount: numericAmount,
    currency_code: currency,
    idempotency_key: `service-booking:${bookingId}`,
    metadata: { booking_id: String(bookingId) },
    updated_at: new Date().toISOString(),
  }, { onConflict: "organization_id,source_type,source_id" }).select("*").single();
  if (result.error) throw result.error;
  return result.data;
}
