import { createHash, randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const CUSTOMER_PORTAL_COOKIE = "avantiqo_customer_portal_session";
export const CUSTOMER_PORTAL_SESSION_DAYS = 30;

function text(value) {
  return String(value ?? "").trim();
}

export function hashCustomerPortalToken(value) {
  return createHash("sha256").update(String(value || "")).digest("hex");
}

export function createCustomerPortalToken() {
  return randomBytes(32).toString("base64url");
}

export async function consumeCustomerPortalAccessToken(rawToken) {
  const token = text(rawToken);
  if (!token) return { success: false, status: 400, error: "Customer access token required" };

  const rawSessionToken = createCustomerPortalToken();
  const tokenHash = hashCustomerPortalToken(token);
  const sessionTokenHash = hashCustomerPortalToken(rawSessionToken);
  const expiresAt = new Date(
    Date.now() + CUSTOMER_PORTAL_SESSION_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data, error } = await supabaseAdmin.rpc(
    "consume_customer_portal_access_token_atomic",
    {
      p_token_hash: tokenHash,
      p_session_token_hash: sessionTokenHash,
      p_session_expires_at: expiresAt,
    }
  );
  if (error) {
    if (
      error.code === "PGRST202" ||
      /consume_customer_portal_access_token_atomic/i.test(String(error.message || ""))
    ) {
      const migrationError = new Error(
        "Customer Portal atomic access migration is not installed"
      );
      migrationError.code = "CUSTOMER_PORTAL_MIGRATION_REQUIRED";
      migrationError.status = 503;
      throw migrationError;
    }
    throw error;
  }

  const row = Array.isArray(data) ? data[0] || null : data || null;
  const outcome = text(row?.outcome).toUpperCase();

  if (outcome === "NOT_FOUND") {
    return { success: false, status: 404, error: "Customer access link not found" };
  }
  if (outcome === "REVOKED") {
    return { success: false, status: 410, error: "Customer access link has been revoked" };
  }
  if (outcome === "EXPIRED") {
    return { success: false, status: 410, error: "Customer access link has expired" };
  }
  if (outcome === "USED") {
    return { success: false, status: 410, error: "Customer access link has already been used" };
  }
  if (outcome !== "SUCCESS" || !row?.session_id) {
    throw new Error("Customer access token exchange did not complete");
  }

  return {
    success: true,
    rawSessionToken,
    session: {
      id: row.session_id,
      organization_id: row.organization_id,
      party_id: row.party_id,
      expires_at: row.session_expires_at,
      created_at: row.session_created_at,
    },
    link: {
      id: row.link_id,
      organization_id: row.organization_id,
      party_id: row.party_id,
      purpose: row.purpose,
      source_type: row.source_type,
      source_id: row.source_id,
    },
  };
}

export async function resolveCustomerPortalSession(rawToken, { touch = true } = {}) {
  const token = text(rawToken);
  if (!token) return { success: false, status: 401, error: "Customer portal session required" };

  const tokenHash = hashCustomerPortalToken(token);
  const now = new Date();
  const { data: session, error } = await supabaseAdmin
    .from("customer_portal_sessions")
    .select("id,organization_id,party_id,expires_at,revoked_at,last_seen_at,created_at")
    .eq("session_token_hash", tokenHash)
    .maybeSingle();
  if (error) throw error;
  if (!session || session.revoked_at || new Date(session.expires_at).getTime() <= now.getTime()) {
    return { success: false, status: 401, error: "Customer portal session is invalid or expired" };
  }

  if (touch) {
    const lastSeen = session.last_seen_at ? new Date(session.last_seen_at).getTime() : 0;
    if (!lastSeen || now.getTime() - lastSeen > 5 * 60 * 1000) {
      await supabaseAdmin
        .from("customer_portal_sessions")
        .update({ last_seen_at: now.toISOString() })
        .eq("id", session.id)
        .is("revoked_at", null);
    }
  }

  return { success: true, session };
}

export async function revokeCustomerPortalSession(rawToken) {
  const resolved = await resolveCustomerPortalSession(rawToken, { touch: false });
  if (!resolved.success) return { success: true, revoked: false };
  const { error } = await supabaseAdmin
    .from("customer_portal_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", resolved.session.id)
    .is("revoked_at", null);
  if (error) throw error;
  return { success: true, revoked: true };
}

export async function customerPortalSnapshot(session) {
  const organizationId = text(session?.organization_id);
  const partyId = text(session?.party_id);
  if (!organizationId || !partyId) {
    return { success: false, status: 401, error: "Customer portal session scope is incomplete" };
  }

  const [
    organizationResult,
    partyResult,
    invoiceResult,
    paymentResult,
    orderResult,
    paymentRequestResult,
    guestResult,
  ] = await Promise.all([
    supabaseAdmin.from("organizations").select("id,name,legal_name").eq("id", organizationId).maybeSingle(),
    supabaseAdmin.from("parties").select("id,organization_id,party_type,display_name,legal_name,email,phone,address,status").eq("organization_id", organizationId).eq("id", partyId).maybeSingle(),
    supabaseAdmin.from("customer_invoices")
      .select("id,entity_id,party_id,invoice_number,invoice_date,due_date,total_amount,outstanding_balance,outstanding_amount,status,currency_code,document_type,sent_at,source_document_type,source_document_id,created_at")
      .eq("organization_id", organizationId).eq("party_id", partyId).order("invoice_date", { ascending: false }).limit(250),
    supabaseAdmin.from("customer_payments")
      .select("id,entity_id,party_id,customer_invoice_id,payment_date,amount,payment_method,reference_number,payment_number,currency_code,status,created_at")
      .eq("organization_id", organizationId).eq("party_id", partyId).order("payment_date", { ascending: false }).limit(250),
    supabaseAdmin.from("sales_orders")
      .select("id,entity_id,party_id,order_number,channel,status,payment_status,fulfillment_status,currency_code,total_amount,paid_amount,remaining_balance,confirmed_at,created_at,updated_at")
      .eq("organization_id", organizationId).eq("party_id", partyId).order("created_at", { ascending: false }).limit(250),
    supabaseAdmin.from("customer_portal_payment_requests")
      .select("id,entity_id,party_id,source_type,source_id,description,amount,currency_code,status,provider,settled_at,created_at,updated_at")
      .eq("organization_id", organizationId).eq("party_id", partyId).order("created_at", { ascending: false }).limit(250),
    supabaseAdmin.from("hotel_guests")
      .select("id,party_id,full_name,email,phone,preferred_language,vip_status")
      .eq("organization_id", organizationId).eq("party_id", partyId),
  ]);

  for (const result of [organizationResult, partyResult, invoiceResult, paymentResult, orderResult, paymentRequestResult, guestResult]) {
    if (result.error) throw result.error;
  }
  if (!organizationResult.data || !partyResult.data) {
    return { success: false, status: 404, error: "Customer relationship is no longer available" };
  }

  const guestIds = (guestResult.data || []).map((row) => row.id).filter(Boolean);
  const bookingResult = guestIds.length
    ? await supabaseAdmin.from("hotel_bookings")
        .select("id,guest_id,property_id,room_id,booking_reference,check_in_date,check_out_date,adults,children,status,source,total_amount,paid_amount,payment_status,currency_code,deposit_required,pre_arrival_status,registration_status,mobile_arrival_status,estimated_arrival_at,created_at,updated_at")
        .eq("organization_id", organizationId).in("guest_id", guestIds).order("check_in_date", { ascending: false }).limit(250)
    : { data: [], error: null };
  if (bookingResult.error) throw bookingResult.error;

  return {
    success: true,
    organization: organizationResult.data,
    customer: partyResult.data,
    invoices: invoiceResult.data || [],
    payments: paymentResult.data || [],
    orders: orderResult.data || [],
    payment_requests: paymentRequestResult.data || [],
    bookings: bookingResult.data || [],
  };
}
