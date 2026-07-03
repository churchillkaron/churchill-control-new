"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useFinanceRuntime } from "@/lib/finance/runtime/useFinanceRuntime";

export default function FixedAssetsPage() {
  const params = useParams();
  const organizationId = params?.organizationId;

  const {
    financeGet,
    loading: runtimeLoading,
  } = useFinanceRuntime();

  const [assets, setAssets] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      setLoading(true);
      setError("");

      const json =
        await financeGet(
          "/api/finance/fixed-assets/list"
        );

      if (!json.success) {
        throw new Error(json.error || "Failed to load fixed assets");
      }

      setAssets(json.assets || []);
    } catch (err) {
      setError(err.message);
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {

    if (runtimeLoading) {
      return;
    }
    if (organizationId) {
      load();
    }
  }, [organizationId, runtimeLoading]);

  const totals = useMemo(() => {
    return assets.reduce(
      (acc, asset) => {
        acc.cost += Number(asset.purchase_cost || 0);
        acc.depreciation += Number(asset.accumulated_depreciation || 0);
        acc.book += Number(asset.calculated_book_value || 0);
        return acc;
      },
      { cost: 0, depreciation: 0, book: 0 }
    );
  }, [assets]);

  return (
    <main className="min-h-screen p-8 text-white">
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-white/50">
              Finance / Compliance
            </p>

            <h1 className="mt-3 text-4xl font-light">
              Fixed Assets
            </h1>

            <p className="mt-2 text-white/60">
              Manage assets, cost, accumulated depreciation and book value.
            </p>
          </div>

          <button
            onClick={load}
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm"
          >
            Refresh
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card title="Assets" value={assets.length} />
          <Card title="Cost" value={totals.cost.toLocaleString()} />
          <Card title="Depreciation" value={totals.depreciation.toLocaleString()} />
          <Card title="Book Value" value={totals.book.toLocaleString()} />
        </div>

        {error && (
          <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-5 text-sm text-red-100">
            {error}
          </div>
        )}

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
          <table className="w-full">
            <thead className="border-b border-white/10">
              <tr className="text-left text-sm text-white/60">
                <th className="p-4">Asset</th>
                <th className="p-4">Category</th>
                <th className="p-4">Purchase Date</th>
                <th className="p-4 text-right">Cost</th>
                <th className="p-4 text-right">Depreciation</th>
                <th className="p-4 text-right">Book Value</th>
              </tr>
            </thead>

            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-white/60">
                    Loading assets...
                  </td>
                </tr>
              )}

              {!loading && assets.length === 0 && !error && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-white/60">
                    No fixed assets found.
                  </td>
                </tr>
              )}

              {assets.map((asset) => (
                <tr key={asset.id} className="border-t border-white/5">
                  <td className="p-4">{asset.name || asset.asset_name || "-"}</td>
                  <td className="p-4">{asset.category || asset.asset_category || "-"}</td>
                  <td className="p-4">{asset.purchase_date || "-"}</td>
                  <td className="p-4 text-right">{Number(asset.purchase_cost || 0).toLocaleString()}</td>
                  <td className="p-4 text-right">{Number(asset.accumulated_depreciation || 0).toLocaleString()}</td>
                  <td className="p-4 text-right">{Number(asset.calculated_book_value || 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

function Card({ title, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
      <div className="text-sm text-white/50">{title}</div>
      <div className="mt-2 text-3xl font-light">{value}</div>
    </div>
  );
}
