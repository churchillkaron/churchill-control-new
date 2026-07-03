export async function assignSeatToBillGroup({
  itemIds,
  billGroup,
}) {
  const response = await fetch(
    "/api/pos/items/update-bill-group",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        itemIds,
        billGroup,
      }),
    }
  );

  return response.json();
}
