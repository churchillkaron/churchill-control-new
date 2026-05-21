export async function approvePurchaseOrder(
  supabase,
  data
) {

  const {

    purchase_order_id,

    approved_by,

    approval_role,

    approval_notes,

    approval_limit,

  } = data;

  const {
    data: po,
    error,
  } = await supabase

    .from(
      "purchase_orders"
    )

    .select("*")

    .eq(
      "id",
      purchase_order_id
    )

    .single();

  if (error)
    throw error;

  if (
    Number(
      po.total_amount || 0
    ) >

    Number(
      approval_limit || 0
    )
  ) {

    throw new Error(
      "Approval limit exceeded"
    );

  }

  await supabase

    .from(
      "purchase_orders"
    )

    .update({

      status:
        "APPROVED",

      approved_by,

      approved_role:
        approval_role,

      approval_notes,

      approved_at:
        new Date().toISOString(),

    })

    .eq(
      "id",
      purchase_order_id
    );

  await supabase

    .from(
      "approval_logs"
    )

    .insert({

      reference_type:
        "PURCHASE_ORDER",

      reference_id:
        purchase_order_id,

      action:
        "APPROVED",

      performed_by:
        approved_by,

      role:
        approval_role,

      notes:
        approval_notes,

      created_at:
        new Date().toISOString(),

    });

  return {

    success: true,

    purchase_order_id,

  };

}
