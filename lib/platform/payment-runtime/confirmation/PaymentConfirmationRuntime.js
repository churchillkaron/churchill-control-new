import {
  PaymentTransactionRepository,
} from "../repositories/PaymentTransactionRepository";


import {
  WalletRuntime,
} from "@/lib/platform/service-runtime/wallet/runtime/WalletRuntime";


export async function confirmPayment({

  paymentId,

  status,

}) {


  const payment =
    await PaymentTransactionRepository.get(
      paymentId
    );


  const updated =
    await PaymentTransactionRepository.update(
      paymentId,
      {
        status,
      }
    );


  if (
    status === "completed"
  ) {

    await WalletRuntime.topup({

      organization_id:
        payment.organization_id,

      amount:
        payment.amount,

      currency:
        payment.currency,

      metadata:{
        payment_id:
          payment.id,

        payment_method:
          payment.payment_method,

        provider:
          payment.provider,

      },

    });

  }


  return updated;

}


export const PaymentConfirmationRuntime = {

  confirmPayment,

};
