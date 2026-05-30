import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import { createJournalEntry } from "@/lib/finance/accounting/createJournalEntry";

async function findAccount({
  tenantId,
  codes = [],
  categories = [],
  nameIncludes = [],
}) {

  let query =
    supabaseAdmin
      .from("chart_of_accounts")
      .select("*");

  if (tenantId) {
    query = query.eq(
      "tenant_id",
      tenantId
    );
  }

  const {
    data,
    error,
  } = await query;

  if (error) {
    throw error;
  }

  const accounts =
    data || [];

  return accounts.find((account) =>
    codes.includes(account.code)
  ) || accounts.find((account) =>
    categories.includes(account.category)
  ) || accounts.find((account) =>
    nameIncludes.some((word) =>
      String(account.name || "")
        .toLowerCase()
        .includes(word)
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
}) {

  try {

    if (
      !tenantId ||
      !dishId ||
      !quantity
    ) {

      return {
        success: false,
        error: "MISSING_REQUIRED_FIELDS",
      };

    }

    const {
      data: latestBatch,
      error: batchError,
    } = await supabaseAdmin
      .from("production_batches")
      .select("*")
      .eq(
        "tenant_id",
        tenantId
      )
      .eq(
        "dish_id",
        dishId
      )
      .order(
        "produced_at",
        {
          ascending: false,
        }
      )
      .limit(1)
      .single();

    if (batchError) {
      throw batchError;
    }

    const unitCost =
      Number(
        latestBatch?.cost_per_unit || 0
      );

    const totalCost =
      unitCost *
      Number(quantity);

    const revenue =
      Number(
        revenueAmount || 0
      );

    const profit =
      revenue -
      totalCost;

    const {
      data: cogsEntry,
      error: insertError,
    } = await supabaseAdmin
      .from("cogs_entries")
      .insert({
        tenant_id:
          tenantId,

        order_id:
          orderId || null,

        dish_id:
          dishId,

        quantity:
          Number(quantity),

        cost_amount:
          totalCost,

        revenue_amount:
          revenue,

        profit_amount:
          profit,
      })
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    if (totalCost > 0) {

      const cogsAccount =
        await findAccount({
          tenantId,
          codes: [
            "5000",
            "5100",
          ],
          categories: [
            "COGS",
          ],
          nameIncludes: [
            "cost of goods",
            "cogs",
          ],
        });

      const inventoryAccount =
        await findAccount({
          tenantId,
          codes: [
            "1200",
            "1300",
          ],
          categories: [
            "Assets",
          ],
          nameIncludes: [
            "inventory",
            "stock",
          ],
        });

      if (
        !cogsAccount ||
        !inventoryAccount
      ) {

        throw new Error(
          "COGS or Inventory account missing in chart_of_accounts"
        );

      }

      console.log(
        "STARTING JOURNAL ENTRY",
        {
          tenantId,
          totalCost,
          cogsAccount,
          inventoryAccount,
        }
      )

      await createJournalEntry({
        tenantId,

        entryDate:
          new Date()
            .toISOString()
            .slice(0, 10),

        description:
          `COGS recognition for order ${orderId || "manual"}`,

        sourceType:
          "cogs",

        sourceId:
          cogsEntry.id,

        createdBy,

        lines: [

          {
            account_id:
              cogsAccount.id,

            debit:
              totalCost,

            credit:
              0,

            description:
              "Cost of goods sold",
          },

          {
            account_id:
              inventoryAccount.id,

            debit:
              0,

            credit:
              totalCost,

            description:
              "Inventory reduction",
          },

        ],
      });

    }

    console.log(
      "COGS JOURNAL SUCCESS"
    )

    return {
      success: true,
      cogs_entry_id: cogsEntry.id,
      unit_cost: unitCost,
      total_cost: totalCost,
      revenue_amount: revenue,
      profit_amount: profit,
      accounting_posted: totalCost > 0,
    };

  } catch (error) {

    console.error(
      "CREATE COGS ENTRY ERROR:",
      error
    );

    console.error(
      "COGS STACK:",
      error?.stack
    )

    return {
      success: false,
      error: error.message,
    };

  }

}
