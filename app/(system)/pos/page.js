"use client";

import { useEffect } from "react";

import PageWrapper from "@/components/PageWrapper";

import POSShell from "@/components/pos/POSShell";
import POSMenuGrid from "@/components/pos/POSMenuGrid";
import POSCart from "@/components/pos/POSCart";
import POSTableSelector from "@/components/pos/POSTableSelector";

import { usePOSStore } from "@/store/pos/usePOSStore";

import { supabase } from "@/lib/shared/supabase/client";

import { loadMenu } from "@/lib/pos/loadMenu";

import {
  addItemToCart,
  removeItemFromCart,
  getSelectedQuantity,
} from "@/store/pos/cartActions";

export default function POSPage() {

  const {

    tenantId,
    setTenantId,

    menu,
    setMenu,

    category,
    setCategory,

    search,
    setSearch,

    orderItems,
    setOrderItems,

    selectedTable,
    setSelectedTable,

    tableStatus,

    tableSessions,

  } = usePOSStore();

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
        error,
      } = await supabase
        .from(
          "staff_accounts"
        )
        .select(
          "tenant_id"
        )
        .eq(
          "auth_user_id",
          user.id
        )
        .single();

      if (
        error ||
        !data?.tenant_id
      ) {

        console.error(
          "TENANT ERROR",
          error
        );

        return;
      }

      setTenantId(
        data.tenant_id
      );
    }

    loadTenant();

  }, []);

  // ===== LOAD MENU =====
  useEffect(() => {

    async function run() {

      if (!tenantId) {
        return;
      }

      const loadedMenu =
        await loadMenu(
          tenantId
        );

      setMenu(
        loadedMenu || []
      );
    }

    run();

  }, [
    tenantId,
    setMenu,
  ]);

  // ===== FILTER =====
  const filteredMenu =
    menu.filter(
      (item) => {

        const matchesCategory =
          !category ||
          item.category ===
            category;

        const matchesSearch =
          item.name
            ?.toLowerCase()
            .includes(
              search.toLowerCase()
            );

        return (
          matchesCategory &&
          matchesSearch
        );
      }
    );

  // ===== TOTAL =====
  const total =
    orderItems.reduce(
      (
        sum,
        item
      ) =>
        sum +
        Number(
          item.price || 0
        ) *
          Number(
            item.quantity || 0
          ),
      0
    );

  // ===== ADD ITEM =====
  const addItem = (
    item
  ) => {

    const updatedCart =
      addItemToCart({

        orderItems,

        item,
      });

    setOrderItems(
      updatedCart
    );
  };

  // ===== REMOVE ITEM =====
  const removeItem = (
    dishId
  ) => {

    const updatedCart =
      removeItemFromCart({

        orderItems,

        dishId,
      });

    setOrderItems(
      updatedCart
    );
  };

  // ===== QUANTITY =====
  const getQuantity = (
    dishId
  ) =>
    getSelectedQuantity(
      orderItems,
      dishId
    );

  return (

    <div className="min-h-screen bg-black text-white overflow-hidden">

      {/* ===== TOP BAR ===== */}
      <div className="h-20 border-b border-white/5 backdrop-blur-xl bg-white/[0.02] flex items-center justify-between px-8">

        <div className="flex items-center gap-10">

          <div>

            <div className="text-3xl font-semibold tracking-tight">
              CONTROL
            </div>

            <div className="text-xs text-zinc-500 tracking-[0.3em] uppercase">
              AI Restaurant OS
            </div>

          </div>

          <div className="flex gap-3">

            {[
              "CONTROL",
              "OPERATIONS",
              "FINANCE",
              "MARKETING",
              "ADMIN",
            ].map((tab) => (

              <div
                key={tab}
                className="px-5 py-2 rounded-2xl bg-white/[0.04] border border-white/5 text-sm tracking-widest text-zinc-300 hover:bg-violet-500/20 transition-all"
              >
                {tab}
              </div>
            ))}

          </div>

        </div>

        <div className="flex items-center gap-4">

          <div className="flex items-center gap-2 text-emerald-400 text-sm">

            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />

            LIVE

          </div>

          <div className="w-11 h-11 rounded-2xl bg-white/[0.04] border border-white/5" />

        </div>

      </div>

      {/* ===== MAIN ===== */}
      <div className="flex h-[calc(100vh-80px)] overflow-hidden">

        {/* ===== TABLES ===== */}
        <div className="w-[260px] border-r border-white/5 bg-gradient-to-b from-white/[0.03] to-transparent p-5 overflow-auto">

          <div className="mb-6">

            <div className="text-xs tracking-[0.3em] text-violet-400 mb-2">
              TABLES
            </div>

            <div className="text-2xl font-semibold">
              Dining Floor
            </div>

          </div>

          <div className="grid grid-cols-2 gap-4">

            {["T1","T2","T3","T4","T5","T6"].map((table, index) => (

              <div
                key={table}
                className="aspect-square rounded-3xl bg-white/[0.03] border border-white/5 p-4 flex flex-col justify-between hover:border-violet-500/40 hover:bg-violet-500/10 transition-all"
              >

                <div className="flex items-center justify-between">

                  <div className="text-3xl font-light">
                    {table}
                  </div>

                  <div className={`w-3 h-3 rounded-full ${
                    index % 3 === 0
                      ? "bg-emerald-400"
                      : index % 3 === 1
                      ? "bg-orange-400"
                      : "bg-blue-400"
                  }`} />

                </div>

                <div>

                  <div className="text-sm text-zinc-400 uppercase tracking-widest">
                    Active
                  </div>

                  <div className="text-lg mt-1 font-medium">
                    ฿0
                  </div>

                </div>

              </div>
            ))}

          </div>

        </div>

        {/* ===== MENU ===== */}
        <div className="flex-1 overflow-auto p-8">

          <div className="flex items-center justify-between mb-8">

            <div>

              <div className="text-xs tracking-[0.3em] text-violet-400 mb-2">
                MENU
              </div>

              <div className="text-4xl font-semibold tracking-tight">
                Operational POS
              </div>

            </div>

            <div className="flex gap-3">

              <input
                value={search}
                onChange={(e) =>
                  setSearch(
                    e.target.value
                  )
                }
                placeholder="Search menu..."
                className="w-[360px] h-14 rounded-2xl bg-white/[0.04] border border-white/5 px-5 outline-none focus:border-violet-500/40"
              />

            </div>

          </div>

          {/* ===== CATEGORIES ===== */}
          <div className="flex gap-3 mb-8">

            {[
              "starter",
              "main",
              "dessert",
            ].map((cat) => (

              <button
                key={cat}
                onClick={() =>
                  setCategory(cat)
                }
                className={`px-6 h-12 rounded-2xl border transition-all uppercase tracking-widest text-sm ${
                  category === cat
                    ? "bg-violet-500 border-violet-400 text-white shadow-[0_0_30px_rgba(139,92,246,0.4)]"
                    : "bg-white/[0.03] border-white/5 text-zinc-400 hover:border-violet-500/30"
                }`}
              >
                {cat}
              </button>
            ))}

          </div>

          {/* ===== MENU GRID ===== */}
          <div className="grid grid-cols-3 gap-6">

            {filteredMenu.map((item) => (

              <div
                key={item.id}
                className="group rounded-[32px] bg-gradient-to-b from-white/[0.05] to-white/[0.02] border border-white/5 overflow-hidden hover:border-violet-500/30 hover:shadow-[0_0_40px_rgba(139,92,246,0.15)] transition-all"
              >

                <div className="h-48 bg-gradient-to-br from-zinc-900 to-black relative overflow-hidden">

                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(139,92,246,0.15),transparent_70%)]" />

                </div>

                <div className="p-6">

                  <div className="flex items-start justify-between mb-5">

                    <div>

                      <div className="text-2xl font-medium leading-tight mb-2">
                        {item.name}
                      </div>

                      <div className="text-zinc-500 text-sm uppercase tracking-widest">
                        {item.category}
                      </div>

                    </div>

                    <div className="text-right">

                      <div className="text-3xl font-light">
                        ฿{item.price}
                      </div>

                      <div className="text-emerald-400 text-sm mt-1">
                        {item.stock_quantity || 0} AVAILABLE
                      </div>

                    </div>

                  </div>

                  <button
                    onClick={() =>
                      addItem(item)
                    }
                    className="w-full h-14 rounded-2xl bg-violet-500 hover:bg-violet-400 transition-all text-lg font-medium shadow-[0_0_25px_rgba(139,92,246,0.35)]"
                  >
                    ADD TO ORDER
                  </button>

                </div>

              </div>
            ))}

          </div>

        </div>

        {/* ===== ORDER PANEL ===== */}
        <div className="w-[420px] border-l border-white/5 bg-gradient-to-b from-white/[0.03] to-transparent flex flex-col">

          <div className="p-8 border-b border-white/5">

            <div className="text-xs tracking-[0.3em] text-violet-400 mb-2">
              LIVE ORDER
            </div>

            <div className="text-4xl font-semibold tracking-tight">
              Cart
            </div>

          </div>

          <div className="flex-1 overflow-auto p-6 space-y-4">

            {orderItems.length === 0 ? (

              <div className="h-full flex flex-col items-center justify-center text-zinc-600">

                <div className="text-7xl mb-6">
                  🛒
                </div>

                <div className="text-2xl">
                  No items selected
                </div>

              </div>

            ) : (

              orderItems.map((item) => (

                <div
                  key={item.dish_id}
                  className="rounded-3xl bg-white/[0.04] border border-white/5 p-5"
                >

                  <div className="flex items-start justify-between mb-4">

                    <div>

                      <div className="text-xl font-medium">
                        {item.item_name}
                      </div>

                      <div className="text-zinc-500 mt-1">
                        Qty {item.quantity}
                      </div>

                    </div>

                    <div className="text-2xl font-light">
                      ฿{item.price}
                    </div>

                  </div>

                  <button
                    onClick={() =>
                      removeItem(
                        item.dish_id
                      )
                    }
                    className="w-full h-12 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all"
                  >
                    REMOVE
                  </button>

                </div>
              ))

            )}

          </div>

          {/* ===== FOOTER ===== */}
          <div className="border-t border-white/5 p-8">

            <div className="flex items-center justify-between mb-6">

              <div className="text-zinc-500 uppercase tracking-widest text-sm">
                Order Total
              </div>

              <div className="text-5xl font-light">
                ฿{total}
              </div>

            </div>

            <button
              className="w-full h-16 rounded-3xl bg-violet-500 hover:bg-violet-400 transition-all text-xl font-medium shadow-[0_0_40px_rgba(139,92,246,0.45)]"
            >
              SEND ORDER
            </button>

          </div>

        </div>

      </div>

    </div>
  );
}
        supabase
          .from("staff_accounts")
          .select("tenant_id")
          .eq("auth_user_id", user.id)
          .single();

      if (error || !data?.tenant_id) {
        console.error(error);
        return;
      }

      setTenantId(data.tenant_id);
    }

    loadTenant();
  }, []);

  useEffect(() => {
    async function run() {
      if (!tenantId) return;

      const loadedMenu =
        await loadMenu(tenantId);

      setMenu(loadedMenu || []);
    }

    run();
  }, [
    tenantId,
    setMenu,
  ]);

  const filteredMenu =
    menu.filter((item) => {

      const matchesCategory =
        !category ||
        item.category === category;

      const matchesSearch =
        item.name
          ?.toLowerCase()
          .includes(
            search.toLowerCase()
          );

      return (
        matchesCategory &&
        matchesSearch
      );
    });

  const total =
    orderItems.reduce(
      (
        sum,
        item
      ) =>
        sum +
        Number(item.price || 0) *
        Number(item.quantity || 0),
      0
    );

  const addItem = (item) => {

    const updated =
      addItemToCart({
        orderItems,
        item,
      });

    setOrderItems(updated);
  };

  const removeItem = (
    dishId
  ) => {

    const updated =
      removeItemFromCart({
        orderItems,
        dishId,
      });

    setOrderItems(updated);
  };

  const getQuantity = (
    dishId
  ) =>
    getSelectedQuantity(
      orderItems,
      dishId
    );

  return (

    <PageWrapper
      title="POS"
      subtitle="Operational order system"
    >

      <div className="flex gap-6 h-[calc(100vh-170px)]">

        {/* ===== TABLES ===== */}
        <div className="w-[220px] rounded-[28px] bg-zinc-950 border border-white/5 p-5 flex flex-col">

          <div className="mb-6">

            <div className="text-xs tracking-[0.25em] text-violet-400 mb-2">
              TABLES
            </div>

            <div className="text-2xl font-semibold text-white">
              Floor
            </div>

          </div>

          <div className="grid grid-cols-2 gap-3">

            {[
              "T1",
              "T2",
              "T3",
              "T4",
              "T5",
              "T6",
            ].map((table) => (

              <button
                key={table}
                onClick={() =>
                  setSelectedTable(
                    table
                  )
                }
                className={`aspect-square rounded-3xl border transition-all ${
                  selectedTable === table
                    ? "bg-violet-500 border-violet-400 shadow-[0_0_30px_rgba(139,92,246,0.35)]"
                    : "bg-white/[0.03] border-white/5 hover:border-violet-500/30"
                }`}
              >

                <div className="h-full flex flex-col items-center justify-center">

                  <div className="text-3xl font-light text-white">
                    {table}
                  </div>

                  <div className="text-xs tracking-widest text-zinc-300 mt-2">
                    ACTIVE
                  </div>

                </div>

              </button>
            ))}

          </div>

        </div>

        {/* ===== MENU ===== */}
        <div className="flex-1 rounded-[32px] bg-zinc-950 border border-white/5 p-6 overflow-auto">

          <div className="flex items-center justify-between mb-8">

            <div>

              <div className="text-xs tracking-[0.25em] text-violet-400 mb-2">
                MENU
              </div>

              <div className="text-4xl font-semibold text-white">
                Operational POS
              </div>

            </div>

            <input
              value={search}
              onChange={(e) =>
                setSearch(
                  e.target.value
                )
              }
              placeholder="Search menu..."
              className="w-[320px] h-14 rounded-2xl bg-black border border-white/5 px-5 text-white outline-none focus:border-violet-500/40"
            />

          </div>

          {/* ===== CATEGORIES ===== */}
          <div className="flex gap-3 mb-8">

            {[
              "starter",
              "main",
              "dessert",
            ].map((cat) => (

              <button
                key={cat}
                onClick={() =>
                  setCategory(cat)
                }
                className={`h-12 px-6 rounded-2xl transition-all text-sm uppercase tracking-widest ${
                  category === cat
                    ? "bg-violet-500 text-white"
                    : "bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08]"
                }`}
              >
                {cat}
              </button>
            ))}

          </div>

          {/* ===== GRID ===== */}
          <div className="grid grid-cols-3 gap-5">

            {filteredMenu.map((item) => (

              <div
                key={item.id}
                className="rounded-[28px] bg-black border border-white/5 overflow-hidden hover:border-violet-500/30 transition-all"
              >

                <div className="h-44 bg-gradient-to-br from-violet-500/10 to-black" />

                <div className="p-5">

                  <div className="flex items-start justify-between mb-4">

                    <div>

                      <div className="text-2xl font-medium text-white leading-tight">
                        {item.name}
                      </div>

                      <div className="text-zinc-500 uppercase text-xs tracking-widest mt-2">
                        {item.category}
                      </div>

                    </div>

                    <div className="text-right">

                      <div className="text-3xl font-light text-white">
                        ฿{item.price}
                      </div>

                      <div className="text-emerald-400 text-sm mt-1">
                        {item.stock_quantity || 0}
                      </div>

                    </div>

                  </div>

                  <button
                    onClick={() =>
                      addItem(item)
                    }
                    className="w-full h-14 rounded-2xl bg-violet-500 hover:bg-violet-400 transition-all text-white font-medium"
                  >
                    ADD TO ORDER
                  </button>

                </div>

              </div>
            ))}

          </div>

        </div>

        {/* ===== CART ===== */}
        <div className="w-[360px] rounded-[32px] bg-zinc-950 border border-white/5 flex flex-col overflow-hidden">

          <div className="p-6 border-b border-white/5">

            <div className="text-xs tracking-[0.25em] text-violet-400 mb-2">
              ORDER
            </div>

            <div className="text-4xl font-semibold text-white">
              Cart
            </div>

          </div>

          <div className="flex-1 overflow-auto p-5 space-y-4">

            {orderItems.length === 0 ? (

              <div className="h-full flex items-center justify-center text-zinc-600 text-xl">
                No items selected
              </div>

            ) : (

              orderItems.map((item) => (

                <div
                  key={item.dish_id}
                  className="rounded-3xl bg-black border border-white/5 p-5"
                >

                  <div className="flex items-start justify-between mb-4">

                    <div>

                      <div className="text-xl text-white">
                        {item.item_name}
                      </div>

                      <div className="text-zinc-500 mt-1">
                        Qty {item.quantity}
                      </div>

                    </div>

                    <div className="text-2xl font-light text-white">
                      ฿{item.price}
                    </div>

                  </div>

                  <button
                    onClick={() =>
                      removeItem(
                        item.dish_id
                      )
                    }
                    className="w-full h-11 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20"
                  >
                    REMOVE
                  </button>

                </div>
              ))

            )}

          </div>

          <div className="border-t border-white/5 p-6">

            <div className="flex items-center justify-between mb-5">

              <div className="text-zinc-500 uppercase tracking-widest text-sm">
                Total
              </div>

              <div className="text-5xl font-light text-white">
                ฿{total}
              </div>

            </div>

            <button
              className="w-full h-16 rounded-3xl bg-violet-500 hover:bg-violet-400 transition-all text-xl font-medium text-white"
            >
              SEND ORDER
            </button>

          </div>

        </div>

      </div>

    </PageWrapper>
  );
}
