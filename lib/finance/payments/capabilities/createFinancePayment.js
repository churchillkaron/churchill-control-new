import {
  createAggregate,
} from "@/lib/finance/payments/services/FinancePaymentApplicationService";

export async function execute({

  context = {},

  payload = {},

}) {

  return await createAggregate({

    document: {

      id:
        payload.id,

      entityId:
        payload.entityId,

      tableSessionId:
        payload.tableSessionId,

      tableNumber:
        payload.tableNumber,

      receiptNumber:
        payload.receiptNumber,

      paymentMethod:
        payload.paymentMethod,

      subtotal:
        Number(payload.subtotal || 0),

      serviceChargeAmount:
        Number(payload.serviceChargeAmount || 0),

      vatAmount:
        Number(payload.vatAmount || 0),

      discountAmount:
        Number(payload.discountAmount || 0),

      finalTotal:
        Number(payload.finalTotal || 0),

      paidAmount:
        Number(payload.paidAmount || 0),

      changeAmount:
        Number(payload.changeAmount || 0),

      cashierName:
        payload.cashierName,

      createdBy:
        payload.createdBy,

      notes:
        payload.notes,

      status:
        "PAID",

      createdAt:
        new Date().toISOString(),

      updatedAt:
        new Date().toISOString(),

    },

  });

}
