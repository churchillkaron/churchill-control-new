import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { recordSystemEvent } from "@/lib/events/recordSystemEvent";

function numeric(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function assignConfiguredCustomerSegment({ organizationId, customer }) {
  if (!organizationId || !customer?.id || !customer?.tier) {
    return null;
  }

  const { data: segment, error: segmentError } = await supabaseAdmin
    .from("customer_segments")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("loyalty_tier", customer.tier)
    .eq("active", true)
    .maybeSingle();

  if (segmentError) {
    throw new Error(segmentError.message);
  }

  if (!segment?.id) {
    return null;
  }

  const assignedAt = new Date().toISOString();
  const membershipMetadata = {
    tier: customer.tier,
    total_spent: numeric(customer.total_spent),
    visit_count: numeric(customer.visit_count),
  };

  const { error: deactivateError } = await supabaseAdmin
    .from("customer_segment_memberships")
    .update({ active: false })
    .eq("organization_id", organizationId)
    .eq("customer_loyalty_account_id", customer.id)
    .neq("customer_segment_id", segment.id);

  if (deactivateError) {
    throw new Error(deactivateError.message);
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("customer_segment_memberships")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("customer_loyalty_account_id", customer.id)
    .eq("customer_segment_id", segment.id)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existing?.id) {
    const { error } = await supabaseAdmin
      .from("customer_segment_memberships")
      .update({
        active: true,
        assigned_at: assignedAt,
        metadata: membershipMetadata,
      })
      .eq("organization_id", organizationId)
      .eq("id", existing.id);

    if (error) {
      throw new Error(error.message);
    }
  } else {
    const { error } = await supabaseAdmin
      .from("customer_segment_memberships")
      .insert({
        organization_id: organizationId,
        customer_loyalty_account_id: customer.id,
        customer_segment_id: segment.id,
        assigned_at: assignedAt,
        active: true,
        metadata: membershipMetadata,
      });

    if (error) {
      throw new Error(error.message);
    }
  }

  return segment;
}

export async function processCustomerVisit({
  organizationId,
  customerId,
  customerName,
  customerPhone,
  customerEmail = null,
  total,
  loyaltyPointsEarned = 0,
  favoriteDish = null,
  favoriteDrink = null,
  favoriteTable = null,
  vipScore = 0,
  visitId = null,
  occurredAt = null,
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  const cleanName = String(customerName || "Walk-in Guest").trim();
  const cleanPhone = String(customerPhone || "").trim();
  const cleanEmail = String(customerEmail || "").trim();

  if (!customerId && !cleanPhone && !cleanEmail && cleanName === "Walk-in Guest") {
    return {
      success: true,
      skipped: true,
      reason: "No customer identity supplied",
    };
  }

  let query = supabaseAdmin
    .from("customer_loyalty_accounts")
    .select("*")
    .eq("organization_id", organizationId);

  if (customerId) {
    query = query.eq("id", customerId);
  } else if (cleanPhone) {
    query = query.eq("customer_phone", cleanPhone);
  } else if (cleanEmail) {
    query = query.eq("customer_email", cleanEmail);
  } else {
    query = query.eq("customer_name", cleanName);
  }

  const { data: existing, error: findError } = await query.maybeSingle();

  if (findError) {
    throw new Error(findError.message);
  }

  const visitTotal = numeric(total);
  const pointsEarned = numeric(loyaltyPointsEarned);
  const visitTimestamp = occurredAt || new Date().toISOString();
  const previousCustomer = existing || null;
  const previousTier = existing?.tier || null;
  let customer;
  let created = false;

  if (existing) {
    const updatePayload = {
      customer_name: cleanName || existing.customer_name,
      customer_phone: cleanPhone || existing.customer_phone,
      customer_email: cleanEmail || existing.customer_email,
      total_spent: numeric(existing.total_spent) + visitTotal,
      visit_count: numeric(existing.visit_count) + 1,
      loyalty_points: numeric(existing.loyalty_points) + pointsEarned,
      favorite_dish: favoriteDish || existing.favorite_dish,
      favorite_drink: favoriteDrink || existing.favorite_drink,
      favorite_service_unit:
        favoriteTable || existing.favorite_service_unit || null,
      vip_score: Math.max(numeric(existing.vip_score), numeric(vipScore)),
      last_visit_at: visitTimestamp,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from("customer_loyalty_accounts")
      .update(updatePayload)
      .eq("organization_id", organizationId)
      .eq("id", existing.id)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    customer = data;
  } else {
    const { data, error } = await supabaseAdmin
      .from("customer_loyalty_accounts")
      .insert({
        organization_id: organizationId,
        customer_name: cleanName,
        customer_phone: cleanPhone || null,
        customer_email: cleanEmail || null,
        loyalty_points: pointsEarned,
        total_spent: visitTotal,
        visit_count: 1,
        favorite_dish: favoriteDish,
        favorite_drink: favoriteDrink,
        favorite_service_unit: favoriteTable,
        vip_score: numeric(vipScore),
        last_visit_at: visitTimestamp,
      })
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    customer = data;
    created = true;
  }

  const segment = await assignConfiguredCustomerSegment({
    organizationId,
    customer,
  });

  const eventIdentity =
    visitId || `${customer.id}:${customer.visit_count}:${visitTimestamp}`;

  if (previousTier && previousTier !== customer.tier) {
    await recordSystemEvent({
      organizationId,
      type: "CUSTOMER_SEGMENT_CHANGED",
      idempotencyKey: `CUSTOMER_SEGMENT_CHANGED:${eventIdentity}`,
      payload: {
        customer_id: customer.id,
        customer_name: customer.customer_name,
        previous_tier: previousTier,
        new_tier: customer.tier,
        total_spent: customer.total_spent,
        visit_count: customer.visit_count,
        segment_id: segment?.id || null,
      },
    });
  }

  await recordSystemEvent({
    organizationId,
    type: "CUSTOMER_VISIT",
    idempotencyKey: `CUSTOMER_VISIT:${eventIdentity}`,
    payload: {
      customer_id: customer.id,
      customer_name: customer.customer_name,
      customer_phone: customer.customer_phone,
      customer_email: customer.customer_email || null,
      customer_created: created,
      visit_id: visitId,
      occurred_at: visitTimestamp,
      visit_total: visitTotal,
      loyalty_points_earned: pointsEarned,
      previous_total_spent: numeric(previousCustomer?.total_spent),
      total_spent: numeric(customer.total_spent),
      previous_visit_count: numeric(previousCustomer?.visit_count),
      visit_count: numeric(customer.visit_count),
      loyalty_points: numeric(customer.loyalty_points),
      tier: customer.tier || null,
      vip_score: numeric(customer.vip_score),
      favorite_dish: favoriteDish,
      favorite_drink: favoriteDrink,
      favorite_service_unit: favoriteTable,
      segment_id: segment?.id || null,
      segment_name: segment?.segment_name || null,
      source: "processCustomerVisit",
    },
  });

  return {
    success: true,
    customer,
    segment,
    created,
  };
}
