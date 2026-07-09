import {
  WalletRuntime,
} from "@/lib/platform/service-runtime/wallet/runtime/WalletRuntime";


export async function execute({
  context,
  payload = {},
}) {

  return await WalletRuntime.topup({

    organization_id:
      context.organizationId,

    amount:
      payload.amount,

    currency:
      payload.currency,

    metadata: {

      payment_method:
        payload.payment_method || null,

      reference:
        payload.reference || null,

      notes:
        payload.notes || null,

    },

  });

}
