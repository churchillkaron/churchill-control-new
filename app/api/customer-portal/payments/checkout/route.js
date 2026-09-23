import { NextResponse } from "next/server";
import { StripeProvider } from "@/lib/platform/service-runtime/providers/stripe/StripeProvider";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  CUSTOMER_PORTAL_COOKIE,
  resolveCustomerPortalSession,
} from "@/lib/customer-portal/CustomerPortalRuntime";

export const dynamic = "force-dynamic";

const ZERO_DECIMAL = new Set([
  "BIF","CLP","DJF","GNF","JPY","KMF","KRW","MGA","PYG","RWF",
  "UGX","VND","VUV","XAF","XOF","XPF",
]);

function clean(value) {
  return String(value ?? "").trim();
}

function toMinorUnits(currency, amount) {
  const code = clean(currency).toUpperCase();
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) throw new Error("CUSTOMER_PORTAL_PAYMENT_AMOUNT_INVALID");
  return Math.round(value * (ZERO_DECIMAL.has(code) ? 1 : 100));
}

async function resolveMerchantAccount(requestRow) {
  let query = supabaseAdmin
    .from("organization_payment_provider_accounts")
    .select("id,organization_id,entity_id,provider,provider_account_id,status,charges_enabled,payouts_enabled,details_submitted")
    .eq("organization_id", requestRow.organization_id)
    .eq("provider", "stripe")
    .eq("purpose", "merchant_payments");

  if (requestRow.entity_id) {
    query = query.eq("entity_id", requestRow.entity_id);
  } else {
    query = query.is("entity_id", null);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data?.provider_account_id || data.charges_enabled !== true) {
    return null;
  }
  return data;
}

