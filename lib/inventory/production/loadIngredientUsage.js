import { supabase } from "@/lib/shared/supabase/client";

export async function loadIngredientUsage(
  organization_id
) {

  if (!organization_id) {
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
      "organization_id",
      organization_id
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
