export async function acknowledgeOrder({ orderId, tenantId }) {
  try {

    await fetch("/api/restaurant/kitchen/ack", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        orderId,
        tenantId,
        acknowledgedBy: "FULFILLMENT"
      })
    });

  } catch (err) {
    console.error("ACK FAILED", err);
  }
}
