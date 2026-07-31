import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function numeric(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value) {
  return Number(numeric(value).toFixed(2));
}

function isMissingRelation(error, relation) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    message.includes(String(relation || "").toLowerCase())
  );
}

export async function loadTablePaymentState({ organizationId, tableNumber }) {
  if (!organizationId) throw new Error("organizationId required");
  if (tableNumber === null || tableNumber === undefined || tableNumber === "") {
    throw new Error("tableNumber required");
  }

  const { data: table, error: tableError } = await supabaseAdmin
    .from("restaurant_tables")
    .select("*")
    .eq("organization_id", organizationId)
    .or(`table_number.eq.${tableNumber},table_name.eq.${tableNumber}`)
    .maybeSingle();

  if (tableError) throw tableError;
  if (!table) throw new Error("Restaurant table not found");

  const mergeResult = await supabaseAdmin
    .from("restaurant_table_merges")
    .select("master_table_id, merged_table_id")
    .eq("organization_id", organizationId)
    .or(`master_table_id.eq.${table.id},merged_table_id.eq.${table.id}`);

  if (mergeResult.error && !isMissingRelation(mergeResult.error, "restaurant_table_merges")) {
    throw mergeResult.error;
  }

  const merges = mergeResult.data || [];
  const parent = merges.find((row) => row.merged_table_id === table.id);
  const effectiveTableId = parent?.master_table_id || table.id;

  const childResult = await supabaseAdmin
    .from("restaurant_table_merges")
    .select("merged_table_id")
    .eq("organization_id", organizationId)
    .eq("master_table_id", effectiveTableId);

  if (childResult.error && !isMissingRelation(childResult.error, "restaurant_table_merges")) {
    throw childResult.error;
  }

  const tableIds = [
    effectiveTableId,
    ...(childResult.data || []).map((row) => row.merged_table_id),
  ];

  const [sessionResult, orderResult] = await Promise.all([
    supabaseAdmin
      .from("table_sessions")
      .select("*")
      .eq("organization_id", organizationId)
      .in("table_id", tableIds)
      .not("status", "in", "(CLOSED,COMPLETED,CANCELLED)")
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("orders")
      .select("*, order_items(*)")
      .eq("organization_id", organizationId)
      .in("table_id", tableIds)
      .not("status", "in", "(CANCELLED,VOID)")
      .order("created_at", { ascending: true }),
  ]);

  if (sessionResult.error) throw sessionResult.error;
  if (orderResult.error) throw orderResult.error;

  const sessions = sessionResult.data || [];
  const orders = orderResult.data || [];
  const orderIds = orders.map((order) => order.id).filter(Boolean);
  const sessionIds = [
    ...new Set([
      ...sessions.map((session) => session.id),
      ...orders.map((order) => order.session_id),
    ].filter(Boolean)),
  ];

  let payments = [];

  if (sessionIds.length) {
    const paymentResult = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("organization_id", organizationId)
      .in("session_id", sessionIds)
      .order("created_at", { ascending: true });

    if (paymentResult.error) throw paymentResult.error;
    payments = paymentResult.data || [];
  }

  let allocations = [];
  if (orderIds.length) {
    const allocationResult = await supabaseAdmin
      .from("restaurant_payment_allocations")
      .select("*")
      .eq("organization_id", organizationId)
      .in("order_id", orderIds);

    if (allocationResult.error) {
      if (!isMissingRelation(allocationResult.error, "restaurant_payment_allocations")) {
        throw allocationResult.error;
      }
    } else {
      allocations = allocationResult.data || [];
    }
  }

  const paymentIds = new Set(payments.map((payment) => payment.id));
  const relevantAllocations = allocations.filter(
    (allocation) => !allocation.payment_id || paymentIds.has(allocation.payment_id)
  );
  const allocatedByItem = relevantAllocations.reduce((map, allocation) => {
    if (!allocation.order_item_id) return map;
    map.set(
      allocation.order_item_id,
      numeric(map.get(allocation.order_item_id)) + numeric(allocation.amount)
    );
    return map;
  }, new Map());

  const rawItems = orders.flatMap((order) =>
    (order.order_items || []).map((item) => ({
      ...item,
      order_id: order.id,
      session_id: order.session_id,
    }))
  );

  const subtotal = orders.reduce(
    (sum, order) => sum + numeric(order.subtotal),
    0
  );
  const serviceCharge = orders.reduce(
    (sum, order) => sum + numeric(order.service_charge_amount),
    0
  );
  const tax = orders.reduce(
    (sum, order) => sum + numeric(order.vat_amount ?? order.tax_amount),
    0
  );
  const discount = orders.reduce(
    (sum, order) => sum + numeric(order.discount_amount),
    0
  );
  const total = orders.reduce(
    (sum, order) => sum + numeric(order.total_amount ?? order.total),
    0
  );
  const paidAmount = payments
    .filter((payment) => String(payment.status || "").toUpperCase() !== "VOID")
    .reduce((sum, payment) => sum + numeric(payment.amount), 0);

  const items = rawItems.map((item) => {
    const netAmount = numeric(item.price) * numeric(item.quantity || 1);
    const share = subtotal > 0 ? Math.min(1, netAmount / subtotal) : 0;
    const serviceAmount = serviceCharge * share;
    const taxAmount = tax * share;
    const discountAmount = discount * share;
    const grossAmount = Math.max(
      0,
      roundMoney(netAmount + serviceAmount + taxAmount - discountAmount)
    );
    const allocatedAmount = Math.max(
      0,
      roundMoney(allocatedByItem.get(item.id))
    );
    const remainingAmount = Math.max(
      0,
      roundMoney(grossAmount - allocatedAmount)
    );
    const remainingRatio = grossAmount > 0
      ? Math.min(1, remainingAmount / grossAmount)
      : 0;

    return {
      ...item,
      net_amount: roundMoney(netAmount),
      service_amount: roundMoney(serviceAmount),
      tax_amount: roundMoney(taxAmount),
      discount_amount: roundMoney(discountAmount),
      gross_amount: grossAmount,
      payment_allocated_amount: allocatedAmount,
      remaining_amount: remainingAmount,
      remaining_net_amount: roundMoney(netAmount * remainingRatio),
      remaining_service_amount: roundMoney(serviceAmount * remainingRatio),
      remaining_tax_amount: roundMoney(taxAmount * remainingRatio),
      remaining_discount_amount: roundMoney(discountAmount * remainingRatio),
      fully_paid: grossAmount > 0 && remainingAmount <= 0.01,
    };
  });

  return {
    table,
    effectiveTableId,
    mergedTableIds: tableIds,
    session: sessions[0] || {
      table_id: effectiveTableId,
      table_number: table.table_number || table.table_name,
    },
    orders,
    items,
    payments,
    itemAllocations: relevantAllocations,
    allocationTrackingAvailable: true,
    subtotal: roundMoney(subtotal),
    serviceCharge: roundMoney(serviceCharge),
    tax: roundMoney(tax),
    discount: roundMoney(discount),
    total: roundMoney(total),
    paidAmount: roundMoney(paidAmount),
    remainingBalance: Math.max(0, roundMoney(total - paidAmount)),
  };
}

export default loadTablePaymentState;
