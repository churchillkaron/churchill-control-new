import {
  execute as completePayment,
} from "@/lib/restaurant/payments/workflows/CompletePayment";

import {
  execute as markOrderPaid,
} from "@/lib/restaurant/orders/MarkOrderPaid/execute";

export async function execute({

  context,

  payload,

}) {

  const payment =
    await completePayment({

      context,

      paymentId:
        payload.paymentId,

      reference:
        payload.reference,

    });

  if (payload.orderId) {

    await markOrderPaid({

      context,

      payload: {

        orderId:
          payload.orderId,

        paymentMethod:
          payload.paymentMethod,

        paidAmount:
          payload.paidAmount ||
          payment.amount,

        changeAmount:
          payload.changeAmount || 0,

        partial:
          Boolean(
            payload.partial
          ),

      },

    });

  }

  return payment;

}
