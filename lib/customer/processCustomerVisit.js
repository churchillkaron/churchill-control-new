import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

import {
  recordSystemEvent,
} from "@/lib/events/recordSystemEvent";

function calculateTier({
  totalSpent,
  visitCount,
}) {
  if (
    Number(totalSpent || 0) >= 100000 ||
    Number(visitCount || 0) >= 25
  ) {
    return "VIP";
  }

  if (
    Number(totalSpent || 0) >= 50000 ||
    Number(visitCount || 0) >= 10
  ) {
    return "GOLD";
  }

  if (
    Number(totalSpent || 0) >= 15000 ||
    Number(visitCount || 0) >= 5
  ) {
    return "SILVER";
  }

  return "REGULAR";
}

async function assignCustomerSegment({
  tenantId,
  customer,
}) {
  if (!tenantId || !customer?.id) {
    return null;
  }

  const tier =
    customer.tier || "REGULAR";

  const {
    data: segment,
    error: segmentError,
  } = await supabaseAdmin
    .from("customer_segments")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("loyalty_tier", tier)
    .eq("active", true)
    .maybeSingle();

  if (segmentError) {
    throw new Error(segmentError.message);
  }

  if (!segment?.id) {
    return null;
  }

  await supabaseAdmin
    .from("customer_segment_memberships")
    .update({
      active: false,
    })
    .eq("tenant_id", tenantId)
    .eq("customer_loyalty_account_id", customer.id)
    .neq("customer_segment_id", segment.id);

  const {
    data: existing,
    error: existingError,
  } = await supabaseAdmin
    .from("customer_segment_memberships")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("customer_loyalty_account_id", customer.id)
    .eq("customer_segment_id", segment.id)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existing) {
    const {
      error,
    } = await supabaseAdmin
      .from("customer_segment_memberships")
      .update({
        active: true,
        assigned_at: new Date().toISOString(),
        metadata: {
          tier,
          total_spent: customer.total_spent,
          visit_count: customer.visit_count,
        },
      })
      .eq("id", existing.id);

    if (error) {
      throw new Error(error.message);
    }

    return segment;
  }

  const {
    error,
  } = await supabaseAdmin
    .from("customer_segment_memberships")
    .insert({
      tenant_id: tenantId,
      customer_loyalty_account_id: customer.id,
      customer_segment_id: segment.id,
      assigned_at: new Date().toISOString(),
      active: true,
      metadata: {
        tier,
        total_spent: customer.total_spent,
        visit_count: customer.visit_count,
      },
    });

  if (error) {
    throw new Error(error.message);
  }

  return segment;
}

export async function processCustomerVisit({
  tenantId,
  customerId,
  customerName,
  customerPhone,
  total,
  favoriteDish = null,
  favoriteDrink = null,
  favoriteTable = null,
  vipScore = 0,
}) {
  if (!tenantId) {
    throw new Error("tenantId required");
  }

  const cleanName =
    String(customerName || "Walk-in Guest").trim();

  const cleanPhone =
    String(customerPhone || "").trim();

  if (!cleanPhone && cleanName === "Walk-in Guest") {
    return {
      success: true,
      skipped: true,
      reason: "No customer identity supplied",
    };
  }

  let query =
    supabaseAdmin
      .from("customer_loyalty_accounts")
      .select("*")
      .eq("tenant_id", tenantId);

  if (customerId) {
    query =
      query.eq("id", customerId);
  } else if (cleanPhone) {
    query =
      query.eq("customer_phone", cleanPhone);
  } else {
    query =
      query.eq("customer_name", cleanName);
  }

  const {
    data: existing,
    error: findError,
  } = await query.maybeSingle();

  if (findError) {
    throw new Error(findError.message);
  }

  const visitTotal =
    Number(total || 0);

  let customer = null;
  let created = false;
  let previousCustomer = existing || null;
  let previousTier =
    existing?.tier || null;

  if (existing) {
    const newTotalSpent =
      Number(existing.total_spent || 0) + visitTotal;

    const newVisitCount =
      Number(existing.visit_count || 0) + 1;

    const tier =
      calculateTier({
        totalSpent: newTotalSpent,
        visitCount: newVisitCount,
      });

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("customer_loyalty_accounts")
      .update({
        customer_name:
          cleanName || existing.customer_name,
        customer_phone:
          cleanPhone || existing.customer_phone,
        total_spent:
          newTotalSpent,
        visit_count:
          newVisitCount,
        loyalty_points:
          Number(existing.loyalty_points || 0) +
          Math.floor(visitTotal),
        favorite_dish:
          favoriteDish ||
          existing.favorite_dish,
        favorite_drink:
          favoriteDrink ||
          existing.favorite_drink,
        favorite_table:
          favoriteTable ||
          existing.favorite_table,
        vip_score:
          Math.max(
            Number(existing.vip_score || 0),
            Number(vipScore || 0)
          ),
        tier,
        last_visit_at:
          new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    customer = data;
  } else {
    const tier =
      calculateTier({
        totalSpent: visitTotal,
        visitCount: 1,
      });

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("customer_loyalty_accounts")
      .insert({
        tenant_id: tenantId,
        customer_name: cleanName,
        customer_phone: cleanPhone || null,
        loyalty_points: Math.floor(visitTotal),
        total_spent: visitTotal,
        visit_count: 1,
        favorite_dish: favoriteDish,
        favorite_drink: favoriteDrink,
        favorite_table: favoriteTable,
        vip_score: vipScore,
        tier,
        last_visit_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    customer = data;
    created = true;
  }

  const segment =
    await assignCustomerSegment({
      tenantId,
      customer,
    });

  if (
    previousTier &&
    previousTier !== customer.tier
  ) {
    await recordSystemEvent({
      tenantId,
      type:
        SYSTEM_EVENTS.CUSTOMER_SEGMENT_CHANGED,
      payload: {
        customer_id:
          customer.id,
        customer_name:
          customer.customer_name,
        previous_tier:
          previousTier,
        new_tier:
          customer.tier,
        total_spent:
          customer.total_spent,
        visit_count:
          customer.visit_count,
      },
    });
  }

  await recordSystemEvent({
    tenantId,
    type: "CUSTOMER_VISIT",
    payload: {
      customer_id: customer.id,
      customer_name: customer.customer_name,
      customer_phone: customer.customer_phone,
      customer_email: customer.customer_email || null,
      customer_created: created,
      visit_total: visitTotal,
      previous_total_spent: previousCustomer?.total_spent || 0,
      total_spent: customer.total_spent,
      previous_visit_count: previousCustomer?.visit_count || 0,
      visit_count: customer.visit_count,
      loyalty_points: customer.loyalty_points,
      tier: customer.tier,
      vip_score: customer.vip_score,
      favorite_dish: favoriteDish,
      favorite_drink: favoriteDrink,
      favorite_table: favoriteTable,
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
