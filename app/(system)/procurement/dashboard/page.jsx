"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/shared/supabase/client";

export default function ProcurementDashboardPage() {

  const [
    stats,
    setStats,
  ] = useState({

    ingredients: 0,

    lowStock: 0,

    wasteItems: 0,

    preparedInventory: 0,
  });

  async function loadDashboard() {

    const [
      ingredientsRes,
      preparedRes,
      wasteRes,
    ] = await Promise.all([

      supabase
        .from("ingredients")
        .select("*"),

      supabase
        .from(
          "prepared_inventory"
        )
        .select("*"),

      supabase
        .from(
          "waste_ledger"
        )
        .select("*"),
    ]);

    const ingredients =
      ingredientsRes.data || [];

    const lowStock =
      ingredients.filter(
        (item) =>
          Number(
            item.quantity || 0
          ) <= 5
      );

    setStats({

      ingredients:
        ingredients.length,

      lowStock:
        lowStock.length,

      wasteItems:
        wasteRes.data?.length || 0,

      preparedInventory:
        preparedRes.data?.length || 0,
    });
  }

  useEffect(() => {

    loadDashboard();

  }, []);

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <div className="max-w-7xl mx-auto">

        <h1 className="text-6xl font-bold mb-3">
          Procurement Dashboard
        </h1>

        <div className="text-zinc-500 mb-10">
          Inventory Intelligence Center
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">

          <div className="border border-zinc-800 rounded-3xl p-8">

            <div className="text-zinc-500 text-sm">
              Ingredients
            </div>

            <div className="text-5xl mt-4 font-bold">
              {
                stats.ingredients
              }
            </div>

          </div>

          <div className="border border-zinc-800 rounded-3xl p-8">

            <div className="text-zinc-500 text-sm">
              Low Stock
            </div>

            <div className="text-5xl mt-4 font-bold text-yellow-400">
              {
                stats.lowStock
              }
            </div>

          </div>

          <div className="border border-zinc-800 rounded-3xl p-8">

            <div className="text-zinc-500 text-sm">
              Waste Events
            </div>

            <div className="text-5xl mt-4 font-bold text-red-400">
              {
                stats.wasteItems
              }
            </div>

          </div>

          <div className="border border-zinc-800 rounded-3xl p-8">

            <div className="text-zinc-500 text-sm">
              Prepared Inventory
            </div>

            <div className="text-5xl mt-4 font-bold text-green-400">
              {
                stats.preparedInventory
              }
            </div>

          </div>

        </div>

      </div>

    </div>
  );
}
