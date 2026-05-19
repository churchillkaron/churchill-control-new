"use client";

import {
  useEffect,
  useState,
} from "react";

import { supabase } from "@/lib/shared/supabase/client";

import { loadLowStockItems } from "@/lib/inventory/loadLowStockItems";

export default function LowStockPage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null);

  const [
    items,
    setItems,
  ] = useState([]);

  // ===== LOAD TENANT =====
  useEffect(() => {

    async function loadTenant() {

      const {
        data: { user },
      } =
        await supabase.auth.getUser();

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
      await loadLowStockItems(
        tenantId
      );

    setItems(
      data || []
    );
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
          "low-stock-live"
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table:
              "dishes",
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
      <div className="h-24 border-b border-white/5 flex items-center justify-between px-10">

        <div>

          <div className="text-xs tracking-[0.3em] uppercase text-orange-400 mb-2">
            INVENTORY
          </div>

          <div className="text-5xl font-semibold">
            Low Stock
          </div>

        </div>

        <div className="px-5 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs uppercase tracking-[0.25em] flex items-center">
          {items.length} ITEMS
        </div>

      </div>

      {/* ===== GRID ===== */}
      <div className="p-8 grid grid-cols-4 gap-6">

        {items.length === 0 ? (

          <div className="col-span-4 h-[60vh] flex items-center justify-center text-zinc-600 text-2xl">
            No low stock items
          </div>

        ) : (

          items.map((item) => (

            <div
              key={item.id}
              className="rounded-[32px] border border-orange-500/20 bg-orange-500/5 overflow-hidden"
            >

              <div className="p-8">

                <div className="flex items-start justify-between mb-6">

                  <div>

                    <div className="text-xs uppercase tracking-[0.25em] text-orange-400 mb-2">
                      Dish
                    </div>

                    <div className="text-3xl font-medium">
                      {item.name}
                    </div>

                  </div>

                  <div className="w-16 h-16 rounded-2xl bg-orange-500 text-black flex items-center justify-center text-2xl font-semibold">
                    {
                      item.stock_quantity
                    }
                  </div>

                </div>

                <div className="space-y-3">

                  <div className="flex items-center justify-between">

                    <div className="text-zinc-500">
                      Category
                    </div>

                    <div className="text-white">
                      {
                        item.category
                      }
                    </div>

                  </div>

                  <div className="flex items-center justify-between">

                    <div className="text-zinc-500">
                      Price
                    </div>

                    <div className="text-white text-xl font-light">
                      ฿{
                        item.price
                      }
                    </div>

                  </div>

                </div>

              </div>

            </div>
          ))

        )}

      </div>

    </div>
  );
}
