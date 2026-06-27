import { financeGateway } from "@/lib/finance/runtime/financeGateway";

export default async function postVendorPaymentGL({
  organization_id,
  entity_id,
  payment_id,
  amount,
  created_by = "system",
}) {
  if (!organization_id) {
    throw new Error("organization_id required");
  }

  if (!entity_id) {
    throw new Error("entity_id required");
  }

  try {
    const result = await financeGateway({
      type: "AUTO_JOURNAL",
      payload: {
        organization_id,
        entity_id,
        sourceModule: "payments",
        sourceId: payment_id,
        amount,
        description: "Vendor payment posted",
        debitAccount: "2000",
        creditAccount: "1100",
        createdBy: created_by,
        approvedBy: created_by,
        entryDate: new Date().toISOString().slice(0, 10),
      },
    });

    return {
      success: true,
      result,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}
