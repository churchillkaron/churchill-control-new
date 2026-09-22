import { NextResponse } from "next/server";

import {
  claimStripeWebhookEvent,
  findStripeBillingAccountByCustomer,
  findStripeBillingAccountBySubscription,
  getStripeBillingAccount,
  settleStripeWebhookEvent,
  stripeSubscriptionIdFromInvoice,
  upsertStripeBillingAccount,
} from "@/lib/billing/stripeBillingAccounts";
import { finalizeCustomerPortalCardPayment, failCustomerPortalCardPayment } from "@/lib/customer-portal/CustomerPortalPaymentSettlementRuntime";
import { broadcastHotelReadinessChanged } from "@/lib/hotel/server/broadcastHotelReadinessChanged";
import { PaymentConfirmationRuntime } from "@/lib/platform/payment-runtime/confirmation/PaymentConfirmationRuntime";
import { PaymentTransactionRepository } from "@/lib/platform/payment-runtime/repositories/PaymentTransactionRepository";
import { StripeProvider } from "@/lib/platform/service-runtime/providers/stripe/StripeProvider";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { finalizeCustomerPortalCardPayment, failCustomerPortalCardPayment } from "@/lib/customer-portal/CustomerPortalPaymentSettlementRuntime";

function providerId(value) {
  return typeof value === "string" ? value : value?.id || null;
}

