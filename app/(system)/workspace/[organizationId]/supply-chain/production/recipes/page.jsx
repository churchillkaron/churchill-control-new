"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import PageWrapper from "@/components/PageWrapper";

function normalizeOrganizationId(value) {
  return Array.isArray(value) ? value[0] : value;
}

export default function RecipesPage() {
  const params = useParams();
  const organizationId = normalizeOrganizationId(params?.organizationId);
  const [dishes, setDishes] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [selectedDish, setSelectedDish] = useState("");
  const [recipeItems, setRecipeItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

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
        throw new Error(result.error || "Unable to load recipes");
      }

      setDishes(result.dishes || []);
      setInventoryItems(result.inventoryItems || []);
    } catch (loadError) {
      setDishes([]);
      setInventoryItems([]);
      setError(loadError.message || "Unable to load recipes");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const dish = dishes.find((candidate) => candidate.id === selectedDish);

    setRecipeItems(
      (dish?.recipe_items || []).map((recipeItem) => ({
        item_id: recipeItem.item_id || "",
        quantity: Number(recipeItem.quantity || 1),
        unit: recipeItem.unit || "",
      })),
    );
  }, [dishes, selectedDish]);

  const selectedDishData = useMemo(
    () => dishes.find((dish) => dish.id === selectedDish) || null,
    [dishes, selectedDish],
  );

  function addInventoryItemRow() {
    setRecipeItems((current) => [
      ...current,
      {
        item_id: "",
        quantity: 1,
        unit: "",
      },
    ]);
  }

  function updateItem(index, field, value) {
    setRecipeItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              [field]: value,
            }
          : item,
      ),
    );
  }

  function removeItem(index) {
    setRecipeItems((current) =>
      current.filter((_, itemIndex) => itemIndex !== index),
    );
  }

  async function saveRecipe() {
    if (!selectedDish) {
      setError("Select a dish before saving a recipe");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/production/recipes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organizationId,
          dish_id: selectedDish,
          items: recipeItems,
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Unable to save recipe");
      }

      setMessage(
        `Recipe saved · ${result.item_count} item${result.item_count === 1 ? "" : "s"} · cost ${result.total_cost}`,
      );
      await loadData();
    } catch (saveError) {
      setError(saveError.message || "Unable to save recipe");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageWrapper
      title="Production Recipes"
      subtitle="Organization-scoped recipe costing and inventory mapping"
    >
      <div className="p-6 text-white">
        {error && (
          <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-red-300">
            {error}
          </div>
        )}

        {message && (
          <div className="mb-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-emerald-300">
            {message}
          </div>
        )}

        <div className="mb-6 rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
          <label className="mb-2 block text-sm text-zinc-400">Select Dish</label>
          <select
            value={selectedDish}
            onChange={(event) => {
              setSelectedDish(event.target.value);
              setMessage("");
            }}
            disabled={loading}
            className="w-full rounded-2xl border border-zinc-700 bg-black p-4"
          >
            <option value="">Select Dish</option>
            {dishes.map((dish) => (
              <option key={dish.id} value={dish.id}>
                {dish.name}
              </option>
            ))}
          </select>

          {selectedDishData && (
            <div className="mt-4 flex flex-wrap gap-6 text-sm text-zinc-400">
              <span>Price: {selectedDishData.price ?? 0}</span>
              <span>Current cost: {selectedDishData.cost ?? 0}</span>
              <span>
                Components: {selectedDishData.recipe_items?.length || 0}
              </span>
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold">Recipe Items</h2>
              <p className="mt-1 text-sm text-zinc-500">
                Recipes reference canonical inventory items for this organization.
              </p>
            </div>
            <button
              type="button"
              onClick={addInventoryItemRow}
              disabled={!selectedDish || loading}
              className="rounded-2xl bg-violet-500 px-5 py-3 text-white disabled:opacity-40"
            >
              Add Item
            </button>
          </div>

          <div className="space-y-4">
            {recipeItems.map((item, index) => (
              <div
                key={`${item.item_id || "new"}-${index}`}
                className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px_120px]"
              >
                <select
                  value={item.item_id}
                  onChange={(event) =>
                    updateItem(index, "item_id", event.target.value)
                  }
                  className="rounded-2xl border border-zinc-700 bg-black p-4"
                >
                  <option value="">Select Inventory Item</option>
                  {inventoryItems.map((inventoryItem) => (
                    <option key={inventoryItem.id} value={inventoryItem.id}>
                      {inventoryItem.name} · cost {inventoryItem.cost ?? 0}
                    </option>
                  ))}
                </select>

                <input
                  type="number"
                  min="0"
                  step="any"
                  value={item.quantity}
                  onChange={(event) =>
                    updateItem(index, "quantity", event.target.value)
                  }
                  className="rounded-2xl border border-zinc-700 bg-black p-4"
                  placeholder="Quantity"
                />

                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  className="rounded-2xl border border-red-500/20 px-4 py-3 text-sm text-red-300"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          {!loading && selectedDish && recipeItems.length === 0 && (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-zinc-500">
              No recipe items yet. Add the first inventory item to define this recipe.
            </div>
          )}

          <button
            type="button"
            onClick={saveRecipe}
            disabled={saving || loading || !selectedDish || recipeItems.length === 0}
            className="mt-6 rounded-2xl bg-green-500 px-6 py-4 font-bold text-black disabled:opacity-40"
          >
            {saving ? "Saving..." : "Save Recipe"}
          </button>
        </div>
      </div>
    </PageWrapper>
  );
}
