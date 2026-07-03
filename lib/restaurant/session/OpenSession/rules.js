export async function applyRules({ context, payload }) {
  if (!context?.organization_id) {
    throw new Error("organization_id required");
  }

  if (!payload.tableId && !payload.table_id && !payload.tableNumber && !payload.table_number) {
    throw new Error("tableId or tableNumber required");
  }

  const guestCount = Number(payload.guestCount || payload.guest_count || 0);

  if (guestCount < 0) {
    throw new Error("guestCount cannot be negative");
  }

  return {
    ...payload,
    guestCount,
  };
}
