export async function assignSeatToBillGroup({
  organizationId,
  tableId,
  itemIds,
  billGroup,
}) {
  const response = await fetch("/api/pos/items/update-bill-group", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      organizationId,
      tableId,
      itemIds,
      billGroup,
    }),
  });

  let result;

  try {
    result = await response.json();
  } catch {
    result = {
      success: false,
      error: "Bill group assignment returned an invalid response",
    };
  }

  if (!response.ok || !result.success) {
    return {
      success: false,
      error: result.error || "Bill group assignment failed",
    };
  }

  return result;
}
