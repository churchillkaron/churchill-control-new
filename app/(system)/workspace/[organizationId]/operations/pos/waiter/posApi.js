export async function posApi(action, payload) {
  const response = await fetch("/api/ubte/execute", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      capability: "restaurant.pos",
      action,
      payload,
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "POS execution failed");
  }

  return result;
}
