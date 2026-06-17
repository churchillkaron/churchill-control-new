import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

import { emitAccountingEvent } from "./emitAccountingEvent";

export async function importBankTransaction({
  tenantId,
  bankAccountId,
  transactionDate,
  reference,
  description,
  amount,
  transactionType,
}) {
  const { data, error } =
    await supabase
      .from(
        "bank_transaction_imports"
      )
      .insert({
        tenant_id: tenantId,
        bank_account_id:
          bankAccountId,
        transaction_date:
          transactionDate,
        reference,
        description,
        amount,
        transaction_type:
          transactionType,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  await emitAccountingEvent({
    tenantId,
    eventType:
      "BANK_TRANSACTION",
    sourceModule: "banking",
    sourceId: data.id,
    payload: {
      amount,
      entryDate:
        transactionDate,
      description,
    },
  });

  return data;
}
