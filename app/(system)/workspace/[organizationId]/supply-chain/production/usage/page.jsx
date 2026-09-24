"use client";

export const dynamic = "force-dynamic";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import { supabase } from "@/lib/shared/supabase/client";

import { loadIngredientUsage } from "@/lib/inventory/production/loadIngredientUsage";

export default function ProductionUsagePage() {

  const [
    organizationId,
    setOrganizationId,
  ] = useState(null);

  const [
    usage,
    setUsage,
  ] = useState([]);

  // ===== TENANT =====
  useEffect(() => {

    async function loadOrganization() {

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
        data?.organization_id
      ) {

        setOrganizationId(
          data.organization_id
        );
      }
    }

    loadOrganization();

  }, []);

  // ===== LOAD =====
  const refresh = useCallback(async () => {

    if (!organizationId) {
      return;
    }

    const data =
      await loadIngredientUsage(
        organizationId
      );

    setUsage(data);
  }, [organizationId]);

  useEffect(() => {

    refresh();

  }, [refresh]);

  // ===== REALTIME =====
  useEffect(() => {

    if (!organizationId) {
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
            service_unit:
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

  }, [organizationId, refresh]);

  return (

    <div className="min-h-screen bg-[#F7F6F3] text-[#191919] overflow-hidden">

      {/* ===== HEADER ===== */}
      <div className="flex flex-col gap-4 border-b border-black/[0.06] px-4 py-6 sm:px-6 lg:h-28 lg:flex-row lg:items-center lg:justify-between lg:px-12 lg:py-0">

        <div>

          <div className="text-xs tracking-[0.35em] uppercase text-orange-400 mb-3">
            INVENTORY
          </div>

          <div className="text-3xl font-semibold tracking-tight sm:text-4xl lg:text-6xl">
            Ingredient Usage
          </div>

        </div>

        <div className="flex h-10 w-fit items-center rounded-2xl border border-orange-500/20 bg-orange-500/5 px-4 text-[10px] uppercase tracking-[0.22em] text-orange-400 lg:h-14 lg:rounded-3xl lg:px-6 lg:text-xs lg:tracking-[0.3em]">
          LIVE MOVEMENTS
        </div>

      </div>

      {/* ===== TABLE ===== */}
      <div className="p-4 sm:p-6 lg:p-10">

        <div className="space-y-3 md:hidden">
          {usage.map((row) => (
            <div key={row.id} className="rounded-2xl border border-black/[0.08] bg-[#FBF8F3] p-4">
              <div className="text-sm font-semibold">{row.ingredients?.name || "Unknown"}</div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                <div><div className="text-[9px] uppercase tracking-[0.12em] text-zinc-500">Used</div><div className="mt-1 text-orange-400">{row.quantity}</div></div>
                <div><div className="text-[9px] uppercase tracking-[0.12em] text-zinc-500">Previous</div><div className="mt-1">{row.previous_stock}</div></div>
                <div><div className="text-[9px] uppercase tracking-[0.12em] text-zinc-500">New stock</div><div className="mt-1 text-amber-400">{row.new_stock}</div></div>
                <div className="min-w-0"><div className="text-[9px] uppercase tracking-[0.12em] text-zinc-500">Reference</div><div className="mt-1 truncate text-zinc-400">{row.reference_id || "—"}</div></div>
              </div>
            </div>
          ))}
        </div>

        <div className="hidden overflow-hidden rounded-[40px] border border-black/[0.08] md:block">
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
                    className="border-t border-black/[0.06]"
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

                    <td className="p-6 text-amber-400">
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
