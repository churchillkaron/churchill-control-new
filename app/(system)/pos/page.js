"use client";

import { useEffect, useState } from "react";

import PageWrapper from "@/components/PageWrapper";

import { usePOSStore } from "@/store/pos/usePOSStore";

import { supabase } from "@/lib/shared/supabase/client";

import { loadMenu } from "@/lib/pos/loadMenu";
import { loadTableSessions } from "@/lib/pos/loadTableSessions";
import { loadActiveOrders } from "@/lib/pos/loadActiveOrders";

import { closeTableSession } from "@/lib/pos/closeTableSession";

import { createOrder } from "@/lib/pos/createOrder";

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

  } = usePOSStore();

  const [
    sending,
    setSending,
  ] = useState(false);

  const [
    tableSessions,
    setTableSessions,
  ] = useState([]);

  const [
    activeOrders,
    setActiveOrders,
  ] = useState([]);

  // ===== LOAD TENANT =====
  useEffect(() => {

    async function loadTenant() {

      const {
        data: { user },
      } =
        await supabase.auth.getUser();

      if (!user) return;

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

  // ===== LOAD MENU =====
  useEffect(() => {

    async function run() {

      if (!tenantId) {
        return;
      }

      const loaded =
        await loadMenu(
          tenantId
        );

      setMenu(
        loaded || []
      );
    }

    run();

  }, [
    tenantId,
  ]);

  // ===== REFRESH =====
  async function refreshAll() {

    if (!tenantId) {
      return;
    }

    const sessions =
      await loadTableSessions(
        tenantId
      );

    setTableSessions(
      sessions || []
    );

    const orders =
      await loadActiveOrders(
        tenantId
      );

    setActiveOrders(
      orders || []
    );
  }

  useEffect(() => {

    refreshAll();

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
          "pos-live"
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table:
              "table_sessions",
          },
          async () => {

            await refreshAll();
          }
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table:
              "orders",
          },
          async () => {

            await refreshAll();
          }
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

    const updated =
      addItemToCart({
        orderItems,
        item,
      });

    setOrderItems(
      updated
    );
  };

  // ===== REMOVE ITEM =====
  const removeItem = (
    dishId
  ) => {

    const updated =
      removeItemFromCart({
        orderItems,
        dishId,
      });

    setOrderItems(
      updated
    );
  };

  // ===== QUANTITY =====
  const getQuantity =
    (dishId) =>
      getSelectedQuantity(
        orderItems,
        dishId
      );

  // ===== SEND ORDER =====
  async function sendOrder() {

    try {

      if (
        !selectedTable
      ) {

        alert(
          "Select table"
        );

        return;
      }

      if (
        orderItems.length === 0
      ) {

        alert(
          "Cart empty"
        );

        return;
      }

      setSending(true);

      const {
        data: { user },
      } =
        await supabase.auth.getUser();

      const {
        data: staff,
      } = await supabase
        .from("staff_accounts")
        .select("*")
        .eq(
          "auth_user_id",
          user.id
        )
        .single();

      await createOrder({

        table:
          selectedTable,

        items:
          orderItems,

        total,

        staff_id:
          staff?.id,

        staff_name:
          staff?.name,

        tenant_id:
          tenantId,
      });

      setOrderItems([]);

      await refreshAll();

    } catch (error) {

      console.error(error);

      alert(
        error.message
      );

    } finally {

      setSending(false);
    }
  }

  // ===== CLOSE TABLE =====
  async function closeTable(
    sessionId
  ) {

    try {

      await closeTableSession(
        sessionId
      );

      await refreshAll();

    } catch (error) {

      console.error(error);

      alert(
        error.message
      );
    }
  }

  function getTableSession(
    table
  ) {

    return tableSessions.find(
      (session) =>
        session.table_number ===
        table
    );
  }

  return (

    <PageWrapper
      title="POS"
      subtitle="Operational order system"
    >

      <div className="flex gap-5 h-[calc(100vh-170px)]">

        {/* ===== TABLES ===== */}
        <div className="w-[190px] rounded-[28px] border border-white/10 bg-white/[0.03] backdrop-blur-2xl p-4 overflow-auto">

          <div className="mb-5">

            <div className="text-[11px] uppercase tracking-[0.25em] text-violet-400 mb-1">
              Tables
            </div>

            <div className="text-xl font-semibold text-white">
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
            ].map((table) => {

              const session =
                getTableSession(
                  table
                );

              return (

                <button
                  key={table}
                  onClick={() =>
                    setSelectedTable(
                      table
                    )
                  }
                  className={`aspect-square rounded-2xl border transition-all ${
                    selectedTable === table
                      ? "bg-violet-500 border-violet-400 shadow-[0_0_25px_rgba(139,92,246,0.35)]"
                      : "bg-white/[0.03] border-white/10 hover:border-violet-500/40"
                  }`}
                >

                  <div className="flex flex-col items-center justify-center h-full">

                    <div className="text-xl font-medium text-white">
                      {table}
                    </div>

                    <div className={`text-[10px] tracking-widest mt-1 ${
                      session
                        ? "text-orange-400"
                        : "text-emerald-400"
                    }`}>
                      {session
                        ? "ACTIVE"
                        : "FREE"}
                    </div>

                    <div className="text-[10px] text-zinc-500 mt-1">
                      ฿{
                        session?.revenue || 0
                      }
                    </div>

                  </div>

                </button>
              );
            })}

          </div>

        </div>

        {/* ===== MENU ===== */}
        <div className="flex-1 rounded-[32px] border border-white/10 bg-white/[0.03] backdrop-blur-2xl overflow-hidden flex flex-col">

          <div className="p-6 border-b border-white/5 flex items-center justify-between">

            <div>

              <div className="text-[11px] uppercase tracking-[0.25em] text-violet-400 mb-1">
                Menu
              </div>

              <div className="text-2xl font-semibold text-white">
                Restaurant POS
              </div>

            </div>

            <div className="flex items-center gap-3">

              <div className="px-4 h-11 rounded-2xl bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs uppercase tracking-widest flex items-center">
                {activeOrders.length} LIVE ORDERS
              </div>

              <input
                value={search}
                onChange={(e) =>
                  setSearch(
                    e.target.value
                  )
                }
                placeholder="Search..."
                className="w-[260px] h-11 rounded-2xl bg-black/40 border border-white/10 px-4 text-sm text-white outline-none focus:border-violet-500/40"
              />

            </div>

          </div>

          {/* ===== CATEGORIES ===== */}
          <div className="px-6 pt-5 flex gap-3">

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
                className={`h-10 px-5 rounded-2xl text-[11px] uppercase tracking-[0.2em] transition-all ${
                  category === cat
                    ? "bg-violet-500 text-white"
                    : "bg-white/[0.04] border border-white/10 text-zinc-400 hover:border-violet-500/30"
                }`}
              >
                {cat}
              </button>
            ))}

          </div>

          {/* ===== GRID ===== */}
          <div className="flex-1 overflow-auto p-6">

            <div className="grid grid-cols-3 gap-5">

              {filteredMenu.map((item) => (

                <div
                  key={item.id}
                  className="rounded-[26px] border border-white/10 bg-black/30 overflow-hidden hover:border-violet-500/40 transition-all"
                >

                  <div className="h-36 bg-gradient-to-br from-violet-500/10 to-black" />

                  <div className="p-4">

                    <div className="flex items-start justify-between mb-4">

                      <div>

                        <div className="text-lg font-medium text-white leading-tight">
                          {item.name}
                        </div>

                        <div className="text-[10px] uppercase tracking-widest text-zinc-500 mt-1">
                          {item.category}
                        </div>

                      </div>

                      <div className="text-right">

                        <div className="text-xl font-light text-white">
                          ฿{item.price}
                        </div>

                        <div className="text-[10px] text-emerald-400 mt-1">
                          {item.stock_quantity || 0} LEFT
                        </div>

                      </div>

                    </div>

                    <button
                      onClick={() =>
                        addItem(item)
                      }
                      className="w-full h-11 rounded-2xl bg-violet-500 hover:bg-violet-400 transition-all text-sm font-medium text-white"
                    >
                      {getQuantity(
                        item.id
                      ) > 0
                        ? `ADD (${getQuantity(item.id)})`
                        : "ADD"}
                    </button>

                  </div>

                </div>
              ))}

            </div>

          </div>

        </div>

        {/* ===== CART ===== */}
        <div className="w-[330px] rounded-[32px] border border-white/10 bg-white/[0.03] backdrop-blur-2xl flex flex-col overflow-hidden">

          <div className="p-6 border-b border-white/5">

            <div className="text-[11px] uppercase tracking-[0.25em] text-violet-400 mb-1">
              Order
            </div>

            <div className="text-2xl font-semibold text-white">
              Cart
            </div>

          </div>

          <div className="flex-1 overflow-auto p-5 space-y-4">

            {orderItems.length === 0 ? (

              <div className="h-full flex items-center justify-center text-zinc-600 text-sm">
                No items selected
              </div>

            ) : (

              orderItems.map((item) => (

                <div
                  key={item.dish_id}
                  className="rounded-2xl border border-white/10 bg-black/30 p-4"
                >

                  <div className="flex items-start justify-between mb-3">

                    <div>

                      <div className="text-base text-white font-medium">
                        {item.item_name}
                      </div>

                      <div className="text-xs text-zinc-500 mt-1">
                        Qty {item.quantity}
                      </div>

                    </div>

                    <div className="text-lg font-light text-white">
                      ฿{item.price}
                    </div>

                  </div>

                  <button
                    onClick={() =>
                      removeItem(
                        item.dish_id
                      )
                    }
                    className="w-full h-10 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs uppercase tracking-widest hover:bg-red-500/20"
                  >
                    Remove
                  </button>

                </div>
              ))

            )}

          </div>

          {/* ===== FOOTER ===== */}
          <div className="border-t border-white/5 p-5">

            <div className="flex items-center justify-between mb-4">

              <div className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">
                Total
              </div>

              <div className="text-3xl font-light text-white">
                ฿{total}
              </div>

            </div>

            {selectedTable && getTableSession(selectedTable) && (

              <button
                onClick={() =>
                  closeTable(
                    getTableSession(selectedTable).id
                  )
                }
                className="w-full h-11 rounded-2xl border border-red-500/20 bg-red-500/10 text-red-400 text-sm mb-3 hover:bg-red-500/20 transition-all"
              >
                CLOSE TABLE
              </button>
            )}

            <button
              onClick={sendOrder}
              disabled={sending}
              className="w-full h-14 rounded-2xl bg-violet-500 hover:bg-violet-400 transition-all text-white text-sm font-medium disabled:opacity-50"
            >
              {sending
                ? "SENDING..."
                : "SEND ORDER"}
            </button>

          </div>

        </div>

      </div>

    </PageWrapper>
  );
}
