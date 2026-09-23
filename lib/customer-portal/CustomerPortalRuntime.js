import { createHash, randomBytes } from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { listCustomerPortalDocuments } from "@/lib/customer-portal/CustomerPortalDocumentRuntime";
import { deliverCustomerPortalInviteIfEligible, inspectCustomerPortalInviteState } from "@/lib/customer-portal/CustomerPortalInviteDeliveryRuntime";

export const CUSTOMER_PORTAL_COOKIE = "avantiqo_customer_portal";
export const CUSTOMER_PORTAL_SESSION_DAYS = 30;

export function isCustomerPortalSameOriginRequest(request) {
  const fetchSite = String(request?.headers?.get?.("sec-fetch-site") || "").trim().toLowerCase();
  if (fetchSite === "cross-site") return false;

  const origin = String(request?.headers?.get?.("origin") || "").trim();
  if (!origin) return true;

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function hash(value) {
  return createHash("sha256").update(String(value || "")).digest("hex");
}

function token() {
  return randomBytes(32).toString("base64url");
}

export function createCustomerPortalToken() {
  return token();
}

export function hashCustomerPortalToken(value) {
  return hash(value);
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
  const normalizedSourceType = text(sourceType, 120).toUpperCase() || null;
  const normalizedSourceId = sourceId ? text(sourceId, 500) : null;
  const rawToken = token();
  const expiresAt = new Date(Date.now() + Math.max(15, Number(ttlMinutes) || 10080) * 60000).toISOString();
  const created = await supabaseAdmin.rpc("customer_portal_create_access_link_atomic", {
    p_organization_id: organizationId,
    p_party_id: partyId,
    p_token_hash: hash(rawToken),
    p_source_type: normalizedSourceType,
    p_source_id: normalizedSourceId,
    p_expires_at: expiresAt,
  });
  if (created.error) throw created.error;
  if (!created.data?.id) throw new Error("CUSTOMER_PORTAL_ACCESS_CREATE_FAILED");
  const base = text(process.env.NEXT_PUBLIC_APP_URL, 1000).replace(/\/$/, "");
  return {
    access_link_id: created.data.id,
    expires_at: created.data.expires_at,
    url: base ? `${base}/customer-portal/access?token=${encodeURIComponent(rawToken)}` : `/customer-portal/access?token=${encodeURIComponent(rawToken)}`,
  };
}

export async function provisionCustomerPortalAccess({
  organizationId,
  partyId,
  sourceType,
  sourceId,
  deliverIfConversationAvailable = false,
} = {}) {
  try {
    let ignoreExistingMessage = false;
    if (deliverIfConversationAvailable) {
      const inviteState = await inspectCustomerPortalInviteState({
        organizationId,
        partyId,
        sourceType,
        sourceId,
      });
      if (inviteState.active_session) {
        return {
          provisioned: true,
          access: null,
          delivery: { delivered: false, skipped: true, reason: "ACTIVE_PORTAL_SESSION_EXISTS" },
          error: null,
        };
      }
      if (inviteState.prior_message) {
        const liveLink = await supabaseAdmin.from("customer_portal_access_links")
          .select("id,expires_at")
          .eq("organization_id", organizationId)
          .eq("party_id", partyId)
          .eq("purpose", "PORTAL_ACCESS")
          .eq("source_type", text(sourceType, 120).toUpperCase())
          .eq("source_id", text(sourceId, 500))
          .is("consumed_at", null)
          .is("revoked_at", null)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (liveLink.error) throw liveLink.error;
        if (liveLink.data?.id) {
          return {
            provisioned: true,
            access: null,
            delivery: {
              delivered: ["SENT", "DELIVERED", "READ"].includes(text(inviteState.prior_message.status, 40).toUpperCase()),
              skipped: true,
              reason: "EXISTING_LIVE_PORTAL_INVITE_PRESERVED",
              message_id: inviteState.prior_message.id,
              status: inviteState.prior_message.status,
              access_link_id: liveLink.data.id,
              expires_at: liveLink.data.expires_at,
            },
            error: null,
          };
        }
        ignoreExistingMessage = true;
      }
    }

    const access = await createCustomerPortalAccessLink({
      organizationId,
      partyId,
      sourceType,
      sourceId,
    });
    let delivery = null;
    if (deliverIfConversationAvailable) {
      try {
        delivery = await deliverCustomerPortalInviteIfEligible({
          organizationId,
          partyId,
          access,
          sourceType,
          sourceId,
          ignoreExistingMessage,
        });
      } catch (deliveryError) {
        delivery = {
          delivered: false,
          skipped: false,
          reason: "PORTAL_INVITE_DELIVERY_ERROR",
          error: deliveryError?.message || String(deliveryError),
        };
        console.error("CUSTOMER_PORTAL_INVITE_DELIVERY_ERROR", {
          organizationId,
          partyId,
          sourceType,
          sourceId,
          error: delivery.error,
        });
      }
    }
    return { provisioned: true, access, delivery, error: null };
  } catch (error) {
    console.error("CUSTOMER_PORTAL_PROVISIONING_ERROR", {
      organizationId,
      partyId,
      sourceType,
      sourceId,
      error: error?.message || String(error),
    });
    return {
      provisioned: false,
      access: null,
      error: error?.message || "Customer portal access could not be provisioned",
    };
  }
}


export async function resolveLatestCustomerPortalRelationshipSource({ organizationId, partyId } = {}) {
  if (!organizationId || !partyId) throw new Error("CUSTOMER_PORTAL_SCOPE_REQUIRED");

  const [servicePlans, invoices, orders, quotations, hotelGuests] = await Promise.all([
    supabaseAdmin.from("service_plans")
      .select("id,updated_at,created_at,status")
      .eq("organization_id", organizationId)
      .eq("customer_party_id", partyId)
      .order("updated_at", { ascending: false })
      .limit(5),
    supabaseAdmin.from("customer_invoices")
      .select("id,updated_at,created_at,status")
      .eq("organization_id", organizationId)
      .eq("party_id", partyId)
      .order("updated_at", { ascending: false })
      .limit(5),
    supabaseAdmin.from("sales_orders")
      .select("id,updated_at,created_at,status")
      .eq("organization_id", organizationId)
      .eq("party_id", partyId)
      .order("updated_at", { ascending: false })
      .limit(5),
    supabaseAdmin.from("commercial_quotations")
      .select("id,updated_at,created_at,status")
      .eq("organization_id", organizationId)
      .eq("party_id", partyId)
      .order("updated_at", { ascending: false })
      .limit(5),
    supabaseAdmin.from("hotel_guests")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("party_id", partyId),
  ]);
  for (const result of [servicePlans, invoices, orders, quotations, hotelGuests]) if (result.error) throw result.error;

  const candidates = [];
  const pushRows = (rows, sourceType) => {
    for (const row of rows || []) {
      const status = text(row.status, 80).toUpperCase();
      if (["ARCHIVED", "VOID"].includes(status)) continue;
      candidates.push({
        source_type: sourceType,
        source_id: row.id,
        relationship_at: row.updated_at || row.created_at || null,
      });
    }
  };
  pushRows(servicePlans.data, "SERVICE_PLAN");
  pushRows(invoices.data, "CUSTOMER_INVOICE");
  pushRows(orders.data, "SALES_ORDER");
  pushRows(quotations.data, "COMMERCIAL_QUOTATION");

  const guestIds = (hotelGuests.data || []).map((row) => row.id).filter(Boolean);
  if (guestIds.length) {
    const bookings = await supabaseAdmin.from("hotel_bookings")
      .select("id,updated_at,created_at,status")
      .eq("organization_id", organizationId)
      .in("guest_id", guestIds)
      .order("updated_at", { ascending: false })
      .limit(10);
    if (bookings.error) throw bookings.error;
    pushRows(bookings.data, "HOTEL_BOOKING");
  }

  candidates.sort((a, b) => Date.parse(b.relationship_at || 0) - Date.parse(a.relationship_at || 0));
  return candidates[0] || null;
}

export async function reissueCustomerPortalAccess({ organizationId, partyId } = {}) {
  const source = await resolveLatestCustomerPortalRelationshipSource({ organizationId, partyId });
  if (!source?.source_id) throw new Error("CUSTOMER_PORTAL_ACTIVE_RELATIONSHIP_REQUIRED");
  return createCustomerPortalAccessLink({
    organizationId,
    partyId,
    sourceType: source.source_type,
    sourceId: source.source_id,
  });
}

export async function exchangeCustomerPortalAccessToken(rawToken) {
  const normalized = text(rawToken, 1000);
  if (!normalized) throw new Error("CUSTOMER_PORTAL_ACCESS_INVALID");

  const rawSession = token();
  const sessionTokenHash = hash(rawSession);
  const sessionExpiresAt = new Date(Date.now() + CUSTOMER_PORTAL_SESSION_DAYS * 24 * 60 * 60000).toISOString();
  const exchanged = await supabaseAdmin.rpc("consume_customer_portal_access_token_atomic", {
    p_token_hash: hash(normalized),
    p_session_token_hash: sessionTokenHash,
    p_session_expires_at: sessionExpiresAt,
  });
  if (exchanged.error) {
    const message = String(exchanged.error.message || "");
    if (message.includes("CUSTOMER_PORTAL_ACCESS_INVALID")) {
      throw new Error("CUSTOMER_PORTAL_ACCESS_INVALID");
    }
    throw exchanged.error;
  }

  const exchange = Array.isArray(exchanged.data) ? exchanged.data[0] : exchanged.data;
  const outcome = text(exchange?.outcome, 40).toUpperCase();
  if (outcome === "REVOKED") throw new Error("CUSTOMER_PORTAL_ACCESS_REVOKED");
  if (outcome === "EXPIRED") throw new Error("CUSTOMER_PORTAL_ACCESS_EXPIRED");
  if (outcome === "USED") throw new Error("CUSTOMER_PORTAL_ACCESS_USED");
  if (outcome !== "SUCCESS" || !exchange?.session_id) throw new Error("CUSTOMER_PORTAL_ACCESS_INVALID");
  const session = {
    id: exchange.session_id,
    organization_id: exchange.organization_id,
    party_id: exchange.party_id,
    expires_at: exchange.session_expires_at,
    created_at: exchange.session_created_at,
    revoked_at: null,
  };
  return { rawSessionToken: rawSession, session };
}

export async function consumeCustomerPortalAccessToken(rawToken) {
  try {
    const exchanged = await exchangeCustomerPortalAccessToken(rawToken);
    return {
      success: true,
      rawSessionToken: exchanged.rawSessionToken,
      session: exchanged.session,
    };
  } catch (error) {
    const code = String(error?.message || "CUSTOMER_PORTAL_ACCESS_INVALID");
    const status = code === "CUSTOMER_PORTAL_ACCESS_USED" ? 409 : code === "CUSTOMER_PORTAL_ACCESS_REVOKED" ? 410 : code === "CUSTOMER_PORTAL_ACCESS_EXPIRED" ? 410 : 400;
    return { success: false, error: code, status };
  }
}

export async function resolveCustomerPortalSession(rawCookieToken) {
  const normalized = text(rawCookieToken, 1000);
  if (!normalized) return null;
  const now = new Date();
  const found = await supabaseAdmin.from("customer_portal_sessions")
    .select("*")
    .eq("session_token_hash", hash(normalized))
    .maybeSingle();
  if (found.error) throw found.error;
  const session = found.data || null;
  if (!session?.id || session.revoked_at || new Date(session.expires_at).getTime() <= now.getTime()) return null;
  const touched = await supabaseAdmin.from("customer_portal_sessions")
    .update({ last_seen_at: now.toISOString() })
    .eq("id", session.id)
    .is("revoked_at", null)
    .select("*")
    .maybeSingle();
  if (touched.error) throw touched.error;
  return touched.data?.id ? touched.data : null;
}

export async function revokeCustomerPortalSession(rawCookieToken) {
  const normalized = text(rawCookieToken, 1000);
  if (!normalized) return false;
  const revokedAt = new Date().toISOString();
  const result = await supabaseAdmin.from("customer_portal_sessions")
    .update({ revoked_at: revokedAt, last_seen_at: revokedAt })
    .eq("session_token_hash", hash(normalized))
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();
  if (result.error) throw result.error;
  return Boolean(result.data?.id);
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
export async function customerPortalSnapshot(session) {
  const organizationId = text(session?.organization_id);
  const partyId = text(session?.party_id);
  if (!organizationId || !partyId) throw new Error("CUSTOMER_PORTAL_SCOPE_REQUIRED");
  return loadCustomerPortalData({ organizationId, partyId });
}

export async function loadCustomerPortalData({ organizationId, partyId }) {
  const [partyResult, plansResult, invoicesResult, paymentsResult, conversationsResult, quotationsResult, salesOrdersResult, loyaltyResult, preferencesResult] = await Promise.all([
    supabaseAdmin.from("parties").select("id,display_name,email,phone,address").eq("organization_id", organizationId).eq("id", partyId).maybeSingle(),
    supabaseAdmin.from("service_plans").select("id,entity_id,customer_party_id,service_name,service_category,first_service_at,next_service_at,status,attributes,updated_at").eq("organization_id", organizationId).eq("customer_party_id", partyId).order("updated_at", { ascending: false }).limit(100),
    supabaseAdmin.from("customer_invoices").select("id,entity_id,party_id,invoice_number,invoice_date,due_date,total_amount,outstanding_balance,status,currency_code,sent_at,posted_at").eq("organization_id", organizationId).eq("party_id", partyId).order("invoice_date", { ascending: false }).limit(100),
    supabaseAdmin.from("customer_payments").select("id,customer_invoice_id,payment_date,amount,payment_method,reference_number,payment_number,currency_code,status,posted_at").eq("organization_id", organizationId).eq("party_id", partyId).order("payment_date", { ascending: false }).limit(100),
    supabaseAdmin.from("communication_conversations").select("id,provider,channel_type,subject,status,last_message_at,updated_at").eq("organization_id", organizationId).eq("customer_party_id", partyId).order("updated_at", { ascending: false }).limit(50),
    supabaseAdmin.from("commercial_quotations")
      .select("id,entity_id,quotation_number,status,currency_code,subtotal,discount_amount,tax_amount,total_amount,valid_until,notes,terms,sales_order_id,sent_at,accepted_at,rejected_at,converted_at,created_at,updated_at")
      .eq("organization_id", organizationId)
      .eq("party_id", partyId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabaseAdmin.from("sales_orders")
      .select("id,entity_id,order_number,channel,source_type,source_reference,status,payment_status,fulfillment_status,currency_code,subtotal,discount_amount,tax_amount,total_amount,paid_amount,remaining_balance,notes,confirmed_at,cancelled_at,created_at,updated_at")
      .eq("organization_id", organizationId)
      .eq("party_id", partyId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabaseAdmin.from("customer_loyalty_accounts")
      .select("id,loyalty_points,total_spent,visit_count,tier,last_visit_at,status,program_id,tier_id")
      .eq("organization_id", organizationId)
      .eq("party_id", partyId)
      .order("updated_at", { ascending: false })
      .limit(20),
    supabaseAdmin.from("secretary_contact_profiles")
      .select("party_id,preferred_language,preferred_channel,allow_calls,allow_messages,do_not_disturb,updated_at")
      .eq("organization_id", organizationId)
      .eq("party_id", partyId)
      .maybeSingle(),
  ]);
  for (const result of [partyResult, plansResult, invoicesResult, paymentsResult, conversationsResult, quotationsResult, salesOrdersResult, loyaltyResult, preferencesResult]) if (result.error) throw result.error;

  const plans = plansResult.data || [];
  const planIds = plans.map((row) => row.id).filter(Boolean);
  const occurrenceResult = planIds.length
    ? await supabaseAdmin.from("service_plan_occurrences").select("id,service_plan_id,occurrence_at,status,completed_at").eq("organization_id", organizationId).in("service_plan_id", planIds).order("occurrence_at", { ascending: false }).limit(200)
    : { data: [], error: null };
  if (occurrenceResult.error) throw occurrenceResult.error;

  const invoices = invoicesResult.data || [];
  const guestResult = await supabaseAdmin.from("hotel_guests")
    .select("id,party_id,full_name")
    .eq("organization_id", organizationId).eq("party_id", partyId);
  if (guestResult.error) throw guestResult.error;
  const guestIds = (guestResult.data || []).map((row) => row.id).filter(Boolean);
  const hotelBookingsResult = guestIds.length
    ? await supabaseAdmin.from("hotel_bookings")
        .select("id,guest_id,property_id,room_id,booking_reference,check_in_date,check_out_date,adults,children,status,source,total_amount,paid_amount,payment_status,currency_code,estimated_arrival_at")
        .eq("organization_id", organizationId).in("guest_id", guestIds)
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
        .select("id,conversation_id,direction,body,status,sent_at,received_at,created_at,metadata")
        .eq("organization_id", organizationId)
        .in("conversation_id", conversationIds)
        .order("created_at", { ascending: false })
        .limit(100)
    : { data: [], error: null };
  if (messagesResult.error) throw messagesResult.error;
  const conversationMessages = messagesResult.data || [];
  const bookingRequestMessages = conversationMessages.filter((message) => {
    const context = message?.metadata?.source_context || {};
    return message.direction === "INBOUND" && context.kind === "CUSTOMER_BOOKING_REQUEST";
  });
  const bookingRequestMessageIds = bookingRequestMessages.map((message) => message.id).filter(Boolean);
  const bookingReceptionResult = bookingRequestMessageIds.length
    ? await supabaseAdmin.from("secretary_message_reception_requests")
        .select("id,inbound_message_id,status,decision_action,decision,action_result,response_message_id,completed_at,last_error,updated_at")
        .eq("organization_id", organizationId)
        .eq("contact_party_id", partyId)
        .in("inbound_message_id", bookingRequestMessageIds)
    : { data: [], error: null };
  if (bookingReceptionResult.error) throw bookingReceptionResult.error;
  const receptionByMessage = new Map((bookingReceptionResult.data || []).map((row) => [row.inbound_message_id, row]));
  const messageById = new Map(conversationMessages.map((row) => [row.id, row]));
  const bookingRequests = bookingRequestMessages.map((message) => {
    const context = message?.metadata?.source_context || {};
    const reception = receptionByMessage.get(message.id) || null;
    const responseMessage = reception?.response_message_id ? messageById.get(reception.response_message_id) || null : null;
    const decision = reception?.decision && typeof reception.decision === "object" ? reception.decision : {};
    const actionResult = reception?.action_result && typeof reception.action_result === "object" ? reception.action_result : {};
    const receptionStatus = text(reception?.status, 40).toUpperCase() || "PENDING";
    const decisionAction = text(reception?.decision_action, 80).toUpperCase() || null;
    const resultStatus = text(actionResult?.status || actionResult?.result_status, 80).toUpperCase() || null;
    let customerState = "REQUESTED";
    if (["FAILED", "SKIPPED"].includes(receptionStatus)) customerState = "NEEDS_ATTENTION";
    else if (["PENDING", "PROCESSING"].includes(receptionStatus)) customerState = "PROCESSING";
    else if (receptionStatus === "COMPLETED") {
      if (["CANCEL_APPOINTMENT", "CANCEL_BOOKING", "CANCEL"].includes(decisionAction) && !["FAILED", "ACTION_FAILED"].includes(resultStatus)) customerState = "CANCELLED";
      else if (["RESCHEDULE_APPOINTMENT", "RESCHEDULE_BOOKING", "CHANGE_BOOKING", "RESCHEDULE"].includes(decisionAction) && !["FAILED", "ACTION_FAILED"].includes(resultStatus)) customerState = "CHANGED";
      else if (["CLARIFY", "CHECK_AVAILABILITY", "REQUEST_CALLBACK", "LEAVE_MESSAGE"].includes(decisionAction)) customerState = "AWAITING_FOLLOW_UP";
      else if (resultStatus === "ACTION_FAILED") customerState = "NEEDS_ATTENTION";
      else customerState = "RESPONDED";
    }
    return {
      message_id: message.id,
      conversation_id: message.conversation_id,
      booking_type: context.booking_type || null,
      booking_id: context.booking_id || null,
      parent_id: context.parent_id || null,
      booking_reference: context.booking_reference || null,
      requested_action: context.requested_action || null,
      requested_at: message.received_at || message.created_at || null,
      processing_status: receptionStatus,
      customer_state: customerState,
      decision_action: decisionAction,
      decision_summary: text(decision?.response_text, 2000) || null,
      action_result_status: resultStatus,
      response_message_id: reception?.response_message_id || null,
      response_text: text(responseMessage?.body || decision?.response_text, 4000) || null,
      processed_at: reception?.completed_at || null,
      processing_error: reception?.last_error || null,
    };
  });

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
  const [walletCashResult, walletCreditResult] = await Promise.all([
    supabaseAdmin.from("finance_customer_unapplied_cash")
      .select("id,entity_id,party_id,customer_payment_id,available_amount,currency_code,status,received_at")
      .eq("organization_id", organizationId)
      .eq("party_id", partyId)
      .gt("available_amount", 0),
    supabaseAdmin.from("finance_customer_credits")
      .select("id,entity_id,available_amount,currency_code,status,issued_at,created_at")
      .eq("organization_id", organizationId)
      .eq("party_id", partyId)
      .gt("available_amount", 0),
  ]);
  if (walletCashResult.error) throw walletCashResult.error;
  if (walletCreditResult.error) throw walletCreditResult.error;

  const walletEntries = [
    ...(walletCashResult.data || []).map((row) => ({ ...row, balance_type: "PREPAYMENT" })),
    ...(walletCreditResult.data || []).map((row) => ({ ...row, balance_type: "CUSTOMER_CREDIT" })),
  ];
  const walletByCurrency = new Map();
  for (const row of walletEntries) {
    const currency = text(row.currency_code, 20).toUpperCase();
    const amount = Number(row.available_amount || 0);
    if (!currency || !Number.isFinite(amount) || amount <= 0) continue;
    const current = walletByCurrency.get(currency) || { currency_code: currency, available_amount: 0, prepayment_amount: 0, credit_amount: 0 };
    current.available_amount += amount;
    if (row.balance_type === "PREPAYMENT") current.prepayment_amount += amount;
    if (row.balance_type === "CUSTOMER_CREDIT") current.credit_amount += amount;
    walletByCurrency.set(currency, current);
  }

  const [paymentRequests, customerDocuments] = await Promise.all([
    supabaseAdmin.from("customer_portal_payment_requests")
      .select("id,entity_id,source_type,source_id,description,amount,currency_code,status,settled_at,created_at")
      .eq("organization_id", organizationId)
      .eq("party_id", partyId)
      .order("created_at", { ascending: false }),
    listCustomerPortalDocuments({ organizationId, partyId }),
  ]);
  if (paymentRequests.error) throw paymentRequests.error;

  const updates = [
    ...bookingRequests.map((request) => ({
      id: `booking-request:${request.message_id}`,
      kind: "BOOKING_REQUEST",
      title: request.requested_action === "CANCEL" ? "Booking cancellation" : "Booking change",
      status: request.customer_state,
      detail: request.response_text || request.booking_reference || null,
      occurred_at: request.processed_at || request.requested_at || null,
    })),
    ...(paymentRequests.data || []).map((request) => ({
      id: `payment:${request.id}`,
      kind: "PAYMENT",
      title: request.description || "Payment",
      status: request.status || null,
      detail: request.amount != null ? `${request.amount} ${request.currency_code || ""}`.trim() : null,
      occurred_at: request.settled_at || request.created_at || null,
    })),
    ...invoices.slice(0, 20).map((invoice) => ({
      id: `invoice:${invoice.id}`,
      kind: "INVOICE",
      title: invoice.invoice_number ? `Invoice ${invoice.invoice_number}` : "Invoice",
      status: invoice.status || null,
      detail: invoice.outstanding_balance > 0 ? `${invoice.outstanding_balance} ${invoice.currency_code || ""} outstanding`.trim() : "No outstanding balance",
      occurred_at: invoice.invoice_date || invoice.updated_at || invoice.created_at || null,
    })),
    ...(quotationsResult.data || []).slice(0, 20).map((quote) => ({
      id: `quotation:${quote.id}`,
      kind: "QUOTATION",
      title: quote.quotation_number ? `Quotation ${quote.quotation_number}` : "Quotation",
      status: quote.status || null,
      detail: quote.total_amount != null ? `${quote.total_amount} ${quote.currency_code || ""}`.trim() : null,
      occurred_at: quote.updated_at || quote.created_at || null,
    })),
    ...customerDocuments.slice(0, 20).map((document) => ({
      id: `document:${document.id}`,
      kind: "DOCUMENT",
      title: document.document_name || "Document",
      status: document.document_status || null,
      detail: document.document_type || null,
      occurred_at: document.updated_at || document.created_at || null,
    })),
  ].filter((item) => item.occurred_at).sort((a, b) => Date.parse(b.occurred_at || 0) - Date.parse(a.occurred_at || 0)).slice(0, 30);

  return {
    contract: "AVANTIQO_EXTERNAL_CUSTOMER_PORTAL_V1",
    customer: partyResult.data || null,
    bookings: plans.map((plan) => ({
      id: plan.id,
      entity_id: plan.entity_id,
      service_name: plan.service_name,
      service_category: plan.service_category,
      first_service_at: plan.first_service_at,
      next_service_at: plan.next_service_at,
      status: plan.status,
      updated_at: plan.updated_at,
    })),
    booking_history: occurrenceResult.data || [],
    hotel_bookings: hotelBookings,
    invoices,
    quotations: quotationsResult.data || [],
    sales_orders: salesOrdersResult.data || [],
    loyalty_accounts: loyaltyResult.data || [],
    communication_preferences: preferencesResult.data || {
      preferred_language: null,
      preferred_channel: null,
      allow_calls: true,
      allow_messages: true,
      do_not_disturb: {},
    },
    payments: paymentsResult.data || [],
    wallet: {
      balances: [...walletByCurrency.values()].map((row) => ({
        ...row,
        available_amount: Number(row.available_amount.toFixed(2)),
        prepayment_amount: Number(row.prepayment_amount.toFixed(2)),
        credit_amount: Number(row.credit_amount.toFixed(2)),
      })),
      entries: walletEntries,
      finance_backed: true,
    },
    payable_items: paymentRequests.data || [],
    conversations,
    conversation_history: [...conversationMessages].reverse(),
    booking_requests: bookingRequests,
    documents: customerDocuments,
    updates,
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
