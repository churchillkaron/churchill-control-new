"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

function formatNumber(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return "—";
  }

  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  }).format(numericValue);
}

function formatDate(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString();
}

export default function ProductionBatchPage() {
  const params = useParams();
  const organizationId = params.organizationId;
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadBatches = useCallback(async () => {
    if (!organizationId) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/production/batches?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: "no-store" },
      );
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Unable to load production batches");
      }

      setBatches(data.batches || []);
    } catch (loadError) {
      setBatches([]);
      setError(loadError.message || "Unable to load production batches");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  return (
    <div className="min-h-screen bg-black p-10 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10 flex items-start justify-between gap-6">
          <div>
            <h1 className="mb-3 text-6xl font-bold">Production Batches</h1>
            <div className="text-zinc-500">Organization-scoped production history</div>
          </div>

          <button
            type="button"
            onClick={loadBatches}
            disabled={loading || !organizationId}
            className="rounded-2xl border border-white/10 px-5 py-3 text-sm text-white/70 disabled:opacity-40"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {error && (
          <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-red-300">
            {error}
          </div>
        )}

        {!loading && !error && batches.length === 0 && (
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-zinc-500">
            No production batches for this organization yet.
          </div>
        )}

        <div className="space-y-4">
          {batches.map((batch) => (
            <div key={batch.id} className="rounded-3xl border border-zinc-800 p-6">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="text-2xl font-bold">
                    {batch.dish_name || "Unknown dish"}
                  </div>
                  <div className="mt-2 text-sm text-zinc-500">
                    {batch.dish_category || "Uncategorized"} · {formatDate(batch.produced_at)}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6 sm:grid-cols-4 lg:min-w-[620px]">
                  <Metric label="Produced" value={formatNumber(batch.quantity)} />
                  <Metric label="Remaining" value={formatNumber(batch.remaining_quantity)} />
                  <Metric label="Unit Cost" value={formatNumber(batch.cost_per_unit)} />
                  <Metric label="Total Cost" value={formatNumber(batch.total_cost)} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div>
      <div className="text-sm text-zinc-500">{label}</div>
      <div className="mt-2 text-xl">{value}</div>
    </div>
  );
}
