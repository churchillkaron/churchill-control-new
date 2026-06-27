import {
  executeKitchenTicketCommand,
} from "@/lib/restaurant/kitchen/runtime/KitchenApplicationService";

export async function execute({
  context,
  payload = {},
}) {
  return executeKitchenTicketCommand({
    organizationId: context.organizationId,
    ticketId: payload.ticketId || payload.ticket_id,
    command: async (aggregate) => {
      aggregate.complete();
    },
  });
}
