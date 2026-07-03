import { financeGateway } from "@/lib/finance/runtime/financeGateway";

export async function postVendorPaymentGL(payload) {
  return await financeGateway({
    type: "VENDOR_PAYMENT_POSTED",
    payload: {
      ...payload,
      entity_id: payload.entity_id || null,
    },
  });
}

export default postVendorPaymentGL;
