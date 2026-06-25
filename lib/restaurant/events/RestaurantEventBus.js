export async function publishRestaurantEvent({
  event,
  payload,
  context,
}) {

  return {
    event,
    payload,
    context,
    published: true,
    timestamp: new Date().toISOString(),
  };

}
