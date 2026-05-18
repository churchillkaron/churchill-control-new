import { supabase }
from "@/lib/shared/supabase/client";

export async function loadMenu(
  tenantId
) {

  const {
    data,
    error,
  } = await supabase

    .from("dishes")

    .select("*")

    .eq(
      "tenant_id",
      tenantId
    )

    .eq(
      "active",
      true
    )

    .order(
      "name",
      {
        ascending: true,
      }
    );

  if (error) {

    console.error(error);

    return [];
  }

  return (
    data || []
  ).map((dish) => ({

    ...dish,

    remaining:
      dish.remaining ??
      dish.stock ??
      999,

  }));
}
