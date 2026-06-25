import {
  refreshKitchenReadModel,
} from "@/lib/restaurant/read-models";

export async function execute({
  organizationId,
  ticketId,
}) {
  return refreshKitchenReadModel({
    organizationId,
    ticketId,
  });
}
