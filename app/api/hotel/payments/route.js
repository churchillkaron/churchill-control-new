import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { getStripe } from "@/lib/billing/stripe";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";

const ZERO_DECIMAL = new Set(["BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"]);
const clean = (value) => String(value ?? "").trim();
const fail = (error, status = 400, extra = {}) => NextResponse.json({ success: false, error, ...extra }, { status });

async function authorize(request, organizationId) {
  const access = await requireOrganizationAccess({ organizationId, request });
  if (!access.success) return { error: fail(access.error, access.status) };
  return { organizationId: access.organizationId };
}

function toMinorUnits(currency, amount) {
  const code = clean(currency).toUpperCase();
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) throw new Error("Payment amount must be greater than zero");
  return Math.round(value * (ZERO_DECIMAL.has(code) ? 1 : 100));
}

async function getPaymentContext(organizationId, bookingId) {
  const { data: booking, error: bookingError } = await supabaseAdmin
    .from("hotel_bookings")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingError) throw bookingError;
  if (!booking) return { error: "Booking not found", status: 404 };
  if (["CANCELLED", "CHECKED_OUT"].includes(String(booking.status || "").toUpperCase())) {
    return { error: "Cancelled or checked-out stays cannot receive a new payment", status: 409 };
  }
  if (!booking.property_id) return { error: "Booking has no property. Resolve Hotel Setup first.", status: 409 };
  if (!booking.guest_id) return { error: "Booking has no guest profile.", status: 409 };

  const [{ data: property, error: propertyError }, { data: guest, error: guestError }] = await Promise.all([
    supabaseAdmin.from("hotel_properties").select("id,name,finance_entity_id,settlement_bank_account_id").eq("organization_id", organizationId).eq("id", booking.property_id).maybeSingle(),
    supabaseAdmin.from("hotel_guests").select("id,full_name,email,party_id").eq("organization_id", organizationId).eq("id", booking.guest_id).maybeSingle(),
  ]);
  if (propertyError) throw propertyError;
  if (guestError) throw guestError;
  if (!property) return { error: "Hotel property not found", status: 409 };
  if (!property.finance_entity_id || !property.settlement_bank_account_id) {
    return { error: `${property.name || "Property"} is not Finance-ready. Assign its legal entity and settlement account in Hotel Setup.`, status: 409, blocker: "PROPERTY_FINANCE_SETUP" };
  }
  if (!guest?.party_id) return { error: "Guest is not linked to a Finance party. Repair the guest profile before payment.", status: 409, blocker: "GUEST_PARTY_LINK" };

  const { data: existingFolio, error: existingFolioError } = await supabaseAdmin
    .from("hotel_folios")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("booking_id", booking.id)
    .maybeSingle();
  if (existingFolioError) throw existingFolioError;
  if (existingFolio?.status === "CLOSED") return { error: "Closed folios cannot receive a new payment", status: 409 };

  let folio = existingFolio;
  if (!folio) {
    const { data, error } = await supabaseAdmin
      .from("hotel_folios")
      .insert({
        organization_id: organizationId,
        property_id: booking.property_id,
        booking_id: booking.id,
        guest_id: booking.guest_id,
        currency_code: booking.currency_code || "THB",
        status: "OPEN",
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw error;
    folio = data;
  }

  return { booking, property, guest, folio };
}

export async function GET(request) {
  try {
    const organizationId = clean(request.nextUrl.searchParams.get("organizationId") || request.nextUrl.searchParams.get("organization_id"));
    const bookingId = clean(request.nextUrl.searchParams.get("bookingId") || request.nextUrl.searchParams.get("booking_id"));
    const propertyId = clean(request.nextUrl.searchParams.get("propertyId") || request.nextUrl.searchParams.get("property_id"));
    const auth = await authorize(request, organizationId);
    if (auth.error) return auth.error;

    let query = supabaseAdmin
      .from("hotel_payment_transactions")
      .select("*")
      .eq("organization_id", auth.organizationId)
      .order("created_at", { ascending: false });
    if (bookingId) query = query.eq("booking_id", bookingId);
    if (propertyId) query = query.eq("property_id", propertyId);
    const { data, error } = await query.limit(250);
    if (error) throw error;

    return NextResponse.json({ success: true, transactions: data || [] });
  } catch (error) {
    console.error("HOTEL_PAYMENT_LIST_ERROR", error);
    return fail(error?.message || "Unable to load Hotel payments", 500);
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = clean(body.organizationId || body.organization_id);
    const bookingId = clean(body.bookingId || body.booking_id);
    const action = clean(body.action).toUpperCase();
    const auth = await authorize(request, organizationId);
    if (auth.error) return auth.error;
    if (!bookingId) return fail("bookingId required");

    if (action === "CREATE_CHECKOUT") {
      const transactionType = clean(body.transactionType || body.transaction_type || "PAYMENT").toUpperCase();
      if (!["PAYMENT", "DEPOSIT"].includes(transactionType)) return fail("transactionType must be PAYMENT or DEPOSIT");
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount <= 0) return fail("Payment amount must be greater than zero");
      const idempotencyKey = clean(body.idempotencyKey || body.idempotency_key);
      if (!idempotencyKey) return fail("idempotencyKey required");

      const context = await getPaymentContext(auth.organizationId, bookingId);
      if (context.error) return fail(context.error, context.status, context.blocker ? { blocker: context.blocker } : {});
      const { booking, property, guest, folio } = context;
      const currency = clean(booking.currency_code || folio.currency_code || "THB").toUpperCase();
      const description = clean(body.description) || (transactionType === "DEPOSIT" ? `Hotel deposit · ${booking.booking_reference || booking.id}` : `Hotel payment · ${booking.booking_reference || booking.id}`);

      const { data: existing, error: existingError } = await supabaseAdmin
        .from("hotel_payment_transactions")
        .select("*")
        .eq("organization_id", auth.organizationId)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) {
        if (existing.booking_id !== booking.id || Number(existing.amount) !== amount || existing.transaction_type !== transactionType) {
          return fail("Idempotency key was already used for a different Hotel payment request", 409);
        }
        if (existing.status === "FAILED") return fail("This payment attempt already failed. Start a new payment request.", 409);
        if (existing.provider_session_id) {
          const stripe = getStripe();
          const session = await stripe.checkout.sessions.retrieve(existing.provider_session_id);
          return NextResponse.json({ success: true, transaction: existing, checkoutUrl: session.url, reused: true, financePostingStatus: existing.finance_payment_id ? "POSTED" : "PENDING_GOVERNED_MAPPING" });
        }
      }

      const transactionId = existing?.id || randomUUID();
      let transaction = existing;
      if (!transaction) {
        const { data, error } = await supabaseAdmin.from("hotel_payment_transactions").insert({
          id: transactionId,
          organization_id: auth.organizationId,
          property_id: booking.property_id,
          booking_id: booking.id,
          folio_id: folio.id,
          guest_id: booking.guest_id,
          party_id: guest.party_id,
          entity_id: property.finance_entity_id,
          bank_account_id: property.settlement_bank_account_id,
          transaction_type: transactionType,
          processor_mode: "AVANTIQO_GATEWAY",
          payment_method: "CARD",
          status: "PENDING",
          amount,
          applied_amount: 0,
          refunded_amount: 0,
          currency_code: currency,
          exchange_rate: 1,
          idempotency_key: idempotencyKey,
          provider: "STRIPE",
          description,
          metadata: { finance_posting_status: "PENDING_GOVERNED_MAPPING", raw_credentials_stored: false },
        }).select().single();
        if (error) throw error;
        transaction = data;
      }

      const stripe = getStripe();
      const origin = clean(process.env.NEXT_PUBLIC_APP_URL) || request.nextUrl.origin;
      const paymentUrl = `${origin}/workspace/${auth.organizationId}/operations/hotel-payments?bookingId=${encodeURIComponent(booking.id)}`;
      const metadata = {
        domain: "hotel",
        hotelTransactionId: transaction.id,
        organizationId: auth.organizationId,
        bookingId: booking.id,
      };

      let session;
      try {
        session = await stripe.checkout.sessions.create({
          mode: "payment",
          payment_method_types: ["card"],
          line_items: [{
            quantity: 1,
            price_data: {
              currency: currency.toLowerCase(),
              unit_amount: toMinorUnits(currency, amount),
              product_data: { name: description },
            },
          }],
          customer_email: guest.email || undefined,
          metadata,
          payment_intent_data: { metadata },
          success_url: `${paymentUrl}&paymentReturn=success&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${paymentUrl}&paymentReturn=cancelled`,
        }, { idempotencyKey: `hotel-checkout:${transaction.id}` });
      } catch (providerError) {
        await supabaseAdmin.from("hotel_payment_transactions").update({ status: "FAILED", failure_reason: providerError?.message || "Checkout provider failure", updated_at: new Date().toISOString() }).eq("organization_id", auth.organizationId).eq("id", transaction.id).eq("status", "PENDING");
        throw providerError;
      }

      const { data: saved, error: saveError } = await supabaseAdmin
        .from("hotel_payment_transactions")
        .update({ provider_session_id: session.id, external_reference: session.id, updated_at: new Date().toISOString() })
        .eq("organization_id", auth.organizationId)
        .eq("id", transaction.id)
        .eq("status", "PENDING")
        .select()
        .single();
      if (saveError) throw saveError;

      return NextResponse.json({ success: true, transaction: saved, checkoutUrl: session.url, financePostingStatus: "PENDING_GOVERNED_MAPPING" });
    }

    if (action === "REFUND") {
      const parentTransactionId = clean(body.transactionId || body.transaction_id || body.parentTransactionId || body.parent_transaction_id);
      const amount = Number(body.amount);
      const idempotencyKey = clean(body.idempotencyKey || body.idempotency_key);
      if (!parentTransactionId || !Number.isFinite(amount) || amount <= 0 || !idempotencyKey) return fail("transactionId, positive amount and idempotencyKey are required");

      const { data: parent, error: parentError } = await supabaseAdmin
        .from("hotel_payment_transactions")
        .select("*")
        .eq("organization_id", auth.organizationId)
        .eq("booking_id", bookingId)
        .eq("id", parentTransactionId)
        .maybeSingle();
      if (parentError) throw parentError;
      if (!parent || parent.status !== "SETTLED" || !["PAYMENT", "DEPOSIT"].includes(parent.transaction_type)) return fail("Only a settled Hotel payment or deposit can be refunded", 409);
      if (parent.processor_mode !== "AVANTIQO_GATEWAY" || parent.provider !== "STRIPE" || !parent.provider_payment_id) return fail("This payment was not processed by the connected Hotel gateway", 409);
      const refundable = Number(parent.amount || 0) - Number(parent.refunded_amount || 0);
      if (amount > refundable + 0.005) return fail(`Refund exceeds remaining refundable amount ${refundable.toFixed(2)} ${parent.currency_code}`, 409);

      const { data: existing, error: existingError } = await supabaseAdmin.from("hotel_payment_transactions").select("*").eq("organization_id", auth.organizationId).eq("idempotency_key", idempotencyKey).maybeSingle();
      if (existingError) throw existingError;
      if (existing) return NextResponse.json({ success: true, transaction: existing, reused: true });

      const refundId = randomUUID();
      const { data: refundTx, error: refundTxError } = await supabaseAdmin.from("hotel_payment_transactions").insert({
        id: refundId,
        organization_id: auth.organizationId,
        property_id: parent.property_id,
        booking_id: parent.booking_id,
        folio_id: parent.folio_id,
        guest_id: parent.guest_id,
        party_id: parent.party_id,
        entity_id: parent.entity_id,
        bank_account_id: parent.bank_account_id,
        transaction_type: "REFUND",
        processor_mode: "AVANTIQO_GATEWAY",
        payment_method: parent.payment_method,
        status: "PENDING",
        amount,
        applied_amount: 0,
        refunded_amount: 0,
        currency_code: parent.currency_code,
        exchange_rate: parent.exchange_rate || 1,
        parent_transaction_id: parent.id,
        idempotency_key: idempotencyKey,
        provider: "STRIPE",
        description: clean(body.description) || `Hotel refund · ${parent.external_reference || parent.id}`,
        metadata: { finance_posting_status: "PENDING_GOVERNED_MAPPING", raw_credentials_stored: false },
      }).select().single();
      if (refundTxError) throw refundTxError;

      const stripe = getStripe();
      let stripeRefund;
      try {
        stripeRefund = await stripe.refunds.create({
          payment_intent: parent.provider_payment_id,
          amount: toMinorUnits(parent.currency_code, amount),
          metadata: { domain: "hotel", hotelTransactionId: refundTx.id, organizationId: auth.organizationId, bookingId },
        }, { idempotencyKey: `hotel-refund:${refundTx.id}` });
      } catch (providerError) {
        await supabaseAdmin.from("hotel_payment_transactions").update({ status: "FAILED", failure_reason: providerError?.message || "Refund provider failure", updated_at: new Date().toISOString() }).eq("id", refundTx.id).eq("organization_id", auth.organizationId);
        throw providerError;
      }

      await supabaseAdmin.from("hotel_payment_transactions").update({ provider_refund_id: stripeRefund.id, external_reference: stripeRefund.id, updated_at: new Date().toISOString() }).eq("id", refundTx.id).eq("organization_id", auth.organizationId);
      if (stripeRefund.status === "succeeded") {
        const { data: reconciled, error: reconcileError } = await supabaseAdmin.rpc("hotel_finalize_gateway_transaction", {
          p_transaction_id: refundTx.id,
          p_provider_event_id: `refund-sync:${stripeRefund.id}`,
          p_provider_payment_id: null,
          p_provider_refund_id: stripeRefund.id,
        });
        if (reconcileError) throw reconcileError;
        return NextResponse.json({ success: true, transactionId: refundTx.id, refund: { id: stripeRefund.id, status: stripeRefund.status }, reconciliation: reconciled, financePostingStatus: "PENDING_GOVERNED_MAPPING" });
      }

      return NextResponse.json({ success: true, transactionId: refundTx.id, refund: { id: stripeRefund.id, status: stripeRefund.status }, financePostingStatus: "PENDING_GOVERNED_MAPPING" });
    }

    return fail("Unsupported Hotel payment action");
  } catch (error) {
    console.error("HOTEL_PAYMENT_ACTION_ERROR", error);
    return fail(error?.message || "Hotel payment action failed", 500);
  }
}
