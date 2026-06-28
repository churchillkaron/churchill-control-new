"use client";

export const dynamic = "force-dynamic";

import {
  useEffect,
  useState,
} from "react";

import { supabase } from "@/lib/shared/supabase/client";

import { loadIngredientUsage } from "@/lib/production/loadIngredientUsage";

export default function ProductionUsagePage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null);

  const [
    usage,
    setUsage,
  ] = useState([]);

  // ===== TENANT =====
  useEffect(() => {

    async function loadTenant() {

      const {
        data: { user },
      } =
        await supabase.auth.getSession();

      if (!user) {
        return;
      }

      const {
        data,
      } = await supabase
        .from("staff_accounts")
        .select("*")
        .eq(
          "auth_user_id",
          user.id
        )
        .single();

      if (
        data?.tenant_id
      ) {

        setTenantId(
          data.tenant_id
        );
      }
    }

    loadTenant();

  }, []);

  // ===== LOAD =====
  async function refresh() {

    if (!tenantId) {
      return;
    }

    const data =
      await loadIngredientUsage(
        tenantId
      );

    setUsage(data);
  }

  useEffect(() => {

    refresh();

  }, [
    tenantId,
  ]);

  // ===== REALTIME =====
  useEffect(() => {

    if (!tenantId) {
      return;
    }

    const channel =
      supabase
        .channel(
          "ingredient-usage"
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table:
              "inventory_movements",
          },
          refresh
        )
        .subscribe();

    return () => {

      supabase.removeChannel(
        channel
      );
    };

  }, [
    tenantId,
  ]);

  return (

    <div className="min-h-screen bg-black text-white overflow-hidden">

      {/* ===== HEADER ===== */}
      <div className="h-28 border-b border-white/5 flex items-center justify-between px-12">

        <div>

          <div className="text-xs tracking-[0.35em] uppercase text-orange-400 mb-3">
            INVENTORY
          </div>

          <div className="text-6xl font-semibold tracking-tight">
            Ingredient Usage
          </div>

        </div>

        <div className="px-6 h-14 rounded-3xl border border-orange-500/20 bg-orange-500/5 text-orange-400 text-xs uppercase tracking-[0.3em] flex items-center">
          LIVE MOVEMENTS
        </div>

      </div>

      {/* ===== TABLE ===== */}
      <div className="p-10">

        <div className="rounded-[40px] border border-white/10 overflow-hidden">

          <table className="w-full">

            <thead className="bg-white/5">

              <tr className="text-left">

                <th className="p-6 text-zinc-400 font-medium">
                  Ingredient
                </th>

                <th className="p-6 text-zinc-400 font-medium">
                  Used
                </th>

                <th className="p-6 text-zinc-400 font-medium">
                  Previous
                </th>

                <th className="p-6 text-zinc-400 font-medium">
                  New Stock
                </th>

                <th className="p-6 text-zinc-400 font-medium">
                  Reference
                </th>

              </tr>

            </thead>

            <tbody>

              {usage.map(
                (row) => (

                  <tr
                    key={row.id}
                    className="border-t border-white/5"
                  >

                    <td className="p-6">
                      {row.ingredients?.name || "Unknown"}
                    </td>

                    <td className="p-6 text-orange-400">
                      {row.quantity}
                    </td>

                    <td className="p-6">
                      {row.previous_stock}
                    </td>

                    <td className="p-6 text-cyan-400">
                      {row.new_stock}
                    </td>

                    <td className="p-6 text-zinc-500">
                      {row.reference_id}
                    </td>

                  </tr>
                )
              )}

            </tbody>

          </table>

        </div>

      </div>

    </div>
  );
}
