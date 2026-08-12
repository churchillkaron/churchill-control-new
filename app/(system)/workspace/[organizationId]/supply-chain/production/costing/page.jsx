"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import PageWrapper from "@/components/PageWrapper";

function normalizeOrganizationId(value) {
  return Array.isArray(value) ? value[0] : value;
}

function marginPercent(price, cost) {
  const sellingPrice = Number(price || 0);
  const productionCost = Number(cost || 0);

  if (sellingPrice <= 0) {
    return 0;
  }

  return ((sellingPrice - productionCost) / sellingPrice) * 100;
}

export default function ProductionCostingPage() {
  const params = useParams();
  const organizationId = normalizeOrganizationId(params?.organizationId);
  const [dishes, setDishes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    if (!organizationId) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/production/recipes?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: "no-store" },
      );
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Unable to load production costing");
      }

      setDishes(result.dishes || []);
    } catch (loadError) {
      setDishes([]);
      setError(loadError.message || "Unable to load production costing");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <PageWrapper
      title="Production Costing"
      subtitle="Organization-scoped dish profitability and recipe cost"
    >
      <div className="p-6 text-white">
        {error && (
          <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-red-300">
            {error}
          </div>
        )}

        {loading && (
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-zinc-500">
            Loading production costing...
          </div>
        )}

        {!loading && !error && dishes.length === 0 && (
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-zinc-500">
            No dishes are configured for this organization yet.
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-3">
          {dishes.map((dish) => {
            const margin = marginPercent(dish.price, dish.cost);
            const marginClass =
              margin < 40
                ? "text-red-400"
                : margin < 60
                  ? "text-yellow-400"
                  : "text-emerald-400";

            return (
              <div
                key={dish.id}
                className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6"
              >
                <div className="mb-6 flex items-start justify-between gap-4">
                  <div>
                    <div className="text-2xl font-semibold">{dish.name}</div>
                    <div className="mt-1 text-sm text-zinc-500">
                      {dish.category || "Uncategorized"}
                    </div>
                  </div>
                  <div className={`text-lg font-semibold ${marginClass}`}>
                    {margin.toFixed(1)}%
                  </div>
                </div>

                <div className="mb-6 space-y-3">
                  <CostRow label="Selling Price" value={dish.price} />
                  <CostRow label="Production Cost" value={dish.cost} />
                  <CostRow
                    label="Gross Profit"
                    value={Number(dish.price || 0) - Number(dish.cost || 0)}
                  />
                </div>

                <div className="border-t border-zinc-800 pt-4">
                  <div className="mb-3 text-sm text-zinc-500">
                    Recipe Components
                  </div>

                  <div className="space-y-2">
                    {(dish.recipe_items || []).map((recipeItem) => (
                      <div
                        key={recipeItem.id}
                        className="flex items-center justify-between gap-4 text-sm"
                      >
                        <div className="min-w-0 truncate">
                          {recipeItem.item?.name || "Unknown inventory item"}
                        </div>
                        <div className="shrink-0 text-zinc-500">
                          {recipeItem.quantity}
                          {recipeItem.unit ? ` ${recipeItem.unit}` : ""}
                        </div>
                      </div>
                    ))}

                    {(dish.recipe_items || []).length === 0 && (
                      <div className="text-sm text-zinc-600">
                        No recipe configured.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </PageWrapper>
  );
}

function CostRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="text-zinc-500">{label}</div>
      <div className="text-xl">
        {Number(value || 0).toLocaleString(undefined, {
          maximumFractionDigits: 2,
        })}
      </div>
    </div>
  );
}
