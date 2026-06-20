import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { createJournalEntry } from "@/lib/finance/accounting/createJournalEntry";

async function findAccount({
  tenantId,
  codes = [],
  categories = [],
  nameIncludes = [],
}) {
  const { data, error } = await supabaseAdmin
    .from("chart_of_accounts")
    .select("*")
    .eq("tenant_id", tenantId);

  if (error) throw error;

  const accounts = data || [];

  return accounts.find((account) =>
    codes.includes(account.code)
  ) || accounts.find((account) =>
    categories.includes(account.category)
  ) || accounts.find((account) =>
    nameIncludes.some((word) =>
      String(account.name || "").toLowerCase().includes(word)
    )
  );
}

export async function createCogsEntry({
  tenantId,
  orderId,
  dishId,
  quantity,
  revenueAmount = 0,
  createdBy = "system",
  useBatch = false,
}) {
  try {
    if (!tenantId || !dishId || !quantity) {
      return { success: false, error: "MISSING_REQUIRED_FIELDS" };
    }

    let totalCost = 0;

    if (useBatch) {
      const { data: latestBatch, error: batchError } = await supabaseAdmin
        .from("production_batches")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("dish_id", dishId)
        .gt("remaining_quantity", 0)
        .order("produced_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (batchError && batchError.code !== "PGRST116") throw batchError;

      if (!latestBatch) {
        console.warn("NO_PRODUCTION_BATCH_FOUND", { tenantId, dishId });
      } else {
        totalCost = Number(latestBatch.cost_per_unit || 0) * Number(quantity);
        const remainingAfterSale = Math.max(0, Number(latestBatch.remaining_quantity || 0) - Number(quantity));
        await supabaseAdmin
          .from("production_batches")
          .update({ remaining_quantity: remainingAfterSale })
          .eq("id", latestBatch.id);

        console.log("FIFO_BATCH_CONSUMED", {
          batchId: latestBatch.id,
          before: latestBatch.remaining_quantity,
          sold: quantity,
          after: remainingAfterSale,
        });
      }
    } else {
      // RAW or fallback: calculate cost from recipe items
      const { data: recipeItems, error: recipeError } = await supabaseAdmin
        .from("recipe_items")
        .select(`quantity, ingredients (cost_per_base_unit)`)
        .eq("tenant_id", tenantId)
        .eq("dish_id", dishId);

      if (recipeError) throw recipeError;

      for (const recipe of recipeItems || []) {
        totalCost += Number(recipe.quantity || 0) * Number(quantity) * Number(recipe.ingredients?.cost_per_base_unit || 0);
      }

      console.log("RECIPE_COST_FALLBACK", { dishId, totalCost });
    }

    const revenue = Number(revenueAmount || 0);
    const profit = revenue - totalCost;

    const { data: cogsEntry, error: insertError } = await supabaseAdmin
      .from("cogs_entries")
      .insert({
        tenant_id: tenantId,
        order_id: orderId || null,
        dish_id: dishId,
        quantity: Number(quantity),
        cost_amount: totalCost,
        revenue_amount: revenue,
        profit_amount: profit,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    if (totalCost > 0) {
      const cogsAccount = await findAccount({
        tenantId,
        codes: ["5000","5100"],
        categories: ["COGS"],
        nameIncludes: ["cost of goods","cogs"],
      });

      const inventoryAccount = await findAccount({
        tenantId,
        categories: ["Inventory"],
      });

      // Optionally create journal entries
      if (cogsAccount && inventoryAccount) {
        await createJournalEntry({
          tenantId,
          entryDate: new Date().toISOString().slice(0, 10),
          description: `COGS recognition for order ${orderId || dishId}`,
          sourceType: "cogs",
          sourceId: orderId || dishId,
          createdBy,
          lines: [
            {
              account_id: cogsAccount.id,
              debit: totalCost,
              credit: 0,
              description: "COGS expense",
            },
            {
              account_id: inventoryAccount.id,
              debit: 0,
              credit: totalCost,
              description: "Inventory reduction",
            },
          ],
        });
      }
    }

    return { success: true, data: cogsEntry };
  } catch (err) {
    console.error("createCogsEntry failed", err);
    return { success: false, error: err.message || err };
  }
}
