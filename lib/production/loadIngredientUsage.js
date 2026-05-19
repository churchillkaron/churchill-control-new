import { supabase } from "@/lib/shared/supabase/client";

export async function loadIngredientUsage(
  tenant_id
) {

  if (!tenant_id) {
    return [];
  }

  const {
    data,
    error,
  } = await supabase
    .from(
      "inventory_movements"
    )
    .select(`
      *,
      ingredients (
        id,
        name
      )
    `)
    .eq(
      "tenant_id",
      tenant_id
    )
    .eq(
      "movement_type",
      "ORDER_USAGE"
    )
    .order(
      "created_at",
      {
        ascending: false,
      }
    );

  if (
    error ||
    !data
  ) {

    console.error(
      error
    );

    return [];
  }

  return data;
}
