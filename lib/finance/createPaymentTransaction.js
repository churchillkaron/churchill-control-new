import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import { generateReceiptNumber } from "@/lib/finance/generateReceiptNumber";

export async function createPaymentTransaction({

  organizationId,

  tableSessionId,

  tableNumber,

  paymentMethod = "CASH",

  subtotal = 0,

  serviceChargeAmount = 0,

  vatAmount = 0,

  discountAmount = 0,

  finalTotal = 0,

  paidAmount = 0,

  changeAmount = 0,

  createdBy = null,

  cashierName = "SYSTEM",

  notes = "",

}) {

  const receiptNumber =
    generateReceiptNumber();

  const {
    data,
    error,
  } = await supabaseAdmin
    .from(
      "payment_transactions"
    )
    .insert({

      organization_id:
        organizationId,

      table_session_id:
        tableSessionId,

      table_number:
        tableNumber,

      receipt_number:
        receiptNumber,

      cashier_name:
        cashierName,

      notes,

      payment_method:
        paymentMethod,

      subtotal:
        Number(subtotal),

      service_charge_amount:
        Number(
          serviceChargeAmount
        ),

      vat_amount:
        Number(vatAmount),

      discount_amount:
        Number(discountAmount),

      final_total:
        Number(finalTotal),

      paid_amount:
        Number(paidAmount),

      change_amount:
        Number(changeAmount),

      created_by:
        createdBy,

      status:
        "PAID",
    })
    .select()
    .single();

  if (error) {

    console.error(
      "PAYMENT TRANSACTION ERROR",
      error
    );

    throw error;
  }

  return data;
}
