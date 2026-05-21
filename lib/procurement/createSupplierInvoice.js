export async function createSupplierInvoice(
  supabase,
  data
) {

  const {

    tenant_id,

    supplier_id,

    supplier_name,

    purchase_order_id,

    goods_receipt_id,

    invoice_number,

    invoice_date,

    due_date,

    items,

    created_by,

  } = data;

  let totalAmount = 0;

  const preparedItems =
    items.map(item => {

      const quantity =
        Number(
          item.quantity || 0
        );

      const unitCost =
        Number(
          item.unit_cost || 0
        );

      const total =
        quantity *
        unitCost;

      totalAmount += total;

      return {

        ingredient_id:
          item.ingredient_id,

        ingredient_name:
          item.ingredient_name,

        quantity,

        unit:
          item.unit,

        unit_cost:
          unitCost,

        total_cost:
          total,

      };

    });

  const {
    data: invoice,
    error,
  } = await supabase

    .from(
      "supplier_invoices"
    )

    .insert({

      tenant_id,

      supplier_id,

      supplier_name,

      purchase_order_id,

      goods_receipt_id,

      invoice_number,

      invoice_date,

      due_date,

      status:
        "PENDING",

      total_amount:
        totalAmount,

      items:
        preparedItems,

      created_by,

      created_at:
        new Date().toISOString(),

    })

    .select()

    .single();

  if (error)
    throw error;

  await supabase

    .from(
      "journal_entries"
    )

    .insert({

      tenant_id,

      reference_type:
        "SUPPLIER_INVOICE",

      reference_id:
        invoice.id,

      description:
        `Supplier invoice ${invoice_number}`,

      entries: [

        {
          account_code:
            "2000",

          account_name:
            "Accounts Payable",

          type:
            "DEBIT",

          amount:
            totalAmount,
        },

        {
          account_code:
            "2100",

          account_name:
            "Supplier Liability",

          type:
            "CREDIT",

          amount:
            totalAmount,
        },

      ],

      created_at:
        new Date().toISOString(),

    });

  return invoice;

}
