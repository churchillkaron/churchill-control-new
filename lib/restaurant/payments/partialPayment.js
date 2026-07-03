import { financeGateway } from "@/lib/finance/runtime/financeGateway";

export async function partialPayment({
  order_id,
  organization_id,
  entity_id,
  amount
}) {

  if (!order_id || !organization_id) {
    throw new Error("Missing required payment context");
  }

  return await restaurantFinanceContract({
    type: "CUSTOMER_PAYMENT_RECEIVED",
    payload: {
      order_id,
      organization_id,
      entity_id,
      amount,
      partial: true
    }
  });
}
EOFcat > /tmp/fix-move-guest.js <<'EOF'
async function confirmMoveGuest() {
  if (!modalTable || !targetTable || !moveSeatValue) return;

  try {
    const result = await moveGuestsBetweenTables({
      organizationId,
      sourceTableId: modalTable.id,
      targetTableId: targetTable.id
    });

    if (!result?.success) {
      alert(result?.error || "Move guest failed");
      return;
    }

    closeModal();
    await loadRuntime();

  } catch (err) {
    console.error("MOVE_GUEST_ERROR", err);
    alert(err?.message || "Move guest failed");
  }
}
