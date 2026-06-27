import {
  execute as createPayment,
} from "@/lib/restaurant/payments/CreatePayment/execute";

export async function execute({

  context,

  payload,

}) {

  return createPayment({

    context,

    payload,

  });

}
