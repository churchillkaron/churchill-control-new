"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/shared/supabase/client";

export default function ProfitLossPage() {

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPL();
  }, []);

  async function fetchPL() {

    setLoading(true);

    const { data, error } =
      await supabase
        .from("profit_and_loss_view")
        .select("*")
        .order("code", {
          ascending: true,
        });

    if (error) {

      console.error(error);
      alert(error.message);

    }

    setRows(data || []);

    setLoading(false);

  }

  // -----------------------------------
  // GROUPS
  // -----------------------------------

  const revenueRows =
    rows.filter(
      (r) =>
        r.category ===
          "Revenue" ||

        r.category ===
          "Other Income"
    );

  const cogsRows =
    rows.filter(
      (r) =>
        r.category ===
        "COGS"
    );

  const expenseRows =
    rows.filter(
      (r) =>
        r.category ===
          "Operating Expense" ||

        r.category ===
          "Other Expense"
    );

  // -----------------------------------
  // TOTALS
  // -----------------------------------

  const totals = useMemo(() => {

    const revenue =
      revenueRows.reduce(
        (sum, row) =>
          sum +
          Number(
            row.balance || 0
          ),
        0
      );

    const cogs =
      cogsRows.reduce(
        (sum, row) =>
          sum +
          Number(
            row.balance || 0
          ),
        0
      );

    const expenses =
      expenseRows.reduce(
        (sum, row) =>
          sum +
          Number(
            row.balance || 0
          ),
        0
      );

    const grossProfit =
      revenue - cogs;

    const netProfit =
      grossProfit - expenses;

    return {

      revenue,

      cogs,

      expenses,

      grossProfit,

      netProfit,

    };

  }, [
    revenueRows,
    cogsRows,
    expenseRows,
  ]);

  // -----------------------------------
  // UI
  // -----------------------------------

  if (loading) {

    return (
      <div className="min-h-screen bg-black text-white p-10">
        Loading profit & loss...
      </div>
    );

  }

  return (

    <div className="min-h-screen bg-black text-white p-10">

      {/* HEADER */}
      <div className="mb-10">

        <h1 className="text-4xl font-bold">
          Profit & Loss
        </h1>

        <div className="text-white/50 mt-2">
          Enterprise income statement
        </div>

      </div>

      {/* SUMMARY */}
      <div className="grid grid-cols-5 gap-4 mb-10">

        <SummaryCard
          title="Revenue"
          value={totals.revenue}
        />

        <SummaryCard
          title="COGS"
          value={totals.cogs}
        />

        <SummaryCard
          title="Gross Profit"
          value={totals.grossProfit}
        />

        <SummaryCard
          title="Expenses"
          value={totals.expenses}
        />

        <SummaryCard
          title="Net Profit"
          value={totals.netProfit}
          highlight
        />

      </div>

      {/* REVENUE */}
      <Section
        title="Revenue"
        rows={revenueRows}
      />

      {/* COGS */}
      <Section
        title="Cost of Goods Sold"
        rows={cogsRows}
      />

      {/* EXPENSES */}
      <Section
        title="Operating Expenses"
        rows={expenseRows}
      />

    </div>

  );

}

// -----------------------------------
// SECTION
// -----------------------------------

function Section({
  title,
  rows,
}) {

  return (

    <div className="mb-12">

      <h2 className="text-2xl mb-4">
        {title}
      </h2>

      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">

        {rows.length === 0 && (

          <div className="p-6 text-white/40">
            No accounts found
          </div>

        )}

        {rows.map((row) => (

          <div
            key={row.code}
            className="grid grid-cols-4 gap-4 px-6 py-4 border-b border-white/10"
          >

            <div>
              {row.code}
            </div>

            <div>
              {row.name}
            </div>

            <div>
              {row.category}
            </div>

            <div className="text-right">

              ฿{Number(
                row.balance || 0
              ).toLocaleString()}

            </div>

          </div>

        ))}

      </div>

    </div>

  );

}

// -----------------------------------
// SUMMARY CARD
// -----------------------------------

function SummaryCard({
  title,
  value,
  highlight = false,
}) {

  return (

    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">

      <div className="text-white/50 text-sm">
        {title}
      </div>

      <div
        className={`text-3xl font-bold mt-2 ${
          highlight
            ? "text-green-400"
            : "text-white"
        }`}
      >

        ฿{Number(
          value || 0
        ).toLocaleString()}

      </div>

    </div>

  );

}