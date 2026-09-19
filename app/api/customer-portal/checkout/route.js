export const dynamic = "force-dynamic";

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { getStripe } from "@/lib/billing/stripe";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  CUSTOMER_PORTAL_COOKIE,
  getPortalPaymentRequest,
  markPortalPaymentCheckoutCreated,
  resolveCustomerPortalSession,
} from "@/lib/customer-portal/CustomerPortalRuntime";

const ZERO_DECIMAL = new Set(["BIF","CLP","DJF","GNF","JPY","KMF","KRW","MGA","PYG","RWF","UGX","VND","VUV","XAF","XOF","XPF"]);

function minorUnits(amount, currency) {
  return Math.round(Number(amount) * (ZERO_DECIMAL.has(currency) ? 1 : 100));
}

async function createHotelCheckout({ session, paymentRequest, stripe, appOrigin }) {
  const bookingResult = await supabaseAdmin.from("hotel_bookings")
    .select("*")
    .eq("organization_id", session.organization_id)
    .eq("id", paymentRequest.source_id)
    .maybeSingle();
  if (bookingResult.error) throw bookingResult.error;
  const booking = bookingResult.data;
  if (!booking) throw new Error("Hotel booking not found");
  if (["CANCELLED","CHECKED_OUT"].includes(String(booking.status || "").toUpperCase())) throw new Error("This hotel booking can no longer receive payment");

  const [guestResult, propertyResult] = await Promise.all([
    supabaseAdmin.from("hotel_guests").select("id,party_id,email").eq("organization_id", session.organization_id).eq("id", booking.guest_id).maybeSingle(),
    supabaseAdmin.from("hotel_properties").select("id,finance_entity_id,settlement_bank_account_id,customer_deposit_account_id").eq("organization_id", session.organization_id).eq("id", booking.property_id).maybeSingle(),
  ]);
  if (guestResult.error) throw guestResult.error;
  if (propertyResult.error) throw propertyResult.error;
  if (guestResult.data?.party_id !== session.party_id) throw new Error("Hotel booking does not belong to this customer");
  const property = propertyResult.data;
  if (!property?.finance_entity_id || !property?.settlement_bank_account_id || !property?.customer_deposit_account_id) {
    throw new Error("Hotel payment setup is incomplete for this property");
  }

  let folioResult = await supabaseAdmin.from("hotel_folios")
    .select("*")
    .eq("organization_id", session.organization_id)
    .eq("booking_id", booking.id)
    .maybeSingle();
  if (folioResult.error) throw folioResult.error;
  let folio = folioResult.data;
  if (!folio) {
    folioResult = await supabaseAdmin.from("hotel_folios").insert({
      organization_id: session.organization_id,
      property_id: booking.property_id,
      booking_id: booking.id,
      guest_id: booking.guest_id,
      currency_code: booking.currency_code || paymentRequest.currency_code,
      status: "OPEN",
      updated_at: new Date().toISOString(),
    }).select("*").single();
    if (folioResult.error) throw folioResult.error;
    folio = folioResult.data;
  }
  if (folio.status === "CLOSED") throw new Error("Closed hotel folios cannot receive payment");

  const existing = await supabaseAdmin.from("hotel_payment_transactions")
    .select("*")
    .eq("organization_id", session.organization_id)
    .eq("idempotency_key", `customer-portal-hotel:${paymentRequest.id}`)
    .maybeSingle();
  if (existing.error) throw existing.error;

  let transaction = existing.data;
  if (!transaction) {
    const created = await supabaseAdmin.from("hotel_payment_transactions").insert({
      id: randomUUID(),
      organization_id: session.organization_id,
      property_id: booking.property_id,
      booking_id: booking.id,
      folio_id: folio.id,
      guest_id: booking.guest_id,
      party_id: session.party_id,
      entity_id: property.finance_entity_id,
      bank_account_id: property.settlement_bank_account_id,
      transaction_type: "PAYMENT",
      processor_mode: "AVANTIQO_GATEWAY",
      payment_method: "CARD",
      status: "PENDING",
      amount: Number(paymentRequest.amount),
      applied_amount: 0,
      refunded_amount: 0,
      currency_code: paymentRequest.currency_code,
      exchange_rate: 1,
      idempotency_key: `customer-portal-hotel:${paymentRequest.id}`,
      provider: "STRIPE",
      description: paymentRequest.description,
      metadata: { source: "customer_portal", portal_payment_request_id: paymentRequest.id },
    }).select("*").single();
    if (created.error) throw created.error;
    transaction = created.data;
  }

  if (transaction.provider_session_id) {
    const prior = await stripe.checkout.sessions.retrieve(transaction.provider_session_id);
    return { checkout: prior, bankAccountId: property.settlement_bank_account_id };
  }

  const metadata = {
    domain: "hotel",
    hotelTransactionId: transaction.id,
    portalPaymentRequestId: paymentRequest.id,
    organizationId: session.organization_id,
    bookingId: booking.id,
  };
  const checkout = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    line_items: [{
      quantity: 1,
      price_data: {
        currency: String(paymentRequest.currency_code).toLowerCase(),
        unit_amount: minorUnits(paymentRequest.amount, String(paymentRequest.currency_code).toUpperCase()),
        product_data: { name: paymentRequest.description },
      },
    }],
    customer_email: guestResult.data?.email || undefined,
    metadata,
    payment_intent_data: { metadata },
    success_url: `${appOrigin}/customer-portal?payment=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appOrigin}/customer-portal?payment=cancelled`,
  }, { idempotencyKey: `customer-portal-hotel-checkout:${transaction.id}` });

  const saved = await supabaseAdmin.from("hotel_payment_transactions").update({
    provider_session_id: checkout.id,
    external_reference: checkout.id,
    updated_at: new Date().toISOString(),
  }).eq("organization_id", session.organization_id).eq("id", transaction.id).eq("status", "PENDING");
  if (saved.error) throw saved.error;
  return { checkout, bankAccountId: property.settlement_bank_account_id };
}

