"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

function normalizeOrganizationId(value) {
  return Array.isArray(value) ? value[0] : value;
}

function formatNumber(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return "—";
  }

  return numericValue.toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
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

export default function PreparedInventoryPage() {
  const params = useParams();
  const organizationId = normalizeOrganizationId(params?.organizationId);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadPreparedInventory = useCallback(async () => {
    if (!organizationId) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/production/prepared?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: "no-store" },
      );
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Unable to load prepared inventory");
      }

      setItems(result.items || []);
    } catch (loadError) {
      setItems([]);
      setError(loadError.message || "Unable to load prepared inventory");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadPreparedInventory();
  }, [loadPreparedInventory]);

  return (
    <div className="min-h-screen bg-black p-10 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="mb-3 text-5xl font-bold sm:text-6xl">
              Prepared Items
            </h1>
            <div className="text-zinc-500">
              Organization-scoped prepared production inventory
            </div>
          </div>

          <button
            type="button"
            onClick={loadPreparedInventory}
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

        {!loading && !error && items.length === 0 && (
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-zinc-500">
            No prepared inventory has been recorded for this organization yet.
          </div>
        )}

        <div className="space-y-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-3xl border border-zinc-800 p-6"
            >
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="text-2xl font-bold">
                    {item.item_name || "Unnamed prepared item"}
                  </div>
                  <div className="mt-2 break-all text-sm text-zinc-500">
                    Batch: {item.batch_id || "—"}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6 sm:grid-cols-4 lg:min-w-[680px]">
                  <Metric
                    label="Quantity"
                    value={`${formatNumber(item.quantity)}${item.unit ? ` ${item.unit}` : ""}`}
                  />
                  <Metric label="Produced" value={formatDate(item.production_date)} />
                  <Metric label="Expires" value={formatDate(item.expiry_date)} />
                  <Metric
                    label="Spoilage"
                    value={formatNumber(item.spoilage_quantity)}
                  />
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
      <div className="mt-2 text-lg">{value}</div>
    </div>
  );
}
