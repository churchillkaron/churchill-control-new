import {
  execute as createPayment,
} from "@/lib/restaurant/payments/workflows/CreatePayment";

export async function execute({

  context,

  payload,

}) {

  return createPayment({

    context,

    payload,

  });

}
