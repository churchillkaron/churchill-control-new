import {
  PaymentAggregate,
} from "@/lib/restaurant/aggregates/Payment/PaymentAggregate";

import {
  savePayment,
} from "@/lib/restaurant/repositories/payments/PaymentRepository";

export async function execute({
  payment,
  reference,
}) {

  const aggregate =
    new PaymentAggregate(payment);

  aggregate.complete(reference);

  return await savePayment({
    aggregate,
  });

}
