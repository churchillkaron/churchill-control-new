import { supabase } from "@/lib/shared/supabase/client";

export async function processPayrollPayout({

  tenantId,

  payrollRecord,

  processedBy = null,

  paymentMethod = "BANK_TRANSFER",

  payoutReference = "",

  notes = "",

}) {

  // ===== CREATE PAYOUT =====
  const {
    data: payoutData,
    error: payoutError,
  } = await supabase
    .from(
      "payroll_payouts"
    )
    .insert({

      tenant_id:
        tenantId,

      payroll_record_id:
        payrollRecord.id,

      staff_id:
        payrollRecord.staff_id,

      staff_name:
        payrollRecord.staff_name,

      amount:
        Number(
          payrollRecord.final_salary || 0
        ),

      payment_method:
        paymentMethod,

      payout_reference:
        payoutReference,

      payout_status:
        "COMPLETED",

      processed_by:
        processedBy,

      processed_at:
        new Date(),

      notes,
    })
    .select()
    .single();

  if (payoutError) {

    console.error(
      "PAYOUT ERROR",
      payoutError
    );

    throw payoutError;
  }

  // ===== UPDATE PAYROLL =====
  const {
    error: payrollError,
  } = await supabase
    .from(
      "payroll_records"
    )
    .update({

      payout_status:
        "COMPLETED",

      payout_date:
        new Date(),

      payment_reference:
        payoutReference,

      notes,
    })
    .eq(
      "id",
      payrollRecord.id
    );

  if (payrollError) {

    console.error(
      "PAYROLL UPDATE ERROR",
      payrollError
    );

    throw payrollError;
  }

  return payoutData;
}
