"use client";

import { useEffect } from "react";

import PageWrapper from "@/components/PageWrapper";

import POSShell from "@/components/pos/POSShell";
import POSMenuGrid from "@/components/pos/POSMenuGrid";
import POSCart from "@/components/pos/POSCart";
import POSTableSelector from "@/components/pos/POSTableSelector";

import { usePOSStore } from "@/store/pos/usePOSStore";

import { loadMenu } from "@/lib/pos/loadMenu";

export default function POSPage() {

  const {

    tenantId,

    menu,
    setMenu,

    category,
    setCategory,

    search,
    setSearch,

    orderItems,

    selectedTable,
    setSelectedTable,

    tableStatus,

    tableSessions,

  } = usePOSStore();

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
              addItem={() => {}}
              getSelectedQuantity={() => 0}
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
              total={0}
              sending={false}
              removeItem={() => {}}
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
