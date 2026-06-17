import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function POST(req) {
  try {

    const { tenantId, items } = await req.json();

    if (!Array.isArray(items)) {
      throw new Error("Invalid items payload");
    }

    const results = [];

    for (const item of items) {

      const { data: stock, error: stockError } = await supabaseAdmin
        .from("inventory")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("ingredient_id", item.ingredient_id)
        .single();

      if (stockError) throw stockError;

      const currentQty = Number(stock?.quantity || 0);
      const newQty = currentQty - Number(item.quantity || 0);

      const { error: updateError } = await supabaseAdmin
        .from("inventory")
        .update({ quantity: newQty })
        .eq("id", stock.id);

      if (updateError) throw updateError;

      const { error: logError } = await supabaseAdmin
        .from("inventory_movements")
        .insert({
          tenant_id: tenantId,
          ingredient_id: item.ingredient_id,
          change: -Number(item.quantity || 0),
          type: "CONSUMPTION"
        });

      if (logError) throw logError;

      results.push({
        ingredient_id: item.ingredient_id,
        before: currentQty,
        after: newQty
      });

    }

    return NextResponse.json({
      success: true,
      data: results
    });

  } catch (err) {

    return NextResponse.json({
      success: false,
      error: err.message
    }, { status: 500 });

  }
}
