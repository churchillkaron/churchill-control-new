import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function updateKitchenItemStatus({
  item_id,
  status,
}) {

  try {

    const updateData = {

      status,
    };

    if (
      status === "FIRED"
    ) {

      updateData.fire_time =
        new Date().toISOString();
    }

    if (
      status === "READY"
    ) {

      updateData.ready_time =
        new Date().toISOString();
    }

    const {
      data,
      error,
    } = await supabaseAdmin
      .from(
        "kitchen_ticket_items"
      )
      .update(
        updateData
      )
      .eq(
        "id",
        item_id
      )
      .select()
      .single();

    if (error) {
      throw error;
    }

    return {

      success: true,

      item:
        data,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
