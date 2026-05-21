import { createServerSupabase } from "@/lib/shared/supabase/server";
export const dynamic = "force-dynamic";




export async function POST(req) {
  try {
    const supabase = createServerSupabase()
    const { dish_id } = await req.json()

    if (!dish_id) {
      return Response.json([], { status: 200 })
    }

    const { data, error } = await supabase
      .from('recipe_items')
      .select(`
        ingredient_id,
        quantity,
        ingredients (name, cost)
      `)
      .eq('dish_id', dish_id)

    if (error) {
      console.error("RECIPE ERROR:", error)
      return Response.json([], { status: 200 }) // ✅ NEVER return {}
    }

    const formatted = (data || []).map(i => ({
      ingredient_id: i.ingredient_id,
      quantity: Number(i.quantity || 0),
      name: i.ingredients?.name || 'Unknown',
      cost: Number(i.ingredients?.cost || 0)
    }))

    return Response.json(formatted)

  } catch (err) {
    console.error("RECIPE CRASH:", err)

    return Response.json([], { status: 200 }) // ✅ ALWAYS SAFE
  }
}