function timestamp(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

function subscriptionPeriodEnd(subscription) {
  if (subscription?.current_period_end) {
    return timestamp(subscription.current_period_end);
  }
  const values = (subscription?.items?.data || [])
    .map((item) => Number(item?.current_period_end))
    .filter((value) => Number.isFinite(value) && value > 0);
  return values.length ? timestamp(Math.max(...values)) : null;
}

function subscriptionPriceIds(subscription) {
  return Array.isArray(subscription?.items?.data)
    ? subscription.items.data
        .map((item) => providerId(item?.price))
        .filter(Boolean)
    : [];
}

function subscriptionPriceId(subscription) {
  const ids = subscriptionPriceIds(subscription);
  return ids.length === 1 ? ids[0] : null;
}

function csvValues(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function invalidateHotelSettlement(organizationId, action) {
  await broadcastHotelReadinessChanged({
    organizationId,
    source: "hotel-payment-webhook",
    action,
  });
}

async function getHotelTransactionScope(transactionId) {
  if (!transactionId) throw new Error("Hotel payment transaction id is required");
  const { data, error } = await supabaseAdmin
    .from("hotel_payment_transactions")
    .select("id,organization_id,status,transaction_type")
    .eq("id", transactionId)
    .eq("processor_mode", "AVANTIQO_GATEWAY")
    .maybeSingle();
  if (error) throw error;
  if (!data?.organization_id) {
    throw new Error("Hotel payment transaction scope could not be resolved");
  }
  return data;
}

async function finalizeHotelPayment(event, session) {
  const transactionId = session?.metadata?.hotelTransactionId;
  if (!transactionId) {
    throw new Error("Hotel payment webhook is missing transaction metadata");
  }
  if (session.payment_status !== "paid") return;

  const scope = await getHotelTransactionScope(transactionId);
  const { data, error } = await supabaseAdmin.rpc("hotel_finalize_gateway_payment_with_finance", {
      p_transaction_id: transactionId,
      p_provider_event_id: event.id,
      p_provider_payment_id: session.payment_intent
        ? String(session.payment_intent)
        : null,
    },
  );
  if (error) throw error;

  if (session?.metadata?.portalPaymentRequestId) {
    const portalUpdate = await supabaseAdmin
      .from("customer_portal_payment_requests")
      .update({
        status: "PAID",
        provider_session_id: session.id,
        provider_payment_id: session.payment_intent
          ? String(session.payment_intent)
          : null,
        provider_event_id: event.id,
        settled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", scope.organization_id)
      .eq("id", session.metadata.portalPaymentRequestId);
    if (portalUpdate.error) throw portalUpdate.error;
  }

  await invalidateHotelSettlement(scope.organization_id, "PAYMENT_SETTLED");
  return data;
}

async function failHotelTransaction(transactionId, reason, providerEventId) {
  if (!transactionId) return;
  const scope = await getHotelTransactionScope(transactionId);
  const { error } = await supabaseAdmin
    .from("hotel_payment_transactions")
    .update({
      status: "FAILED",
      failure_reason: reason,
      provider_event_id: providerEventId || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", transactionId)
    .eq("organization_id", scope.organization_id)
    .eq("processor_mode", "AVANTIQO_GATEWAY")
    .eq("status", "PENDING");
  if (error) throw error;

  await invalidateHotelSettlement(scope.organization_id, scope.transaction_type === "REFUND" ? "REFUND_FAILED" : "PAYMENT_FAILED");
}

async function reconcileHotelRefund(event, refund) {
  if (refund?.metadata?.domain !== "hotel") return;
  const transactionId = refund.metadata.hotelTransactionId;
  if (!transactionId) {
    throw new Error("Hotel refund webhook is missing transaction metadata");
  }

  if (refund.status === "succeeded") {
    const scope = await getHotelTransactionScope(transactionId);
    const { data, error } = await supabaseAdmin.rpc("hotel_finalize_gateway_refund_with_finance", {
        p_transaction_id: transactionId,
        p_provider_event_id: event.id,
        p_provider_refund_id: refund.id,
      },
    );
    if (error) throw error;
    await invalidateHotelSettlement(scope.organization_id, "REFUND_SETTLED");
    return data;
  }

  if (["failed", "canceled"].includes(String(refund.status || "").toLowerCase())) {
    await failHotelTransaction(
      transactionId,
      `Stripe refund ${refund.status}`,
      event.id,
    );
  }
}

async function syncSubscription(event, subscription, organizationHint = null) {
  const subscriptionId = providerId(subscription?.id);
  const customerId = providerId(subscription?.customer);
  const metadataOrganizationId = String(
    subscription?.metadata?.organizationId || "",
  ).trim();

  let account =
    (subscriptionId
      ? await findStripeBillingAccountBySubscription(subscriptionId)
      : null) ||
    (customerId ? await findStripeBillingAccountByCustomer(customerId) : null);
  const organizationId =
    String(organizationHint || metadataOrganizationId || account?.organization_id || "").trim();
  if (!organizationId || !customerId) {
    throw new Error("Stripe subscription organization/customer mapping is missing");
  }

  if (!account) account = await getStripeBillingAccount(organizationId);

  const priceIds = subscriptionPriceIds(subscription);
  const moduleIds = csvValues(subscription?.metadata?.moduleIds);
  const billingCycle = String(
    subscription?.metadata?.billingCycle || "",
  ).trim().toLowerCase();

  return upsertStripeBillingAccount({
    organization_id: organizationId,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    stripe_price_id:
      subscriptionPriceId(subscription) ||
      (priceIds.length > 1 ? null : account?.stripe_price_id || null),
    plan_key:
      String(subscription?.metadata?.priceKey || "").trim() ||
      account?.plan_key ||
      null,
    status: String(subscription?.status || "INACTIVE").toUpperCase(),
    current_period_end: subscriptionPeriodEnd(subscription),
    cancel_at_period_end: Boolean(subscription?.cancel_at_period_end),
    automatic_tax_enabled: Boolean(subscription?.automatic_tax?.enabled),
    latest_invoice_id: providerId(subscription?.latest_invoice) || account?.latest_invoice_id || null,
    latest_invoice_status: account?.latest_invoice_status || null,
    last_event_id: event.id,
    metadata: {
      ...(account?.metadata || {}),
      subscription_livemode: Boolean(subscription?.livemode),
      stripe_price_ids: priceIds,
      ...(moduleIds.length ? { module_ids: moduleIds } : {}),
      ...(billingCycle ? { billing_cycle: billingCycle } : {}),
    },
  });
}

async function reconcileSubscriptionCheckout(event, session) {
  const metadata = session?.metadata || {};
  if (metadata.domain !== "avantiqo_subscription") return;

  const organizationId = String(metadata.organizationId || "").trim();
  const customerId = providerId(session.customer);
  const subscriptionId = providerId(session.subscription);
  if (!organizationId || !customerId) {
    throw new Error("Stripe subscription checkout metadata is incomplete");
  }

  const current = await getStripeBillingAccount(organizationId);
  await upsertStripeBillingAccount({
    organization_id: organizationId,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId || current?.stripe_subscription_id || null,
    stripe_price_id: current?.stripe_price_id || null,
    plan_key: String(metadata.priceKey || current?.plan_key || "").trim() || null,
    status: current?.status || "INACTIVE",
    last_event_id: event.id,
    metadata: {
      ...(current?.metadata || {}),
      checkout_session_id: session.id,
      ...(csvValues(metadata.moduleIds).length
        ? { module_ids: csvValues(metadata.moduleIds) }
        : {}),
      ...(String(metadata.billingCycle || "").trim()
        ? { billing_cycle: String(metadata.billingCycle).trim().toLowerCase() }
        : {}),
    },
  });

  if (!subscriptionId) return;
  const subscription = await StripeProvider.retrieveSubscription({
    organizationId,
    subscriptionId,
  });
  await syncSubscription(event, subscription, organizationId);
}

async function reconcileInvoice(event, invoice) {
  const subscriptionId = stripeSubscriptionIdFromInvoice(invoice);
  const customerId = providerId(invoice?.customer);
  const account =
    (subscriptionId
      ? await findStripeBillingAccountBySubscription(subscriptionId)
      : null) ||
    (customerId ? await findStripeBillingAccountByCustomer(customerId) : null);
  if (!account) return;

  await upsertStripeBillingAccount({
    organization_id: account.organization_id,
    stripe_customer_id: account.stripe_customer_id,
    stripe_subscription_id: subscriptionId || account.stripe_subscription_id,
    stripe_price_id: account.stripe_price_id,
    plan_key: account.plan_key,
    status: account.status,
    current_period_end: account.current_period_end,
    cancel_at_period_end: account.cancel_at_period_end,
    automatic_tax_enabled: account.automatic_tax_enabled,
    latest_invoice_id: providerId(invoice?.id),
    latest_invoice_status: String(invoice?.status || event.type || "").toUpperCase(),
    last_event_id: event.id,
    metadata: {
      ...(account.metadata || {}),
      latest_invoice_payment_status:
        String(invoice?.status_transitions?.paid_at ? "PAID" : "").trim() || null,
    },
  });
}

async function settleAvantiqoPayment(session) {
  const paymentId = String(session?.metadata?.paymentId || "").trim();
  const paymentIntentId = providerId(session?.payment_intent);

  if (!paymentId || !paymentIntentId) {
    throw new Error("Avantiqo payment webhook metadata is incomplete");
  }

  return PaymentConfirmationRuntime.confirmPayment({
    paymentId,
    verificationSource: "stripe.payment_intent",
    sourceReference: paymentIntentId,
  });
}

async function failAvantiqoPayment(session, reason) {
  const paymentId = String(session?.metadata?.paymentId || "").trim();
  if (!paymentId) return;

  const payment = await PaymentTransactionRepository.get(paymentId);
  if (!payment?.organization_id) return;

  const metadataOrganizationId = String(
    session?.metadata?.organizationId || "",
  ).trim();
  if (
    metadataOrganizationId &&
    metadataOrganizationId !== payment.organization_id
  ) {
    throw new Error("Avantiqo payment webhook organization mismatch");
  }

  if (["completed", "paid"].includes(String(payment.status || "").toLowerCase())) {
    return payment;
  }

  return PaymentTransactionRepository.update(paymentId, {
    status: "failed",
    metadata: {
      ...(payment.metadata || {}),
      provider_failure: {
        reason,
        checkout_session_id: session?.id || null,
        recorded_at: new Date().toISOString(),
      },
    },
  });
}

async function reconcileEvent(event) {
  if (
    ["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(
      event.type,
    )
  ) {
    const session = event.data.object;
    if (session?.metadata?.domain === "hotel") {
      await finalizeHotelPayment(event, session);
    } else if (session?.metadata?.domain === "customer_portal") {
      await finalizeCustomerPortalCardPayment({ event, session });
    } else if (session?.metadata?.domain === "avantiqo_payment") {
      await settleAvantiqoPayment(session);
    } else if (
      event.type === "checkout.session.completed" &&
      session?.metadata?.domain === "avantiqo_subscription"
    ) {
      await reconcileSubscriptionCheckout(event, session);
    }
  }

  if (
    ["checkout.session.async_payment_failed", "checkout.session.expired"].includes(
      event.type,
    )
  ) {
    const session = event.data.object;
    if (session?.metadata?.domain === "hotel") {
      await failHotelTransaction(
        session.metadata.hotelTransactionId,
        event.type === "checkout.session.expired"
          ? "Stripe Checkout session expired"
          : "Stripe asynchronous payment failed",
        event.id,
      );
    } else if (session?.metadata?.domain === "customer_portal") {
      await failCustomerPortalCardPayment({
        event,
        session,
        reason:
          event.type === "checkout.session.expired"
            ? "Stripe Checkout session expired"
            : "Stripe asynchronous payment failed",
      });
    } else if (session?.metadata?.domain === "avantiqo_payment") {
      await failAvantiqoPayment(
        session,
        event.type === "checkout.session.expired"
          ? "Stripe Checkout session expired"
          : "Stripe asynchronous payment failed",
      );
    }
  }

  if (event.type === "refund.updated") {
    await reconcileHotelRefund(event, event.data.object);
  }

  if (
    [
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
    ].includes(event.type)
  ) {
    await syncSubscription(event, event.data.object);
  }

  if (
    [
      "invoice.finalized",
      "invoice.paid",
      "invoice.payment_failed",
      "invoice.voided",
    ].includes(event.type)
  ) {
    await reconcileInvoice(event, event.data.object);
  }
}

export async function POST(request) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  let event;
  try {
    event = StripeProvider.verifyWebhook({ rawBody, signature });
  } catch (error) {
    console.error("BILLING_WEBHOOK_SIGNATURE_ERROR", error);
    return NextResponse.json({ error: "Webhook Error" }, { status: 400 });
  }

  let claim;
  try {
    claim = await claimStripeWebhookEvent(event);
  } catch (error) {
    console.error("BILLING_WEBHOOK_CLAIM_ERROR", event.id, error);
    return NextResponse.json(
      { received: false, error: "Webhook claim failed" },
      { status: 500 },
    );
  }

  if (!claim.process) {
    return NextResponse.json({
      received: true,
      duplicate: true,
      reason: claim.reason,
    });
  }

  try {
    await reconcileEvent(event);
    await settleStripeWebhookEvent(event.id, "PROCESSED");
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error(
      "BILLING_WEBHOOK_RECONCILIATION_ERROR",
      event.id,
      event.type,
      error,
    );
    try {
      await settleStripeWebhookEvent(
        event.id,
        "FAILED",
        String(error?.message || "Webhook reconciliation failed").slice(0, 1000),
      );
    } catch (settlementError) {
      console.error(
        "BILLING_WEBHOOK_EVENT_SETTLEMENT_ERROR",
        event.id,
        settlementError,
      );
    }
    return NextResponse.json(
      { received: false, error: "Webhook reconciliation failed" },
      { status: 500 },
    );
  }
}
