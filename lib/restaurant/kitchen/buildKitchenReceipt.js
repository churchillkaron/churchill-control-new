/**
 * KITCHEN RECEIPT BUILDER (CLEAN DOMAIN MODEL)
 */

export function buildKitchenReceipt(order) {
  return {
    order_id: order.id,
    table_id: order.table_id || null,
    items: (order.items || []).map(item => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity || 1,
      station: item.station || "UNKNOWN",
      notes: item.notes || null,
      modifiers: Array.isArray(item.modifiers)
        ? item.modifiers.map(m => ({
            id: m.id || null,
            name: m.name,
            value: m.value || null,
          }))
        : [],
      status: item.status || "NEW",
    })),
    created_at: order.created_at,
  };
}
