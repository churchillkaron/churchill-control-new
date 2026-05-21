"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/shared/supabase/client";

export default function DepreciationPage() {

  const [assets, setAssets] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {

    setLoading(true);

    const { data: assetData } =
      await supabase
        .from("fixed_assets")
        .select("*")
        .eq("status", "active")
        .order("asset_name");

    const { data: entryData } =
      await supabase
        .from("depreciation_entries")
        .select(`
          *,
          fixed_assets (
            asset_name,
            asset_code
          )
        `)
        .order("depreciation_date", {
          ascending: false,
        });

    setAssets(assetData || []);
    setEntries(entryData || []);

    setLoading(false);

  }

  async function runDepreciation(
    asset
  ) {

    const response =
      await fetch(
        "/api/finance/depreciation/run",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            assetId: asset.id,
          }),
        }
      );

    const result =
      await response.json();

    if (!response.ok) {

      alert(
        result.error ||
        "Depreciation failed"
      );

      return;

    }

    alert(
      "Depreciation posted"
    );

    await fetchData();

  }

  const totals = useMemo(() => {

    const totalAssets =
      assets.reduce(
        (sum, asset) =>
          sum +
          Number(
            asset.current_book_value || 0
          ),
        0
      );

    const totalDepreciation =
      entries.reduce(
        (sum, entry) =>
          sum +
          Number(
            entry.depreciation_amount || 0
          ),
        0
      );

    return {

      totalAssets,

      totalDepreciation,

    };

  }, [
    assets,
    entries,
  ]);

  if (loading) {

    return (
      <div className="min-h-screen bg-black text-white p-10">
        Loading depreciation...
      </div>
    );

  }

  return (

    <div className="min-h-screen bg-black text-white p-10">

      {/* HEADER */}
      <div className="mb-10">

        <h1 className="text-4xl font-bold">
          Depreciation Engine
        </h1>

        <div className="text-white/50 mt-2">
          Enterprise asset depreciation management
        </div>

      </div>

      {/* SUMMARY */}
      <div className="grid grid-cols-2 gap-4 mb-10">

        <SummaryCard
          title="Asset Book Value"
          value={totals.totalAssets}
        />

        <SummaryCard
          title="Total Depreciation"
          value={totals.totalDepreciation}
          highlight
        />

      </div>

      {/* ASSETS */}
      <div className="mb-12">

        <h2 className="text-2xl mb-6">
          Active Assets
        </h2>

        {assets.length === 0 && (

          <Empty text="No active assets" />

        )}

        {assets.map((asset) => {

          const depreciableAmount =
            Number(asset.purchase_cost || 0) -
            Number(asset.salvage_value || 0);

          const usefulLifeMonths =
            Number(asset.useful_life_years || 5) * 12;

          const monthlyDepreciation =
            usefulLifeMonths > 0
              ? depreciableAmount /
                usefulLifeMonths
              : 0;

          return (

            <div
              key={asset.id}
              className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-4"
            >

              <div className="flex justify-between items-start">

                <div>

                  <div className="text-2xl font-semibold">
                    {asset.asset_name}
                  </div>

                  <div className="text-white/40 mt-1">
                    {asset.asset_code}
                  </div>

                  <div className="mt-4 space-y-1 text-white/70">

                    <div>
                      Purchase Cost:
                      {" "}
                      ฿{Number(
                        asset.purchase_cost || 0
                      ).toLocaleString()}
                    </div>

                    <div>
                      Book Value:
                      {" "}
                      ฿{Number(
                        asset.current_book_value || 0
                      ).toLocaleString()}
                    </div>

                    <div>
                      Monthly Depreciation:
                      {" "}
                      ฿{monthlyDepreciation.toLocaleString()}
                    </div>

                    <div>
                      Useful Life:
                      {" "}
                      {asset.useful_life_years} years
                    </div>

                  </div>

                </div>

                <button
                  onClick={() =>
                    runDepreciation(asset)
                  }
                  className="bg-green-600 hover:bg-green-700 px-6 py-3 rounded-xl"
                >

                  Run Depreciation

                </button>

              </div>

            </div>

          );

        })}

      </div>

      {/* ENTRIES */}
      <div>

        <h2 className="text-2xl mb-6">
          Depreciation Entries
        </h2>

        {entries.length === 0 && (

          <Empty text="No depreciation entries" />

        )}

        {entries.map((entry) => (

          <div
            key={entry.id}
            className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-4"
          >

            <div className="flex justify-between items-start">

              <div>

                <div className="text-2xl font-semibold">

                  {entry.fixed_assets?.asset_name}

                </div>

                <div className="text-white/40 mt-1">

                  {entry.fixed_assets?.asset_code}

                </div>

                <div className="mt-4 space-y-1 text-white/70">

                  <div>
                    Depreciation:
                    {" "}
                    ฿{Number(
                      entry.depreciation_amount || 0
                    ).toLocaleString()}
                  </div>

                  <div>
                    Accumulated:
                    {" "}
                    ฿{Number(
                      entry.accumulated_depreciation || 0
                    ).toLocaleString()}
                  </div>

                  <div>
                    Remaining Book Value:
                    {" "}
                    ฿{Number(
                      entry.remaining_book_value || 0
                    ).toLocaleString()}
                  </div>

                  <div>
                    Date:
                    {" "}
                    {entry.depreciation_date}
                  </div>

                </div>

              </div>

            </div>

          </div>

        ))}

      </div>

    </div>

  );

}

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

function Empty({
  text,
}) {

  return (

    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-white/40">
      {text}
    </div>

  );

}