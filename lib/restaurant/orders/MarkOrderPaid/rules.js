export async function applyRules({

  payload,

}) {

  return {

    orderId:
      payload.orderId,

    paymentMethod:
      payload.paymentMethod,

    paidAmount:
      Number(
        payload.paidAmount || 0
      ),

    changeAmount:
      Number(
        payload.changeAmount || 0
      ),

    paidAt:
      payload.paidAt ||
      new Date().toISOString(),

    partial:
      Boolean(
        payload.partial
      ),

  };

}
