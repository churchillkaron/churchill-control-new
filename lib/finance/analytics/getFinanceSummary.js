import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

function getTodayRange() {

  const now = new Date();

  const start = new Date(now);

  start.setHours(
    0,
    0,
    0,
    0
  );

  const end = new Date(now);

  end.setHours(
    23,
    59,
    59,
    999
  );

  return {

    start:
      start.toISOString(),

    end:
      end.toISOString(),

  };

}

export async function getFinanceSummary({
  organizationId,
  organizationId,
}) {

  const { start, end } =
    getTodayRange();

 

  // FINANCE

  let financeQuery =
    supabaseAdmin

      .from(
        "order_profit_view"
      )

      .select(
        "revenue, cost, profit, created_at"
      );

  financeQuery =

    organizationId

      ? financeQuery.eq(
          "organization_id",
          organizationId
        )

      : financeQuery.eq(
          "organization_id",
          organizationId
        );

  const {

    data: financeRows,

    error: financeError,

  } = await financeQuery

    .gte(
      "created_at",
      start
    )

    .lte(
      "created_at",
      end
    );

  if (financeError) {
    throw financeError;
  }

  const rows =
    financeRows || [];

  const revenue =
    rows.reduce(

      (sum, row) =>

        sum +
        Number(
          row.revenue || 0
        ),

      0

    );

  const cogs =
    rows.reduce(

      (sum, row) =>

        sum +
        Number(
          row.cost || 0
        ),

      0

    );

  const profit =
    rows.reduce(

      (sum, row) =>

        sum +
        Number(
          row.profit || 0
        ),

      0

    );

  const costPercent =

    revenue > 0

      ? Math.round(
          (cogs / revenue) * 100
        )

      : 0;

  // LOW STOCK

  let ingredientQuery =
    supabaseAdmin

      .from("ingredients")

      .select(
        "id, name, quantity"
      );

  ingredientQuery =

    organizationId

      ? ingredientQuery.eq(
          "organization_id",
          organizationId
        )

      : ingredientQuery.eq(
          "organization_id",
          organizationId
        );

  const {

    data: ingredients,

    error: ingredientError,

  } = await ingredientQuery;

  if (ingredientError) {
    throw ingredientError;
  }

  const lowStock =

    (ingredients || [])

      .filter(

        (item) =>

          Number(
            item.quantity || 0
          ) <= 5

      )

      .sort(

        (a, b) =>

          Number(
            a.quantity || 0
          ) -

          Number(
            b.quantity || 0
          )

      )

      .map((item) => ({

        item:
          item.name ||
          "Unknown item",

        qty:
          Number(
            item.quantity || 0
          ),

        level:

          Number(
            item.quantity || 0
          ) <= 0

            ? "CRITICAL"

            : "LOW",

      }));

  // ALERTS

  const alerts = [];

  if (profit < 0) {

    alerts.push({

      type:
        "critical",

      message:
        "Profit is negative today",

    });

  }

  if (costPercent >= 45) {

    alerts.push({

      type:
        "warning",

      message:
        `Cost percentage is high: ${costPercent}%`,

    });

  }

  if (lowStock.length > 0) {

    alerts.push({

      type:
        "warning",

      message:
        `${lowStock.length} low stock item(s) need attention`,

    });

  }

  return {

    revenue,

    cogs,

    cost: cogs,

    profit,

    costPercent,

    lowStock,

    alerts,

  };

}