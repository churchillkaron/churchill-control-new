import { RestaurantTableRepository } from "@/lib/restaurant/runtime/RestaurantTableRepository";

export async function executeRestaurantAction({
  action,
  context = {},
  payload = {},
}) {
  const organization_id =
    payload.organization_id ||
    context.organization_id ||
    context.organization?.id;

  if (!organization_id) {
    throw new Error("organization_id_required");
  }

  const tableRepo = new RestaurantTableRepository();

  switch (action) {
    case "restaurant.table.open":
      return tableRepo.openSession({
        organization_id,
        table_number: payload.table_number,
        guests: payload.guests || 1,
        waiter_id: payload.waiter_id || null,
      });

    case "restaurant.table.seat":
      return tableRepo.seatGuests({
        organization_id,
        table_number: payload.table_number,
        guests: payload.guests || 1,
        waiter_id: payload.waiter_id || null,
      });

    case "restaurant.table.close":
      return tableRepo.closeSession({
        organization_id,
        table_number: payload.table_number,
      });

    case "restaurant.table.transfer":
      return tableRepo.transferTable({
        organization_id,
        from_table: payload.from_table,
        to_table: payload.to_table,
      });

    case "restaurant.table.moveGuests":
      return tableRepo.moveGuests({
        organization_id,
        from_table: payload.from_table,
        to_table: payload.to_table,
        guests: payload.guests || 1,
      });

    default:
      throw new Error(`unsupported_restaurant_action:${action}`);
  }
}
