import {
  loadKitchenTicket,
  saveKitchenTicket,
} from "@/lib/restaurant/repositories/kitchen/KitchenTicketRepository";

import {
  fromRepository,
} from "@/lib/restaurant/kitchen/mappers/KitchenTicketMapper";

export async function executeKitchenTicketCommand({
  organizationId,
  ticketId,
  command,
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  if (!ticketId) {
    throw new Error("ticketId required");
  }

  const record = await loadKitchenTicket({
    organizationId,
    ticketId,
  });

  const aggregate = fromRepository(record);

  await command(aggregate);

  return saveKitchenTicket({
    aggregate,
  });
}
