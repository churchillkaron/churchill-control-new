import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function POST(req) {
  try {

    const { organizationId, batchId } = await req.json();

    // 1. Get production batch
    const { data: batch, error: batchError } = await supabaseAdmin
      .from("production_batches")
      .select("*")
      .eq("id", batchId)
      .single();

    if (batchError) throw batchError;

    // 2. Get inventory usage for batch
    const { data: usage, error: usageError } = await supabaseAdmin
      .from("inventory_movements")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("reference_id", batchId)
      .eq("type", "CONSUMPTION");

    if (usageError) throw usageError;

    // 3. Calculate total cost
    let totalCost = 0;

    for (const item of usage || []) {
      totalCost += Math.abs(Number(item.cost || 0));
    }

    // 4. Save COGS entry
    const { data: cogs, error: cogsError } = await supabaseAdmin
      .from("cogs_entries")
      .insert({
        organization_id: organizationId,
        batch_id: batchId,
        production_id: batch?.production_id,
        total_cost: totalCost,
        revenue: batch?.revenue || 0,
        profit: (batch?.revenue || 0) - totalCost
      })
      .select()
      .single();

    if (cogsError) throw cogsError;

    return NextResponse.json({
      success: true,
      data: cogs
    });

  } catch (err) {

    return NextResponse.json({
      success: false,
      error: err.message
    }, { status: 500 });

  }
}
