import { supabase } from "@/lib/supabaseClient";

export async function saveDayToDatabase({
  covers,
  drinkRevenue,
  foodRevenue,
  totalRevenue,
  profit,
  salesItems,
}) {
  console.log("START SAVE");

  const { data: batch, error: batchError } = await supabase
    .from("daily_sales_batches")
    .insert([
      {
        covers,
        total_revenue: totalRevenue,
        total_profit: profit,
        drink_revenue: drinkRevenue,
        food_revenue: foodRevenue,
      },
    ])
    .select()
    .single();

  console.log("BATCH RESULT:", batch, batchError);

  if (batchError) {
    throw batchError;
  }

  const itemsToInsert = salesItems.map((item) => ({
    batch_id: batch.id,
    dish_id: item.dish_id,
    quantity: item.quantity,
  }));

  const { data: items, error: itemsError } = await supabase
    .from("daily_sales_items")
    .insert(itemsToInsert);

  console.log("ITEMS RESULT:", items, itemsError);

  if (itemsError) {
    throw itemsError;
  }

  return batch;
}
