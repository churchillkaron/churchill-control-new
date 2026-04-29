// 🔹 1. GET RECIPE
const { data: recipe, error: recipeError } = await supabase
  .from("recipes")
  .select("id")
  .eq("dish_id", dish_id)
  .eq("tenant_id", tenant_id)
  .single();

if (recipeError || !recipe) {
  throw new Error("No recipe found");
}

// 🔹 2. GET RECIPE ITEMS
const { data: recipeItems, error: itemsError } = await supabase
  .from("recipe_items")
  .select("*")
  .eq("recipe_id", recipe.id)
  .eq("tenant_id", tenant_id);

if (itemsError) throw itemsError;

if (!recipeItems || recipeItems.length === 0) {
  throw new Error("No recipe items found");
}