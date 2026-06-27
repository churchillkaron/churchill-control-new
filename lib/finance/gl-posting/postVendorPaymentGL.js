import { createServerSupabase } from "@/lib/shared/supabase/server";
import { postAutomaticJournal } from "@/lib/finance/accounting/postAutomaticJournal";

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
    const result = await postAutomaticJournal({
      
      organizationId: organization_id,
      entityId: entity_id,
      journalDate: new Date().toISOString().slice(0, 10),
      referenceType: "VENDOR_PAYMENT",
      referenceId: payment_id,
      debitAccount: "2000",
      creditAccount: "1100",
      amount,
      description: "Vendor payment posted",
      createdBy: created_by,
      approvedBy: created_by,
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
