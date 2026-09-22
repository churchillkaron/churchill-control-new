import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const WEBHOOK_PROCESSING_LEASE_MS = 5 * 60 * 1000;

export const ACTIVE_SUBSCRIPTION_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "incomplete",
]);

export async function getStripeBillingAccount(organizationId) {
  const { data, error } = await supabaseAdmin
    .from("stripe_billing_accounts")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function findStripeBillingAccountBySubscription(subscriptionId) {
  if (!subscriptionId) return null;
  const { data, error } = await supabaseAdmin
    .from("stripe_billing_accounts")
    .select("*")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function findStripeBillingAccountByCustomer(customerId) {
  if (!customerId) return null;
  const { data, error } = await supabaseAdmin
    .from("stripe_billing_accounts")
    .select("*")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function upsertStripeBillingAccount(values) {
  const payload = {
    ...values,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabaseAdmin
    .from("stripe_billing_accounts")
    .upsert(payload, { onConflict: "organization_id" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function claimStripeWebhookEvent(event) {
  const now = new Date().toISOString();
  const payload = {
    stripe_event_id: event.id,
    event_type: event.type,
    livemode: Boolean(event.livemode),
    status: "PROCESSING",
    attempt_count: 1,
    updated_at: now,
  };

  const inserted = await supabaseAdmin
    .from("stripe_webhook_events")
    .insert(payload);

  if (!inserted.error) {
    return { process: true, reason: "NEW" };
  }
  if (inserted.error.code !== "23505") throw inserted.error;

  const existingResult = await supabaseAdmin
    .from("stripe_webhook_events")
    .select("stripe_event_id,status,attempt_count,updated_at")
    .eq("stripe_event_id", event.id)
    .maybeSingle();
  if (existingResult.error) throw existingResult.error;

  const existing = existingResult.data;
  if (!existing) return { process: false, reason: "MISSING_AFTER_CONFLICT" };
  if (existing.status === "PROCESSED") {
    return { process: false, reason: "ALREADY_PROCESSED" };
  }

  const updatedAt = new Date(existing.updated_at || 0).getTime();
  const leaseFresh =
    existing.status === "PROCESSING" &&
    Number.isFinite(updatedAt) &&
    Date.now() - updatedAt < WEBHOOK_PROCESSING_LEASE_MS;

  if (leaseFresh) {
    return { process: false, reason: "ALREADY_PROCESSING" };
  }

  const reclaimed = await supabaseAdmin
    .from("stripe_webhook_events")
    .update({
      event_type: event.type,
      livemode: Boolean(event.livemode),
      status: "PROCESSING",
      error_message: null,
      processed_at: null,
      attempt_count: Number(existing.attempt_count || 1) + 1,
      updated_at: now,
    })
    .eq("stripe_event_id", event.id)
    .eq("updated_at", existing.updated_at)
    .select("stripe_event_id")
    .maybeSingle();

  if (reclaimed.error) throw reclaimed.error;
  return reclaimed.data
    ? { process: true, reason: "RETRY" }
    : { process: false, reason: "CLAIMED_ELSEWHERE" };
}

export async function settleStripeWebhookEvent(
  eventId,
  status,
  errorMessage = null,
) {
  const normalizedStatus = status === "PROCESSED" ? "PROCESSED" : "FAILED";
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("stripe_webhook_events")
    .update({
      status: normalizedStatus,
      error_message: errorMessage,
      processed_at: normalizedStatus === "PROCESSED" ? now : null,
      updated_at: now,
    })
    .eq("stripe_event_id", eventId);
  if (error) throw error;
}

export function stripeSubscriptionIdFromInvoice(invoice) {
  const direct =
    typeof invoice?.subscription === "string"
      ? invoice.subscription
      : invoice?.subscription?.id;
  if (direct) return direct;

  const parent = invoice?.parent?.subscription_details?.subscription;
  return typeof parent === "string" ? parent : parent?.id || null;
}
