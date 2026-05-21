export async function paySupplierInvoice(
  supabase,
  data
) {

  const {

    tenant_id,

    supplier_invoice_id,

    supplier_name,

    payment_method,

    amount,

    paid_by,

    reference_number,

  } = data;

  const {
    data: invoice,
    error: invoiceError,
  } = await supabase

    .from(
      "supplier_invoices"
    )

    .select("*")

    .eq(
      "id",
      supplier_invoice_id
    )

    .single();

  if (invoiceError)
    throw invoiceError;

  const {
    data: payment,
    error,
  } = await supabase

    .from(
      "supplier_payments"
    )

    .insert({

      tenant_id,

      supplier_invoice_id,

      supplier_name,

      payment_method,

      amount,

      reference_number,

      paid_by,

      status:
        "PAID",

      created_at:
        new Date().toISOString(),

    })

    .select()

    .single();

  if (error)
    throw error;

  await supabase

    .from(
      "supplier_invoices"
    )

    .update({

      status:
        "PAID",

      paid_at:
        new Date().toISOString(),

    })

    .eq(
      "id",
      supplier_invoice_id
    );

  await supabase

    .from(
      "journal_entries"
    )

    .insert({

      tenant_id,

      reference_type:
        "SUPPLIER_PAYMENT",

      reference_id:
        payment.id,

      description:
        `Supplier payment to ${supplier_name}`,

      entries: [

        {
          account_code:
            "2100",

          account_name:
            "Supplier Liability",

          type:
            "DEBIT",

          amount:
            Number(
              amount || 0
            ),
        },

        {
          account_code:

            payment_method ===
            "CASH"

              ? "1000"

              : "1010",

          account_name:

            payment_method ===
            "CASH"

              ? "Cash"

              : "Bank",

          type:
            "CREDIT",

          amount:
            Number(
              amount || 0
            ),
        },

      ],

      created_at:
        new Date().toISOString(),

    });

  return {

    success: true,

    payment,

    invoice,

  };

}
