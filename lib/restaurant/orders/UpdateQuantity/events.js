export async function publish() {
  return [
    "restaurant.order.item.quantity_updated",
    "restaurant.order.recalculated"
  ];
}
