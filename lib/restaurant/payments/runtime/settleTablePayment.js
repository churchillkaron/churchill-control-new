import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

function readValue(source, camelKey, snakeKey) {
  return source?.[camelKey] ?? source?.[snakeKey] ?? null;
}

function normalizeItemIds(value) {
  if (!Array.isArray(value)) return [];

  return [
    ...new Set(
      value
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    ),
  ];
}

function numeric(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value) {
  return Number(numeric(value).toFixed(2));
}

function errorResponse(error, status = 500) {
  return Response.json(
    {
      success: false,
      error,
    },
    { status }
  );
}

async function resolveDuplicateRemainingBalance({
  organizationId,
  paymentId,
  fallback,
}) {
  if (!organizationId || !paymentId) return numeric(fallback);

  const allocationResult = await supabaseAdmin
    .from("restaurant_payment_allocations")
    .select("order_id")
    .eq("organization_id", organizationId)
    .eq("payment_id", paymentId)
    .eq("allocation_type", "ORDER");

  if (allocationResult.error) {
    console.error(
      "DUPLICATE_SETTLEMENT_ALLOCATION_LOOKUP_ERROR",
      allocationResult.error
    );
    return numeric(fallback);
  }

  const orderIds = [
    ...new Set(
      (allocationResult.data || [])
        .map((row) => row.order_id)
        .filter(Boolean)
    ),
  ];

  if (!orderIds.length) return numeric(fallback);

  const orderResult = await supabaseAdmin
    .from("orders")
    .select("id, remaining_balance, total, total_amount, amount_paid")
    .eq("organization_id", organizationId)
    .in("id", orderIds);

  if (orderResult.error) {
    console.error(
      "DUPLICATE_SETTLEMENT_ORDER_LOOKUP_ERROR",
      orderResult.error
    );
    return numeric(fallback);
  }

  return Number(
    (orderResult.data || [])
      .reduce((sum, order) => {
        const persistedRemaining = Number(order.remaining_balance);

        if (Number.isFinite(persistedRemaining)) {
          return sum + Math.max(0, persistedRemaining);
        }

        const total = numeric(order.total_amount || order.total);
        const paid = numeric(order.amount_paid);
        return sum + Math.max(0, total - paid);
      }, 0)
      .toFixed(2)
  );
}

async function validateSelectedItemSettlement({
  organizationId,
  tableNumber,
  itemIds,
  amount,
  idempotencyKey,
}) {
  if (!itemIds.length) return { success: true };

  const existingPaymentResult = await supabaseAdmin
    .from("payments")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("payment_reference", idempotencyKey)
    .maybeSingle();

  if (existingPaymentResult.error) {
    return {
      success: false,
      error: existingPaymentResult.error.message,
      status: 500,
    };
  }

  if (existingPaymentResult.data) return { success: true };

  const tableResult = await supabaseAdmin
    .from("restaurant_tables")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("table_number", tableNumber)
    .maybeSingle();

  if (tableResult.error) {
    return {
      success: false,
      error: tableResult.error.message,
      status: 500,
    };
  }

  if (!tableResult.data) {
    return {
      success: false,
      error: "Restaurant table not found",
      status: 404,
    };
  }

  const mergeResult = await supabaseAdmin
    .from("restaurant_table_merges")
    .select("master_table_id, merged_table_id")
    .eq("organization_id", organizationId)
    .or(
      `master_table_id.eq.${tableResult.data.id},merged_table_id.eq.${tableResult.data.id}`
    );

  if (mergeResult.error) {
    return {
      success: false,
      error: mergeResult.error.message,
      status: 500,
    };
  }

  const parentMerge = (mergeResult.data || []).find(
    (row) => row.merged_table_id === tableResult.data.id
  );
  const effectiveTableId = parentMerge?.master_table_id || tableResult.data.id;

  const childResult = await supabaseAdmin
    .from("restaurant_table_merges")
    .select("merged_table_id")
    .eq("organization_id", organizationId)
    .eq("master_table_id", effectiveTableId);

  if (childResult.error) {
    return {
      success: false,
      error: childResult.error.message,
      status: 500,
    };
  }

  const tableIds = [
    effectiveTableId,
    ...(childResult.data || []).map((row) => row.merged_table_id),
  ];

  const orderResult = await supabaseAdmin
    .from("orders")
    .select(
      "id, subtotal, service_charge_amount, vat_amount, tax_amount, discount_amount"
    )
    .eq("organization_id", organizationId)
    .in("table_id", tableIds)
    .not("status", "in", "(CANCELLED,VOID,COMPLETED)");

  if (orderResult.error) {
    return {
      success: false,
      error: orderResult.error.message,
      status: 500,
    };
  }

  const orders = orderResult.data || [];
  const orderIds = orders.map((order) => order.id);

  if (!orderIds.length) {
    return {
      success: false,
      error: "No payable orders found for table",
      status: 400,
    };
  }

  const itemResult = await supabaseAdmin
    .from("order_items")
    .select("id, order_id, price, quantity")
    .eq("organization_id", organizationId)
    .in("order_id", orderIds)
    .in("id", itemIds);

  if (itemResult.error) {
    return {
      success: false,
      error: itemResult.error.message,
      status: 500,
    };
  }

  const items = itemResult.data || [];

  if (items.length !== itemIds.length) {
    return {
      success: false,
      error: "Selected payment items do not belong to the table",
      status: 400,
    };
  }

  const allocationResult = await supabaseAdmin
    .from("restaurant_payment_allocations")
    .select("order_item_id")
    .eq("organization_id", organizationId)
    .eq("allocation_type", "ITEM")
    .in("order_item_id", itemIds);

  if (allocationResult.error) {
    const migrationMissing =
      allocationResult.error.code === "42P01" ||
      allocationResult.error.code === "PGRST205" ||
      /restaurant_payment_allocations/i.test(
        allocationResult.error.message || ""
      );

    return {
      success: false,
      error: migrationMissing
        ? "Selected-item settlement integrity is not deployed in the database"
        : allocationResult.error.message,
      status: migrationMissing ? 503 : 500,
    };
  }

  if ((allocationResult.data || []).length) {
    return {
      success: false,
      error: "One or more selected items are already paid",
      status: 409,
    };
  }

  const subtotal = orders.reduce(
    (sum, order) => sum + numeric(order.subtotal),
    0
  );
  const serviceCharge = orders.reduce(
    (sum, order) => sum + numeric(order.service_charge_amount),
    0
  );
  const tax = orders.reduce(
    (sum, order) => sum + numeric(order.vat_amount || order.tax_amount),
    0
  );
  const discount = orders.reduce(
    (sum, order) => sum + numeric(order.discount_amount),
    0
  );

  const selectedAmount = roundMoney(
    items.reduce((sum, item) => {
      const net = numeric(item.price) * numeric(item.quantity || 1);
      const share = subtotal > 0 ? Math.min(1, net / subtotal) : 0;
      return (
        sum +
        net +
        serviceCharge * share +
        tax * share -
        discount * share
      );
    }, 0)
  );

  if (Math.abs(selectedAmount - roundMoney(amount)) > 0.01) {
    return {
      success: false,
      error: `Selected-item payment must equal ${selectedAmount.toFixed(2)}`,
      status: 400,
    };
  }

  return { success: true };
}

