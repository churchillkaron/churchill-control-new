import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

export async function saveFinancePayment({

  aggregate,

}) {

  const payment =
    aggregate.state;

  const {
    data,
    error,
  } = await supabaseAdmin
    .from("payment_transactions")
    .upsert({

      id:
        payment.id,

      entity_id:
        payment.entityId,

      table_session_id:
        payment.tableSessionId,

      table_number:
        payment.tableNumber,

      receipt_number:
        payment.receiptNumber,

      payment_method:
        payment.paymentMethod,

      subtotal:
        payment.subtotal,

      service_charge_amount:
        payment.serviceChargeAmount,

      vat_amount:
        payment.vatAmount,

      discount_amount:
        payment.discountAmount,

      final_total:
        payment.finalTotal,

      paid_amount:
        payment.paidAmount,

      change_amount:
        payment.changeAmount,

      cashier_name:
        payment.cashierName,

      created_by:
        payment.createdBy,

      notes:
        payment.notes,

      status:
        payment.status,

    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;

}

export async function loadFinancePayment({

  paymentId,

}) {

  const {
    data,
    error,
  } = await supabaseAdmin
    .from("payment_transactions")
    .select("*")
    .eq("id", paymentId)
    .single();

  if (error) {
    throw error;
  }

  return data;

}
