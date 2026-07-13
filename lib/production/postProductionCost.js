export async function postProductionCost(
  supabase,
  orderItem,
  totalCost
) {

  const entries = [

    {
      account_code:
        "5000",

      account_name:
        "Cost of Goods Sold",

      type:
        "DEBIT",

      amount:
        Number(
          totalCost || 0
        ),
    },

    {
      account_code:
        "1200",

      account_name:
        "Inventory",

      type:
        "CREDIT",

      amount:
        Number(
          totalCost || 0
        ),
    },

  ];

  await supabase

    .from(
      "journal_entries"
    )

    .insert({

      organization_id:
        orderItem.organization_id,

      entity_id:
        orderItem.entity_id ||
        null,

      reference_type:
        "PRODUCTION",

      reference_id:
        orderItem.id,

      description:
        `Production cost for ${orderItem.item_name}`,

      entries,

      created_at:
        new Date().toISOString(),

    });

  return {

    success: true,

  };

}
