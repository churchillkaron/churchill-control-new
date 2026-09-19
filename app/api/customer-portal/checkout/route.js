export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getStripe } from "@/lib/billing/stripe";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { CUSTOMER_PORTAL_COOKIE, getPortalPaymentRequest, markPortalPaymentCheckoutCreated, resolveCustomerPortalSession } from "@/lib/customer-portal/CustomerPortalRuntime";

const ZERO_DECIMAL = new Set(["BIF","CLP","DJF","GNF","JPY","KMF","KRW","MGA","PYG","RWF","UGX","VND","VUV","XAF","XOF","XPF"]);

function minorUnits(amount, currency) {
  const factor = ZERO_DECIMAL.has(currency) ? 1 : 100;
  return Math.round(Number(amount) * factor);
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

    const stripe = getStripe();
    const appOrigin = String(process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin).replace(/\/$/, "");
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

    await supabaseAdmin.from("customer_portal_payment_requests").update({
      bank_account_id: matching[0].id,
      updated_at: new Date().toISOString(),
    }).eq("id", paymentRequest.id).eq("organization_id", session.organization_id);
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
