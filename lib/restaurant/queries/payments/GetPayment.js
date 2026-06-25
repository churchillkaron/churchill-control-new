import {
  refreshPaymentReadModel,
} from "@/lib/restaurant/read-models";

export async function execute({
  organizationId,
  paymentId,
}) {
  return refreshPaymentReadModel({
    organizationId,
    paymentId,
  });
}
