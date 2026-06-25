import {
  createKitchenTicket,
} from "@/lib/restaurant/repositories/kitchen/KitchenTicketRepository";

import {
  fromRepository,
} from "@/lib/restaurant/kitchen/mappers/KitchenTicketMapper";

export async function executeKitchenCommand({
  load,
  save = createKitchenTicket,
  command,
}) {
  const record =
    await load();

  const aggregate =
    fromRepository(record);

  await command(aggregate);

  return await save({
    document: aggregate.state,
  });
}
