import { supabase } from "@/lib/supabase";

export async function deductDishStock({
  dish_id,
  quantity,
  tenant_id,
}) {
  const { data, error } = await supabase
    .from("dish_stock")
    .select("quantity")
    .eq("dish_id", dish_id)
    .eq("tenant_id", tenant_id)
    .single();

  if (error) throw error;

  const newQty = data.quantity - quantity;

  const { error: updateError } = await supabase
    .from("dish_stock")
    .update({ quantity: newQty })
    .eq("dish_id", dish_id)
    .eq("tenant_id", tenant_id);

  if (updateError) throw updateError;

  return true;
}