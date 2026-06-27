import {
  createPaymentDocument,
} from "@/lib/restaurant/payments/documents/PaymentFactory";

import {
  PaymentAggregate,
} from "@/lib/restaurant/aggregates/Payment/PaymentAggregate";

import {
  savePayment,
} from "@/lib/restaurant/repositories/payments/PaymentRepository";

export async function execute({
  context,
  payload,
}) {

  const aggregate =
    new PaymentAggregate(
      createPaymentDocument({

        organizationId:
          context.organizationId,

        orderId:
          payload.orderId,

        sessionId:
          payload.sessionId,

        amount:
          payload.amount,

        method:
          payload.method,

      })
    );

  return await savePayment({
    aggregate,
  });

}
