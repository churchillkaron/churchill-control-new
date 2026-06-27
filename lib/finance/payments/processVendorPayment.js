import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import postVendorPaymentGL from "@/lib/finance/gl-posting/postVendorPaymentGL";

export default async function processVendorPayment({
  organization_id,
  entity_id,
  accounts_payable_id,
  payment_method = "BANK_TRANSFER",
  paid_by = "ACCOUNTING",
}) {

  if (!organization_id) {
    throw new Error("organization_id required");
  }

  if (!entity_id) {
    throw new Error("entity_id required");
  }
  try {
    const {
      data: ap,
      error: apError,
    } = await supabaseAdmin
      .from("accounts_payable")
      .select("*")
      .eq("organization_id", organization_id)
      .eq("entity_id", entity_id)
      .eq("id", accounts_payable_id)
      .single();

    if (apError) {
      throw apError;
    }

    if (ap.status === "PAID") {
      throw new Error("ALREADY_PAID");
    }

    if (!ap.organization_id) {
      throw new Error("organization_id required");
    }

    if (!ap.entity_id) {
      throw new Error("entity_id required");
    }

    const {
      data: payment,
      error: paymentError,
    } = await supabaseAdmin
      .from("vendor_payments")
      .insert([
        {
          organization_id: ap.organization_id,
          entity_id: ap.entity_id,
          accounts_payable_id: ap.id,
          vendor_id: ap.vendor_id,
          amount: ap.amount,
          payment_method,
          paid_by,
          paid_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (paymentError) {
      throw paymentError;
    }

    const {
      error: updateError,
    } = await supabaseAdmin
      .from("accounts_payable")
      .update({
        status: "PAID",
        payment_date: new Date().toISOString(),
      })
      .eq("id", ap.id)
      .eq("organization_id", ap.organization_id)
      .eq("entity_id", ap.entity_id);

    if (updateError) {
      throw updateError;
    }

    const {
      error: ledgerError,
    } = await supabaseAdmin
      .from("bank_ledger")
      .insert([
        {
          organization_id: ap.organization_id,
          entity_id: ap.entity_id,
          transaction_type: "VENDOR_PAYMENT",
          reference_id: payment.id,
          amount: ap.amount,
          direction: "OUTFLOW",
          created_at: new Date().toISOString(),
        },
      ]);

    if (ledgerError) {
      throw ledgerError;
    }

    const glResult =
      await postVendorPaymentGL({
        organization_id: ap.organization_id,
        entity_id: ap.entity_id,
        payment_id: payment.id,
        amount: ap.amount,
      });

    if (!glResult.success) {
      throw new Error(glResult.error);
    }

    return {
      success: true,
      payment,
      gl_posted: true,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}