export async function POST(request) {
  try {
    const rawSession = request.cookies.get(CUSTOMER_PORTAL_COOKIE)?.value || "";
    const sessionResult = await resolveCustomerPortalSession(rawSession);
    if (!sessionResult.success) {
      return NextResponse.json(sessionResult, { status: sessionResult.status || 401 });
    }

    const body = await request.json().catch(() => ({}));
    const paymentRequestId = clean(body.paymentRequestId || body.payment_request_id);
    if (!paymentRequestId) {
      return NextResponse.json({ success: false, error: "paymentRequestId required" }, { status: 400 });
    }

    const portalSession = sessionResult.session;
    const { data: paymentRequest, error: paymentRequestError } = await supabaseAdmin
      .from("customer_portal_payment_requests")
      .select("*")
      .eq("id", paymentRequestId)
      .eq("organization_id", portalSession.organization_id)
      .eq("party_id", portalSession.party_id)
      .maybeSingle();
    if (paymentRequestError) throw paymentRequestError;
    if (!paymentRequest) {
      return NextResponse.json({ success: false, error: "Customer payment request not found in this portal session" }, { status: 404 });
    }

    const status = clean(paymentRequest.status).toUpperCase();
    if (status === "PAID") {
      return NextResponse.json({ success: false, error: "This payment request is already paid" }, { status: 409 });
    }
    if (["CANCELLED","REFUNDED"].includes(status)) {
      return NextResponse.json({ success: false, error: "This payment request is no longer payable" }, { status: 409 });
    }
    if (!["PENDING","CHECKOUT_CREATED","FAILED"].includes(status)) {
      return NextResponse.json({ success: false, error: "This payment request is not payable" }, { status: 409 });
    }

    if (!paymentRequest.bank_account_id) {
      return NextResponse.json(
        { success: false, error: "Customer payment request has no Finance settlement bank account" },
        { status: 409 },
      );
    }

    if (paymentRequest.source_type === "CUSTOMER_INVOICE") {
      const { data: invoice, error: invoiceError } = await supabaseAdmin
        .from("customer_invoices")
        .select("id,organization_id,entity_id,party_id,status,outstanding_balance,outstanding_amount,total_amount,currency_code")
        .eq("organization_id", paymentRequest.organization_id)
        .eq("id", paymentRequest.source_id)
        .maybeSingle();
      if (invoiceError) throw invoiceError;
      if (
        !invoice ||
        String(invoice.party_id) !== String(paymentRequest.party_id) ||
        String(invoice.entity_id || "") !== String(paymentRequest.entity_id || "")
      ) {
        return NextResponse.json({ success: false, error: "Customer invoice scope no longer matches this payment request" }, { status: 409 });
      }
      const outstanding = Number(invoice.outstanding_balance ?? invoice.outstanding_amount ?? invoice.total_amount ?? 0);
      if (!Number.isFinite(outstanding) || Math.abs(outstanding - Number(paymentRequest.amount || 0)) >= 0.005) {
        return NextResponse.json({ success: false, error: "Customer invoice balance changed. Ask the business for a new payment request." }, { status: 409 });
      }
      if (clean(invoice.currency_code).toUpperCase() !== clean(paymentRequest.currency_code).toUpperCase()) {
        return NextResponse.json({ success: false, error: "Customer invoice currency no longer matches this payment request" }, { status: 409 });
      }
    }

    const merchant = await resolveMerchantAccount(paymentRequest);
    if (!merchant) {
      return NextResponse.json(
        { success: false, error: "Card payments are not ready for this business or legal entity" },
        { status: 409 },
      );
    }

    if (status === "CHECKOUT_CREATED" && paymentRequest.provider_session_id) {
      const existing = await StripeProvider.retrieveCheckoutSession({
        organizationId: paymentRequest.organization_id,
        connectedAccountId: merchant.provider_account_id,
        sessionId: paymentRequest.provider_session_id,
      });
      if (existing?.url) {
        return NextResponse.json({
          success: true,
          checkout_url: existing.url,
          payment_request: paymentRequest,
          reused: true,
        });
      }
    }

    const { data: party, error: partyError } = await supabaseAdmin
      .from("parties")
      .select("id,email,display_name,legal_name")
      .eq("organization_id", paymentRequest.organization_id)
      .eq("id", paymentRequest.party_id)
      .maybeSingle();
    if (partyError) throw partyError;
    if (!party) {
      return NextResponse.json({ success: false, error: "Customer Party no longer exists" }, { status: 409 });
    }

    const currency = clean(paymentRequest.currency_code).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      return NextResponse.json({ success: false, error: "Payment request currency is invalid" }, { status: 409 });
    }

    const configuredOrigin =
      clean(process.env.NEXT_PUBLIC_APP_URL).replace(/\/$/, "") ||
      request.nextUrl.origin;
    const returnUrl = `${configuredOrigin}/customer-portal/payments`;
    const metadata = {
      domain: "customer_portal",
      portalPaymentRequestId: paymentRequest.id,
      organizationId: paymentRequest.organization_id,
      entityId: paymentRequest.entity_id || "",
      partyId: paymentRequest.party_id,
      sourceType: paymentRequest.source_type,
      sourceId: paymentRequest.source_id,
    };

    let checkout;
    try {
      checkout = await StripeProvider.createPaymentCheckout({
        organizationId: paymentRequest.organization_id,
        connectedAccountId: merchant.provider_account_id,
        idempotencyKey: `customer-portal-checkout:${paymentRequest.id}:v${Number(paymentRequest.metadata?.checkout_version || 1)}`,
        session: {
          mode: "payment",
          payment_method_types: ["card"],
          line_items: [{
            quantity: 1,
            price_data: {
              currency: currency.toLowerCase(),
              unit_amount: toMinorUnits(currency, paymentRequest.amount),
              product_data: {
                name: clean(paymentRequest.description) || "Customer payment",
              },
            },
          }],
          customer_email: clean(party.email) || undefined,
          metadata,
          payment_intent_data: { metadata },
          success_url: `${returnUrl}?paymentReturn=success&requestId=${encodeURIComponent(paymentRequest.id)}&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${returnUrl}?paymentReturn=cancelled&requestId=${encodeURIComponent(paymentRequest.id)}`,
        },
      });
    } catch (providerError) {
      await supabaseAdmin
        .from("customer_portal_payment_requests")
        .update({
          status: "FAILED",
          metadata: {
            ...(paymentRequest.metadata || {}),
            checkout_error: providerError?.message || "Stripe checkout failed",
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", paymentRequest.id)
        .eq("organization_id", paymentRequest.organization_id)
        .eq("party_id", paymentRequest.party_id)
        .in("status", ["PENDING","FAILED"]);
      throw providerError;
    }

    const { data: saved, error: saveError } = await supabaseAdmin
      .from("customer_portal_payment_requests")
      .update({
        status: "CHECKOUT_CREATED",
        provider: "STRIPE",
        provider_session_id: checkout.id,
        metadata: {
          ...(paymentRequest.metadata || {}),
          connected_account_id: merchant.provider_account_id,
          merchant_connection_id: merchant.id,
          raw_card_data_stored: false,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", paymentRequest.id)
      .eq("organization_id", paymentRequest.organization_id)
      .eq("party_id", paymentRequest.party_id)
      .in("status", ["PENDING","FAILED","CHECKOUT_CREATED"])
      .select("*")
      .single();
    if (saveError) throw saveError;

    return NextResponse.json({
      success: true,
      checkout_url: checkout.url,
      payment_request: saved,
      merchant_account_scope: "organization_connected_account",
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to start customer payment" },
      { status: 500 },
    );
  }
}
