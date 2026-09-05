import { NextResponse } from "next/server";
import { getStripe } from "@/lib/billing/stripe";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

async function finalizeHotelPayment(event, session) {
  const transactionId = session?.metadata?.hotelTransactionId;
  if (!transactionId) throw new Error("Hotel payment webhook is missing transaction metadata");
  if (session.payment_status !== "paid") return;

  const { data, error } = await supabaseAdmin.rpc("hotel_finalize_gateway_payment_with_finance", {
    p_transaction_id: transactionId,
    p_provider_event_id: event.id,
    p_provider_payment_id: session.payment_intent ? String(session.payment_intent) : null,
  });
  if (error) throw error;
  return data;
}

async function failHotelTransaction(transactionId, reason, providerEventId) {
  if (!transactionId) return;
  const { error } = await supabaseAdmin
    .from("hotel_payment_transactions")
    .update({
      status: "FAILED",
      failure_reason: reason,
      provider_event_id: providerEventId || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", transactionId)
    .eq("processor_mode", "AVANTIQO_GATEWAY")
    .eq("status", "PENDING");
  if (error) throw error;
}

async function reconcileHotelRefund(event, refund) {
  if (refund?.metadata?.domain !== "hotel") return;
  const transactionId = refund.metadata.hotelTransactionId;
  if (!transactionId) throw new Error("Hotel refund webhook is missing transaction metadata");

  if (refund.status === "succeeded") {
    const { data, error } = await supabaseAdmin.rpc("hotel_finalize_gateway_transaction", {
      p_transaction_id: transactionId,
      p_provider_event_id: event.id,
      p_provider_payment_id: null,
      p_provider_refund_id: refund.id,
    });
    if (error) throw error;
    return data;
  }

  if (["failed", "canceled"].includes(String(refund.status || "").toLowerCase())) {
    await failHotelTransaction(transactionId, `Stripe refund ${refund.status}`, event.id);
  }
}

export async function POST(req) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  const stripe = getStripe();

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    return NextResponse.json(
      { error: "Webhook Error" },
      { status: 400 },
    );
  }

  try {
    if (["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)) {
      const session = event.data.object;
      if (session?.metadata?.domain === "hotel") {
        await finalizeHotelPayment(event, session);
      } else if (event.type === "checkout.session.completed") {
        const { organizationId, plan } = session.metadata || {};
        if (organizationId && plan) {
          await supabaseAdmin
            .from("organizations")
            .update({ plan, subscription_status: "active" })
            .eq("id", organizationId);
        }
      }
    }

    if (["checkout.session.async_payment_failed", "checkout.session.expired"].includes(event.type)) {
      const session = event.data.object;
      if (session?.metadata?.domain === "hotel") {
        await failHotelTransaction(
          session.metadata.hotelTransactionId,
          event.type === "checkout.session.expired" ? "Stripe Checkout session expired" : "Stripe asynchronous payment failed",
          event.id,
        );
      }
    }

    if (event.type === "refund.updated") {
      await reconcileHotelRefund(event, event.data.object);
    }
  } catch (error) {
    console.error("BILLING_WEBHOOK_RECONCILIATION_ERROR", event.id, event.type, error);
    return NextResponse.json({ received: false, error: "Webhook reconciliation failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
