export async function applyRules({
  organizationId,
  payload,
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  if (!payload.tableId && !payload.tableNumber) {
    throw new Error("tableId or tableNumber required");
  }

  const guestCount =
    Number(payload.guestCount || payload.guest_count || 0);

  if (guestCount < 0) {
    throw new Error("guestCount cannot be negative");
  }

  return {
    ...payload,
    guestCount,
  };
}
