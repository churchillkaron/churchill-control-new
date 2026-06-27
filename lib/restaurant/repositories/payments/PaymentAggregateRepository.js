import {
  loadPayment,
  savePayment,
} from "./PaymentRepository";

import {
  fromRepository,
} from "@/lib/restaurant/payments/mappers/PaymentMapper";

export async function loadAggregate({

  organizationId,

  paymentId,

}) {

  const payment =
    await loadPayment({

      organizationId,

      paymentId,

    });

  return fromRepository(
    payment
  );

}

export async function saveAggregate({

  aggregate,

}) {

  return savePayment({

    aggregate,

  });

}
