import {
  updateWeightedAverageCost,
} from "@/lib/inventory/updateWeightedAverageCost";

export async function processGoodsReceipt(
  supabase,
  data
) {

  const {

    tenant_id,

    purchase_order_id,

    supplier_name,

    items,

    received_by,

  } = data;

  let totalAmount = 0;

  for (
    const item of items
  ) {

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

    const {
      data: inventory,
    } = await supabase

      .from(
        "inventory_items"
      )

      .select("*")

      .eq(
        "id",
        item.ingredient_id
      )

      .single();

    const newAverageCost =
      updateWeightedAverageCost(

        inventory?.quantity || 0,

        inventory?.average_cost || 0,

        quantity,

        unitCost
      );

    await supabase

      .from(
        "inventory_items"
      )

      .update({

        quantity:

          Number(
            inventory?.quantity || 0
          ) + quantity,

        average_cost:
          newAverageCost,

      })

      .eq(
        "id",
        item.ingredient_id
      );

    await supabase

      .from(
        "inventory_movements"
      )

      .insert({

        tenant_id,

        ingredient_id:
          item.ingredient_id,

        ingredient_name:
          item.ingredient_name,

        movement_type:
          "PURCHASE",

        quantity,

        unit:
          item.unit,

        reference_type:
          "GOODS_RECEIPT",

        reference_id:
          purchase_order_id,

        created_at:
          new Date().toISOString(),

      });

  }

  const {
    data: receipt,
    error,
  } = await supabase

    .from(
      "goods_receipts"
    )

    .insert({

      tenant_id,

      purchase_order_id,

      supplier_name,

      items,

      total_amount:
        totalAmount,

      received_by,

      status:
        "RECEIVED",

      created_at:
        new Date().toISOString(),

    })

    .select()

    .single();

  if (error)
    throw error;

  await supabase

    .from(
      "purchase_orders"
    )

    .update({

      status:
        "RECEIVED",

    })

    .eq(
      "id",
      purchase_order_id
    );

  await supabase

    .from(
      "journal_entries"
    )

    .insert({

      tenant_id,

      reference_type:
        "GOODS_RECEIPT",

      reference_id:
        receipt.id,

      description:
        `Inventory receipt from ${supplier_name}`,

      entries: [

        {
          account_code:
            "1200",

          account_name:
            "Inventory",

          type:
            "DEBIT",

          amount:
            totalAmount,
        },

        {
          account_code:
            "2000",

          account_name:
            "Accounts Payable",

          type:
            "CREDIT",

          amount:
            totalAmount,
        },

      ],

      created_at:
        new Date().toISOString(),

    });

  return receipt;

}
