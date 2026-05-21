import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function createPurchaseRequest({
  tenant_id,
  requested_by,
  items = [],
}) {
  try {
    const { data: request, error } = await supabaseAdmin
      .from("purchase_requests")
      .insert([
        {
          tenant_id,
          requested_by,
          status: "pending",
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) {
      throw error;
    }

    const mappedItems = items.map((item) => ({
      purchase_request_id: request.id,
      ingredient_id: item.ingredient_id,
      quantity: item.quantity,
      created_at: new Date().toISOString(),
    }));

    if (mappedItems.length > 0) {
      await supabaseAdmin
        .from("purchase_request_items")
        .insert(mappedItems);
    }

    return {
      success: true,
      request,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}
