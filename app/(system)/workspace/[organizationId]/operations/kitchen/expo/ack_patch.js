export async function acknowledgeOrder({ orderId, tenantId }) {
  try {

    await fetch("/api/pos/orders/ack", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        orderId,
        tenantId,
        acknowledgedBy: "KITCHEN"
      })
    });

  } catch (err) {
    console.error("ACK FAILED", err);
  }
}
