import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function POST(req) {
  try {
    const {
      itemIds,
      billGroup
    } = await req.json();

    console.log(
      "UPDATE_BILL_GROUP",
      {
        itemIds,
        billGroup
      }
    );

    if (!Array.isArray(itemIds) || !itemIds.length) {
      return Response.json(
        { success: false, error: "Missing itemIds" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("order_items")
      .update({
        bill_group: billGroup
      })
      .in("id", itemIds)
      .select();

    console.log(
      "UPDATE_BILL_GROUP_RESULT",
      {
        updated: data?.length || 0,
        data,
        error
      }
    );

    if (error) throw error;

    return Response.json({
      success: true
    });

  } catch (err) {
    console.error(
      "UPDATE_BILL_GROUP_ERROR",
      err
    );

    return Response.json(
      {
        success: false,
        error: err.message
      },
      { status: 500 }
    );
  }
}
