import postGeneralLedgerEntry from "@/lib/finance/general-ledger/postGeneralLedgerEntry";

export default async function postVendorPaymentGL({
  tenant_id,
  payment_id,
  amount,
}) {

  try {

    // ===== AP REDUCTION =====
    await postGeneralLedgerEntry({

      tenant_id,

      account_name:
        "Accounts Payable",

      entry_type:
        "DEBIT",

      amount,

      reference_type:
        "VENDOR_PAYMENT",

      reference_id:
        payment_id,
    });

    // ===== CASH REDUCTION =====
    await postGeneralLedgerEntry({

      tenant_id,

      account_name:
        "Bank Account",

      entry_type:
        "CREDIT",

      amount,

      reference_type:
        "VENDOR_PAYMENT",

      reference_id:
        payment_id,
    });

    return {

      success: true,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
