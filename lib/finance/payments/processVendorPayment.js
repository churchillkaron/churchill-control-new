import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import postVendorPaymentGL from "@/lib/finance/gl-posting/postVendorPaymentGL";

export default async function processVendorPayment({
  accounts_payable_id,
  payment_method = "BANK_TRANSFER",
  paid_by = "ACCOUNTING",
}) {

  try {

    // ===== LOAD AP =====
    const {
      data: ap,
      error: apError,
    } = await supabaseAdmin
      .from("accounts_payable")
      .select("*")
      .eq(
        "id",
        accounts_payable_id
      )
      .single();

    if (apError) {
      throw apError;
    }

    if (
      ap.status ===
      "PAID"
    ) {

      throw new Error(
        "ALREADY_PAID"
      );
    }

    // ===== CREATE PAYMENT =====
    const {
      data: payment,
      error: paymentError,
    } = await supabaseAdmin
      .from("vendor_payments")
      .insert([
        {

          tenant_id:
            ap.tenant_id,

          accounts_payable_id:
            ap.id,

          vendor_id:
            ap.vendor_id,

          amount:
            ap.amount,

          payment_method,

          paid_by,

          paid_at:
            new Date().toISOString(),

          created_at:
            new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (paymentError) {
      throw paymentError;
    }

    // ===== UPDATE AP =====
    const {
      error: updateError,
    } = await supabaseAdmin
      .from("accounts_payable")
      .update({

        status:
          "PAID",

        payment_date:
          new Date().toISOString(),
      })
      .eq(
        "id",
        ap.id
      );

    if (updateError) {
      throw updateError;
    }

    // ===== BANK LEDGER =====
    const {
      error: ledgerError,
    } = await supabaseAdmin
      .from("bank_ledger")
      .insert([
        {

          tenant_id:
            ap.tenant_id,

          transaction_type:
            "VENDOR_PAYMENT",

          reference_id:
            payment.id,

          amount:
            ap.amount,

          direction:
            "OUTFLOW",

          created_at:
            new Date().toISOString(),
        },
      ]);

    if (ledgerError) {
      throw ledgerError;
    }

    // ===== GL POSTING =====
    const glResult =
      await postVendorPaymentGL({

        tenant_id:
          ap.tenant_id,

        payment_id:
          payment.id,

        amount:
          ap.amount,
      });

    if (
      !glResult.success
    ) {

      throw new Error(
        glResult.error
      );
    }

    return {

      success: true,

      payment,

      gl_posted: true,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
