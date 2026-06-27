import {
  loadAggregate,
  saveAggregate,
} from "@/lib/restaurant/repositories/orders/RestaurantOrderAggregateRepository";

export async function executeAggregateCommand({
  organizationId,
  orderId,
  command,
}) {
  const aggregate =
    await loadAggregate({
      organizationId,
      orderId,
    });

  await command(aggregate);

  return await saveAggregate({
    aggregate,
  });
}
