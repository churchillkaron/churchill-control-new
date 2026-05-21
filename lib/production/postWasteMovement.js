export async function postWasteMovement(
  supabase,
  data
) {

  const {

    tenant_id,

    ingredient_id,

    ingredient_name,

    quantity,

    unit,

    reason,

    staff_name,

    cost,

  } = data;

  await supabase

    .from(
      "inventory_movements"
    )

    .insert({

      tenant_id,

      ingredient_id,

      ingredient_name,

      movement_type:
        "WASTE",

      quantity,

      unit,

      reference_type:
        "WASTE",

      notes:
        reason,

      created_at:
        new Date().toISOString(),

    });

  await supabase

    .from(
      "waste_logs"
    )

    .insert({

      tenant_id,

      ingredient_id,

      ingredient_name,

      quantity,

      unit,

      reason,

      staff_name,

      cost,

      created_at:
        new Date().toISOString(),

    });

  await supabase

    .from(
      "journal_entries"
    )

    .insert({

      tenant_id,

      reference_type:
        "WASTE",

      description:
        `Waste recorded for ${ingredient_name}`,

      entries: [

        {
          account_code:
            "5100",

          account_name:
            "Waste Expense",

          type:
            "DEBIT",

          amount:
            Number(
              cost || 0
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
              cost || 0
            ),
        },

      ],

      created_at:
        new Date().toISOString(),

    });

  return {

    success: true,

  };

}
