import { supabase } from "@/lib/supabase";

export async function postAccrualEntry({
  tenantId,
  accrualType,
  referenceType,
  referenceId,
  debitAccount,
  creditAccount,
  amount,
  accrualDate,
  reversalDate,
}) {
  const { data, error } =
    await supabase
      .from(
        "accounting_accrual_entries"
      )
      .insert({
        tenant_id: tenantId,
        accrual_type:
          accrualType,
        reference_type:
          referenceType,
        reference_id:
          referenceId,
        debit_account:
          debitAccount,
        credit_account:
          creditAccount,
        amount,
        accrual_date:
          accrualDate,
        reversal_date:
          reversalDate,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
