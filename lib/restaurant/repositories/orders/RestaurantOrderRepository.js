import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function stateValue(
  state,
  camelKey,
  snakeKey,
  fallback = null
) {
  if (state?.[camelKey] !== undefined) {
    return state[camelKey];
  }

  if (state?.[snakeKey] !== undefined) {
    return state[snakeKey];
  }

  return fallback;
}

async function loadOptionalRow(query) {
  const result = await query;

  if (result.error) {
    throw result.error;
  }

  return result.data || null;
}

export async function loadRestaurantOrder({
  organizationId,
  orderId,
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  if (!orderId) {
    throw new Error("orderId required");
  }

  const { data, error } =
    await supabaseAdmin
      .from("orders")
      .select(`
        *,
        order_items (*)
      `)
      .eq("organization_id", organizationId)
      .eq("id", orderId)
      .single();

  if (error) {
    throw error;
  }

  const [restaurantTable, tableSession] =
    await Promise.all([
      data.table_id
        ? loadOptionalRow(
            supabaseAdmin
              .from("restaurant_tables")
              .select("*")
              .eq(
                "organization_id",
                organizationId
              )
              .eq("id", data.table_id)
              .maybeSingle()
          )
        : Promise.resolve(null),

      data.session_id
        ? loadOptionalRow(
            supabaseAdmin
              .from("table_sessions")
              .select("*")
              .eq(
                "organization_id",
                organizationId
              )
              .eq("id", data.session_id)
              .maybeSingle()
          )
        : Promise.resolve(null),
    ]);

  return {
    ...data,
    restaurant_table:
      restaurantTable,
    table_session:
      tableSession,
  };
}

async function persistSessionCustomer({
  organizationId,
  state,
}) {
  const sessionId =
    stateValue(
      state,
      "sessionId",
      "session_id"
    );

  if (!sessionId) {
    return;
  }

  const payload = {};

  const customerId =
    stateValue(
      state,
      "customerId",
      "customer_id",
      undefined
    );

  const customerName =
    stateValue(
      state,
      "customerName",
      "customer_name",
      undefined
    );

  const customerEmail =
    stateValue(
      state,
      "customerEmail",
      "customer_email",
      undefined
    );

  const customerPhone =
    stateValue(
      state,
      "customerPhone",
      "customer_phone",
      undefined
    );

  if (customerId !== undefined) {
    payload.customer_id =
      customerId || null;
  }

  if (customerName !== undefined) {
    payload.customer_name =
      customerName || null;
  }

  if (customerEmail !== undefined) {
    payload.customer_email =
      customerEmail || null;
  }

  if (customerPhone !== undefined) {
    payload.customer_phone =
      customerPhone || null;
  }

  if (!Object.keys(payload).length) {
    return;
  }

  payload.updated_at =
    new Date().toISOString();

  const result =
    await supabaseAdmin
      .from("table_sessions")
      .update(payload)
      .eq(
        "organization_id",
        organizationId
      )
      .eq("id", sessionId);

  if (result.error) {
    throw result.error;
  }
}

function orderPayload(state, now) {
  return {
    session_id:
      stateValue(
        state,
        "sessionId",
        "session_id"
      ),

    table_id:
      stateValue(
        state,
        "tableId",
        "table_id"
      ),

    staff_id:
      stateValue(
        state,
        "staffId",
        "staff_id"
      ),

    staff_name:
      stateValue(
        state,
        "staffName",
        "staff_name"
      ),

    status:
      state.status ||
      "OPEN",

    payment_status:
      stateValue(
        state,
        "paymentStatus",
        "payment_status",
        "UNPAID"
      ),

    production_status:
      stateValue(
        state,
        "productionStatus",
        "production_status",
        "PENDING"
      ),

    subtotal:
      Number(
        state.subtotal || 0
      ),

    service_charge_amount:
      Number(
        stateValue(
          state,
          "serviceCharge",
          "service_charge_amount",
          0
        )
      ),

    vat_amount:
      Number(
        stateValue(
          state,
          "vat",
          "vat_amount",
          0
        )
      ),

    discount_amount:
      Number(
        stateValue(
          state,
          "discount",
          "discount_amount",
          0
        )
      ),

    total:
      Number(
        stateValue(
          state,
          "total",
          "total_amount",
          0
        )
      ),

    total_amount:
      Number(
        stateValue(
          state,
          "total",
          "total_amount",
          0
        )
      ),

    updated_at:
      now,
  };
}

export async function saveRestaurantOrder({
  aggregate,
}) {
  const state =
    aggregate.state;

  const organizationId =
    stateValue(
      state,
      "organizationId",
      "organization_id"
    );

  if (!organizationId) {
    throw new Error(
      "organizationId required"
    );
  }

  const now =
    new Date().toISOString();

  let orderRecord = null;

  if (state.id) {
    const { data, error } =
      await supabaseAdmin
        .from("orders")
        .update(
          orderPayload(state, now)
        )
        .eq(
          "organization_id",
          organizationId
        )
        .eq("id", state.id)
        .select()
        .single();

    if (error) {
      throw error;
    }

    orderRecord = data;
  } else {
    const { data, error } =
      await supabaseAdmin
        .from("orders")
        .insert({
          organization_id:
            organizationId,

          ...orderPayload(
            state,
            now
          ),

          created_at:
            now,
        })
        .select()
        .single();

    if (error) {
      throw error;
    }

    orderRecord = data;
  }

  await persistSessionCustomer({
    organizationId,
    state,
  });

  const items =
    Array.isArray(state.items)
      ? state.items
      : [];

  for (const item of items) {
    if (
      item.persisted ||
      item.id_from_db
    ) {
      continue;
    }

    const { error } =
      await supabaseAdmin
        .from("order_items")
        .insert({
          organization_id:
            organizationId,

          order_id:
            orderRecord.id,

          dish_id:
            item.dishId ||
            item.dish_id ||
            null,

          item_name:
            item.name ||
            item.item_name,

          quantity:
            Number(
              item.quantity || 1
            ),

          price:
            Number(
              item.price || 0
            ),

          notes:
            item.notes || null,

          modifiers:
            item.configurationSelections ||
            item.modifiers ||
            item.transaction_configuration_selections ||
            null,

          seat_position:
            item.seatPosition ||
            item.seat_position ||
            null,

          status:
            item.status ||
            "PENDING",

          created_at:
            now,

          updated_at:
            now,
        });

    if (error) {
      throw error;
    }
  }

  return loadRestaurantOrder({
    organizationId,
    orderId:
      orderRecord.id,
  });
}
