export async function createPurchaseOrder(
  supabase,
  data
) {

  const {

    tenant_id,

    supplier_id,

    supplier_name,

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
    data: po,
    error,
  } = await supabase

    .from(
      "purchase_orders"
    )

    .insert({

      tenant_id,

      supplier_id,

      supplier_name,

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

  return po;

}
