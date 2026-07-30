import {
  PaymentAggregate,
} from "@/lib/restaurant/aggregates/Payment/PaymentAggregate";

import {
  loadPayment,
  savePayment,
} from "@/lib/restaurant/repositories/payments/PaymentRepository";

export async function execute({
  context,
  payment,
  paymentId,
  reference,
}) {
  const organizationId = context?.organizationId;

  if (!organizationId) {
    throw new Error("organizationId required");
  }

  const resolvedPayment =
    payment ||
    (await loadPayment({
      organizationId,
      paymentId,
    }));

  const aggregate = new PaymentAggregate(resolvedPayment);
  aggregate.complete(reference);

  return savePayment({
    aggregate,
  });
}
