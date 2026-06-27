import {
  loadAggregate,
  saveAggregate,
} from "@/lib/restaurant/repositories/payments/PaymentAggregateRepository";

export async function executeAggregateCommand({

  organizationId,

  paymentId,

  command,

}) {

  const aggregate =
    await loadAggregate({

      organizationId,

      paymentId,

    });

  await command(
    aggregate
  );

  return await saveAggregate({

    aggregate,

  });

}
