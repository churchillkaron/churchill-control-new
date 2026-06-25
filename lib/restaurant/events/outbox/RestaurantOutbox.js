const queue = [];

export async function appendRestaurantEvent({
  event,
  context,
  payload,
}) {
  queue.push({
    id: crypto.randomUUID(),
    event,
    context,
    payload,
    createdAt: new Date().toISOString(),
  });

  return queue[queue.length - 1];
}

export async function getPendingRestaurantEvents() {
  return [...queue];
}

export async function removeRestaurantEvent(id) {
  const index =
    queue.findIndex(
      e => e.id === id
    );

  if (index >= 0) {
    queue.splice(index,1);
  }
}
