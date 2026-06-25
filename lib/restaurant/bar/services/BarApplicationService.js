import {
  fromRepository,
} from "../mappers/BarTicketMapper";

import {
  saveBarTicket,
} from "@/lib/restaurant/repositories/bar/BarTicketRepository";

export async function executeBarCommand({
  load,
  command,
}) {

  const record =
    await load();

  const aggregate =
    fromRepository(record);

  await command(
    aggregate
  );

  return saveBarTicket({
    aggregate,
  });

}
