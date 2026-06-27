import {
  FinancePaymentAggregate,
} from "@/lib/finance/aggregates/Payment";

import {
  loadFinancePayment,
  saveFinancePayment,
} from "@/lib/finance/repositories/payments/FinancePaymentRepository";

export async function executeAggregateCommand({

  paymentId,

  command,

}) {

  const payment =
    await loadFinancePayment({

      paymentId,

    });

  const aggregate =
    new FinancePaymentAggregate(
      payment
    );

  await command(
    aggregate
  );

  return await saveFinancePayment({

    aggregate,

  });

}

export async function createAggregate({

  document,

}) {

  const aggregate =
    new FinancePaymentAggregate(
      document
    );

  return await saveFinancePayment({

    aggregate,

  });

}
