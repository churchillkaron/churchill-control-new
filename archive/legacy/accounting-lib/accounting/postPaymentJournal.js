export async function postPaymentJournal(
  supabase,
  payment,
  order
) {

  const journal = [

    {
      account_code:
        payment.payment_method === "CASH"

          ? "1000"

          : "1010",

      account_name:
        payment.payment_method === "CASH"

          ? "Cash"

          : "Bank",

      type: "DEBIT",

      amount:
        Number(
          payment.amount || 0
        ),
    },

    {
      account_code:
        "4000",

      account_name:
        "Food Revenue",

      type: "CREDIT",

      amount:

        Number(
          payment.amount || 0
        ) -

        Number(
          payment.tax_amount || 0
        ) -

        Number(
          payment.service_amount || 0
        ),
    },

    {
      account_code:
        "2100",

      account_name:
        "Tax Payable",

      type: "CREDIT",

      amount:
        Number(
          payment.tax_amount || 0
        ),
    },

    {
      account_code:
        "2200",

      account_name:
        "Service Charge Payable",

      type: "CREDIT",

      amount:
        Number(
          payment.service_amount || 0
        ),
    },

  ];

  await supabase

    .from(
      "journal_entries"
    )

    .insert({

      tenant_id:
        payment.tenant_id,

      reference_type:
        "PAYMENT",

      reference_id:
        payment.id,

      description:
        `Restaurant payment for table ${order.table_number}`,

      entries:
        journal,

      created_at:
        new Date().toISOString(),

    });

}
