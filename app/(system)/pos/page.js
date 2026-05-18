"use client";

import { useEffect } from "react";

import PageWrapper from "@/components/PageWrapper";

import POSShell from "@/components/pos/POSShell";
import POSMenuGrid from "@/components/pos/POSMenuGrid";
import POSCart from "@/components/pos/POSCart";
import POSTableSelector from "@/components/pos/POSTableSelector";

import { supabase } from "@/lib/shared/supabase/client";

import { usePOSStore } from "@/store/pos/usePOSStore";

import { loadMenu } from "@/lib/pos/loadMenu";
import { loadTableSessions } from "@/lib/pos/loadTableSessions";

import { validateStock } from "@/lib/pos/validateStock";

import { createOrder } from "@/lib/pos/createOrder";
import { clearTable as clearTableService } from "@/lib/pos/clearTable";

import {
  addItemToCart,
  removeItemFromCart,
  getSelectedQuantity,
} from "@/store/pos/cartActions";

export default function POSPage() {

  const {

    tenantId,
    setTenantId,

    user,
    setUser,

    sending,
    setSending,

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
    setTableStatus,

    tableSessions,
    setTableSessions,

  } = usePOSStore();

  // ===== LOAD DATA =====
  async function refreshPOSData(
    currentTenantId
  ) {

    const loadedMenu =
      await loadMenu(
        currentTenantId
      );

    setMenu(
      loadedMenu
    );

    const sessions =
      await loadTableSessions(
        currentTenantId
      );

    setTableSessions(
      sessions
    );

    const updatedStatus = {
      T1: "AVAILABLE",
      T2: "AVAILABLE",
      T3: "AVAILABLE",
      T4: "AVAILABLE",
      T5: "AVAILABLE",
      T6: "AVAILABLE",
    };

    Object.keys(
      sessions
    ).forEach(
      (table) => {

        updatedStatus[
          table
        ] = "ACTIVE";
      }
    );

    setTableStatus(
      updatedStatus
    );
  }

  // ===== INITIAL LOAD =====
  useEffect(() => {

    async function loadUser() {

      const {
        data: { user },
      } =
        await supabase.auth.getUser();

      if (!user) {
        return;
      }

      setUser(user);

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
          "TENANT ERROR"
        );

        return;
      }

      setTenantId(
        data.tenant_id
      );

      await refreshPOSData(
        data.tenant_id
      );
    }

    loadUser();

  }, []);

  // ===== REALTIME =====
  useEffect(() => {

    if (!tenantId) {
      return;
    }

    const channel =
      supabase
        .channel(
          "pos-live-sync"
        )

        .on(
          "postgres_changes",
          {
            event: "*",
            schema:
              "public",
            table:
              "table_sessions",
            filter: `tenant_id=eq.${tenantId}`,
          },
          () =>
            refreshPOSData(
              tenantId
            )
        )

        .subscribe();

    return () => {
      supabase.removeChannel(
        channel
      );
    };

  }, [tenantId]);

  // ===== FILTER =====
  const filteredMenu =
    menu.filter(
      (item) => {

        const matchesCategory =
          !item.category ||
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

  // ===== HELPERS =====
  const getQuantity = (
    dishId
  ) =>
    getSelectedQuantity(
      orderItems,
      dishId
    );

  // ===== ADD ITEM =====
  const addItem = (
    item
  ) => {

    try {

      const updatedCart =
        addItemToCart({
          orderItems,
          item,
        });

      setOrderItems(
        updatedCart
      );

    } catch (error) {

      alert(
        error.message
      );
    }
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

  // ===== SEND ORDER =====
  const sendOrder =
    async () => {

      if (
        orderItems.length === 0 ||
        sending
      ) {
        return;
      }

      if (!tenantId) {

        alert(
          "Tenant not loaded"
        );

        return;
      }

      setSending(true);

      try {

        const validation =
          await validateStock({
            tenantId,
            orderItems,
          });

        if (
          !validation.valid
        ) {

          alert(
            validation.message
          );

          await refreshPOSData(
            tenantId
          );

          return;
        }

        await createOrder({
          table:
            selectedTable,

          items:
            orderItems,

          total,

          staff_id:
            user?.id,

          staff_name:
            user?.email ||
            "Unknown",

          tenant_id:
            tenantId,
        });

        setOrderItems([]);

        await refreshPOSData(
          tenantId
        );

      } catch (error) {

        console.error(
          error
        );

        alert(
          error.message ||
            "Failed to send order"
        );

      } finally {

        setSending(false);
      }
    };

  // ===== CLEAR TABLE =====
  const clearTable =
    async () => {

      if (
        !tenantId
      ) {
        return;
      }

      try {

        setSending(
          true
        );

        await clearTableService({
          table:
            selectedTable,

          tenant_id:
            tenantId,
        });

        setOrderItems([]);

        await refreshPOSData(
          tenantId
        );

      } catch (error) {

        console.error(
          error
        );

        alert(
          "Failed to clear table"
        );

      } finally {

        setSending(
          false
        );
      }
    };

  return (

  <div className="min-h-screen bg-black text-white p-10">

    <h1 className="text-5xl font-bold mb-10">
      POS DEBUG
    </h1>

    <div className="space-y-4 text-xl">

      <div>
        Tenant:
        {" "}
        {tenantId || "NONE"}
      </div>

      <div>
        Menu Count:
        {" "}
        {menu?.length || 0}
      </div>

      <div>
        Order Items:
        {" "}
        {orderItems?.length || 0}
      </div>

      <div>
        Selected Table:
        {" "}
        {selectedTable}
      </div>

    </div>

  </div>
);
}
