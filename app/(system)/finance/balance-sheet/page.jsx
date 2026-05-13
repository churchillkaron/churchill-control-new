"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/shared/supabase/client";

export default function BalanceSheetPage() {

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBalanceSheet();
  }, []);

  async function fetchBalanceSheet() {

    setLoading(true);

    const { data, error } =
      await supabase
        .from("balance_sheet_view")
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

  const assetRows =
    rows.filter(
      (r) =>
        r.category ===
        "Assets"
    );

  const liabilityRows =
    rows.filter(
      (r) =>
        r.category ===
        "Liabilities"
    );

  const equityRows =
    rows.filter(
      (r) =>
        r.category ===
        "Equity"
    );

  // -----------------------------------
  // TOTALS
  // -----------------------------------

  const totals = useMemo(() => {

    const assets =
      assetRows.reduce(
        (sum, row) =>
          sum +
          Number(
            row.balance || 0
          ),
        0
      );

    const liabilities =
      liabilityRows.reduce(
        (sum, row) =>
          sum +
          Number(
            row.balance || 0
          ),
        0
      );

    const equity =
      equityRows.reduce(
        (sum, row) =>
          sum +
          Number(
            row.balance || 0
          ),
        0
      );

    const liabilitiesAndEquity =
      liabilities + equity;

    const difference =
      assets -
      liabilitiesAndEquity;

    return {

      assets,

      liabilities,

      equity,

      liabilitiesAndEquity,

      difference,

    };

  }, [
    assetRows,
    liabilityRows,
    equityRows,
  ]);

  // -----------------------------------
  // UI
  // -----------------------------------

  if (loading) {

    return (
      <div className="min-h-screen bg-black text-white p-10">
        Loading balance sheet...
      </div>
    );

  }

  return (

    <div className="min-h-screen bg-black text-white p-10">

      {/* HEADER */}
      <div className="mb-10">

        <h1 className="text-4xl font-bold">
          Balance Sheet
        </h1>

        <div className="text-white/50 mt-2">
          Enterprise financial position statement
        </div>

      </div>

      {/* SUMMARY */}
      <div className="grid grid-cols-5 gap-4 mb-10">

        <SummaryCard
          title="Assets"
          value={totals.assets}
        />

        <SummaryCard
          title="Liabilities"
          value={totals.liabilities}
        />

        <SummaryCard
          title="Equity"
          value={totals.equity}
        />

        <SummaryCard
          title="L + E"
          value={totals.liabilitiesAndEquity}
        />

        <SummaryCard
          title="Difference"
          value={totals.difference}
          danger={
            Math.abs(
              totals.difference
            ) > 0.01
          }
        />

      </div>

      {/* BALANCE VALIDATION */}
      {Math.abs(
        totals.difference
      ) > 0.01 ? (

        <div className="mb-8 bg-red-600/20 border border-red-500/30 text-red-300 rounded-2xl p-6">

          Balance sheet out of balance.

        </div>

      ) : (

        <div className="mb-8 bg-green-600/20 border border-green-500/30 text-green-300 rounded-2xl p-6">

          Balance sheet balanced.

        </div>

      )}

      {/* ASSETS */}
      <Section
        title="Assets"
        rows={assetRows}
      />

      {/* LIABILITIES */}
      <Section
        title="Liabilities"
        rows={liabilityRows}
      />

      {/* EQUITY */}
      <Section
        title="Equity"
        rows={equityRows}
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
  danger = false,
}) {

  return (

    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">

      <div className="text-white/50 text-sm">
        {title}
      </div>

      <div
        className={`text-3xl font-bold mt-2 ${
          danger
            ? "text-red-400"
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