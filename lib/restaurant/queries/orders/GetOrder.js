import {
  refreshOrderReadModel,
} from "@/lib/restaurant/read-models";

export async function execute({
  organizationId,
  orderId,
}) {
  return refreshOrderReadModel({
    organizationId,
    orderId,
  });
}