export async function POST(request) {
  try {
    const session = await resolveCustomerPortalSession(request.cookies.get(CUSTOMER_PORTAL_COOKIE)?.value || null);
    if (!session) return NextResponse.json({ success: false, error: "Customer portal session required" }, { status: 401 });

    const body = await request.json();
    const paymentRequest = await getPortalPaymentRequest({
      organizationId: session.organization_id,
      partyId: session.party_id,
      paymentRequestId: body.payment_request_id || body.paymentRequestId,
    });
    if (!paymentRequest) return NextResponse.json({ success: false, error: "Payment request not found" }, { status: 404 });
    if (paymentRequest.status === "PAID") return NextResponse.json({ success: true, paid: true });

    const stripe = getStripe();
    const appOrigin = String(process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin).replace(/\/$/, "");

    if (paymentRequest.source_type === "HOTEL_BOOKING") {
      const hotel = await createHotelCheckout({ session, paymentRequest, stripe, appOrigin });
      await supabaseAdmin.from("customer_portal_payment_requests").update({
        bank_account_id: hotel.bankAccountId,
        updated_at: new Date().toISOString(),
      }).eq("organization_id", session.organization_id).eq("id", paymentRequest.id);
      await markPortalPaymentCheckoutCreated({
        paymentRequestId: paymentRequest.id,
        organizationId: session.organization_id,
        providerSessionId: hotel.checkout.id,
      });
      return NextResponse.json({ success: true, checkout_url: hotel.checkout.url });
    }

    const currency = String(paymentRequest.currency_code || "").toUpperCase();
    const banks = await supabaseAdmin.from("bank_accounts")
      .select("id,currency,currency_code,finance_account_id,is_default,active")
      .eq("organization_id", session.organization_id)
      .eq("entity_id", paymentRequest.entity_id)
      .eq("active", true)
      .eq("is_default", true);
    if (banks.error) throw banks.error;
    const matching = (banks.data || []).filter((row) => {
      const bankCurrency = String(row.currency_code || row.currency || "").toUpperCase();
      return (!bankCurrency || bankCurrency === currency) && row.finance_account_id;
    });
    if (matching.length !== 1) throw new Error("A single default settlement bank account is required for this currency");

    const checkout = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [{
        quantity: 1,
        price_data: {
          currency: currency.toLowerCase(),
          unit_amount: minorUnits(paymentRequest.amount, currency),
          product_data: { name: paymentRequest.description },
        },
      }],
      metadata: {
        domain: "customer_portal",
        portalPaymentRequestId: paymentRequest.id,
        organizationId: session.organization_id,
        partyId: session.party_id,
      },
      success_url: `${appOrigin}/customer-portal?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appOrigin}/customer-portal?payment=cancelled`,
    });

    const bankUpdate = await supabaseAdmin.from("customer_portal_payment_requests").update({
      bank_account_id: matching[0].id,
      updated_at: new Date().toISOString(),
    }).eq("id", paymentRequest.id).eq("organization_id", session.organization_id);
    if (bankUpdate.error) throw bankUpdate.error;

    await markPortalPaymentCheckoutCreated({
      paymentRequestId: paymentRequest.id,
      organizationId: session.organization_id,
      providerSessionId: checkout.id,
    });
    return NextResponse.json({ success: true, checkout_url: checkout.url });
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Unable to start card payment" }, { status: 400 });
  }
}
