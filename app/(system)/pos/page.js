"use client";

import PageWrapper from "@/components/PageWrapper";

import POSShell from "@/components/pos/POSShell";
import POSMenuGrid from "@/components/pos/POSMenuGrid";
import POSCart from "@/components/pos/POSCart";
import POSTableSelector from "@/components/pos/POSTableSelector";

import { usePOSStore } from "@/store/pos/usePOSStore";

export default function POSPage() {

  const {

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
              filteredMenu={[]}
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
