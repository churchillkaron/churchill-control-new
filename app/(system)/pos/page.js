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

    <div className="min-h-screen bg-[#050507]">

      <PageWrapper
        title="POS"
        subtitle="Operational order system"
      >

        <POSShell

          tableSelector={
            <POSTableSelector
              selectedTable={
                selectedTable
              }
              setSelectedTable={
                setSelectedTable
              }
              tableStatus={
                tableStatus
              }
              tableSessions={
                tableSessions
              }
            />
          }

          menu={
            <POSMenuGrid
              filteredMenu={
                filteredMenu
              }
              category={
                category
              }
              setCategory={
                setCategory
              }
              addItem={
                addItem
              }
              getSelectedQuantity={
                getQuantity
              }
              search={
                search
              }
              setSearch={
                setSearch
              }
            />
          }

          cart={
            <POSCart
              selectedTable={
                selectedTable
              }
              orderItems={
                orderItems
              }
              total={
                total
              }
              sending={false}
              removeItem={
                removeItem
              }
              sendOrder={() => {}}
              clearTable={() => {}}
              tableStatus={
                tableStatus
              }
              tableSessions={
                tableSessions
              }
            />
          }

        />

      </PageWrapper>

    </div>
  );
}
