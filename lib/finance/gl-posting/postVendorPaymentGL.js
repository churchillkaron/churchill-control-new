import { createServerSupabase } from "@/lib/shared/supabase/server";
import { postAutomaticJournal } from "@/lib/finance/core/postAutomaticJournal";

export default async function postVendorPaymentGL({
  tenant_id,
  payment_id,
  amount,
  created_by = "system",
}) {
  try {
    const result = await postAutomaticJournal({
      tenantId: tenant_id,
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
