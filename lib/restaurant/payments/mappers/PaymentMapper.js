import {
  PaymentAggregate,
} from "@/lib/restaurant/aggregates/Payment";

export function fromRepository(payment) {

  return new PaymentAggregate({

    ...payment,

    organizationId:
      payment.entity_id,

    orderId:
      payment.order_id,

    sessionId:
      payment.session_id,

    method:
      payment.payment_method,

    reference:
      payment.payment_reference,

    paidAt:
      payment.paid_at,

    createdAt:
      payment.created_at,

    updatedAt:
      payment.updated_at,

  });

}