export async function settleTablePayment(request, { partial }) {
  try {
    const body = await request.json();
    const requestedOrganizationId = readValue(
      body,
      "organizationId",
      "organization_id"
    );
    const access = await requireOrganizationAccess({
      organizationId: requestedOrganizationId,
      request,
    });

    if (!access.success) {
      return errorResponse(access.error, access.status || 403);
    }

    const tableNumber = readValue(body, "tableNumber", "table_number");
    const paymentMethod = readValue(
      body,
      "paymentMethod",
      "payment_method"
    );
    const amount = Number(
      readValue(body, "paidAmount", "paid_amount") ?? body.amount ?? 0
    );
    const idempotencyKey =
      request.headers.get("idempotency-key") ||
      readValue(body, "idempotencyKey", "idempotency_key");
    const itemIds = normalizeItemIds(
      body.itemIds ?? body.item_ids ?? []
    );

    if (
      tableNumber === null ||
      tableNumber === undefined ||
      tableNumber === ""
    ) {
      return errorResponse("tableNumber required", 400);
    }

    if (!paymentMethod) {
      return errorResponse("paymentMethod required", 400);
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return errorResponse(
        "payment amount must be greater than zero",
        400
      );
    }

    if (!idempotencyKey) {
      return errorResponse("idempotencyKey required", 400);
    }

    const selectedItemValidation = await validateSelectedItemSettlement({
      organizationId: access.organizationId,
      tableNumber,
      itemIds,
      amount,
      idempotencyKey: String(idempotencyKey),
    });

    if (!selectedItemValidation.success) {
      return errorResponse(
        selectedItemValidation.error,
        selectedItemValidation.status || 400
      );
    }

    const actorId = access.user?.id || access.staff?.id || null;
    const { data, error } = await supabaseAdmin.rpc(
      "restaurant_settle_table_atomic",
      {
        p_organization_id: access.organizationId,
        p_table_number: String(tableNumber),
        p_amount: amount,
        p_payment_method: String(paymentMethod),
        p_partial: Boolean(partial),
        p_item_ids: itemIds.length ? itemIds : null,
        p_idempotency_key: String(idempotencyKey),
        p_actor_id: actorId,
      }
    );

    if (error) {
      const functionMissing =
        error.code === "PGRST202" ||
        /restaurant_settle_table_atomic/i.test(error.message || "");

      if (functionMissing) {
        return errorResponse(
          "Atomic restaurant settlement is not deployed in the database",
          503
        );
      }

      const selectedItemConflict =
        error.code === "23505" &&
        /restaurant_payment_allocations_unique_item_settlement_idx/i.test(
          error.message || ""
        );

      if (selectedItemConflict) {
        return errorResponse(
          "One or more selected items are already paid",
          409
        );
      }

      return errorResponse(
        error.message || "Payment settlement failed",
        400
      );
    }

    const result = data || {};

    if (result.duplicate && result.paymentId) {
      const remainingBalance = await resolveDuplicateRemainingBalance({
        organizationId: access.organizationId,
        paymentId: result.paymentId,
        fallback: result.remainingBalance,
      });

      return Response.json({
        success: true,
        ...result,
        remainingBalance,
        fullyPaid: remainingBalance <= 0,
      });
    }

    return Response.json({
      success: true,
      ...result,
    });
  } catch (error) {
    return errorResponse(
      error?.message || "Payment settlement failed",
      500
    );
  }
}
