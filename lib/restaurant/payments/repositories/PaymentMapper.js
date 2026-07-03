import {
  PaymentAggregate,
} from "@/lib/restaurant/aggregates/Payment";

export function fromRepository(payment) {
  return new PaymentAggregate({
    ...payment,

    organizationId:
      payment.organization_id,

    orderId:
      payment.order_id,

    sessionId:
      payment.session_id,

    amount:
      Number(payment.amount || 0),

    method:
      payment.payment_method,

    reference:
      payment.payment_reference,

    status:
      payment.status,

    paidAt:
      payment.paid_at,

    createdAt:
      payment.created_at,

    updatedAt:
      payment.updated_at,
  });
}
