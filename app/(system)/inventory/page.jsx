"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/shared/supabase/client";

import PageWrapper from "@/components/PageWrapper";

export default function InventoryPage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null);

  const [
    inventory,
    setInventory,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  // ===== LOAD =====
  async function loadInventory() {

    if (!tenantId) {
      return;
    }

    const {
      data,
      error,
    } = await supabase
      .from("ingredients")
      .select("*")
      .eq(
        "tenant_id",
        tenantId
      )
      .order(
        "name",
        {
          ascending: true,
        }
      );

    if (error) {

      console.error(
        error
      );

      return;
    }

    setInventory(
      data || []
    );

    setLoading(false);
  }

  // ===== INIT =====
  useEffect(() => {

    async function init() {

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
        !data?.tenant_id
      ) {
        return;
      }

      setTenantId(
        data.tenant_id
      );
    }

    init();

  }, []);

  // ===== LOAD =====
  useEffect(() => {

    if (!tenantId) {
      return;
    }

    loadInventory();

  }, [tenantId]);

  // ===== REALTIME =====
  useEffect(() => {

    if (!tenantId) {
      return;
    }

    const channel =
      supabase
        .channel(
          "inventory-live"
        )

        .on(
          "postgres_changes",
          {
            event: "*",
            schema:
              "public",
            table:
              "ingredients",
            filter: `tenant_id=eq.${tenantId}`,
          },
          () =>
            loadInventory()
        )

        .subscribe();

    return () => {
      supabase.removeChannel(
        channel
      );
    };

  }, [tenantId]);

  // ===== METRICS =====
  const lowStock =
    inventory.filter(
      (item) =>
        Number(
          item.stock || 0
        ) <=
        Number(
          item.minimum_stock || 0
        )
    );

  const totalStockValue =
    inventory.reduce(
      (
        sum,
        item
      ) =>
        sum +
        (
          Number(
            item.stock || 0
          ) *
          Number(
            item.cost || 0
          )
        ),
      0
    );

  return (
    <div className="min-h-screen bg-[#050507]">

      <PageWrapper
        title="Inventory"
        subtitle="Operational stock control"
      >

        {loading ? (

          <div className="text-white/40">
            Loading inventory...
          </div>

        ) : (

          <div className="space-y-6">

            {/* TOP */}
            <div className="grid grid-cols-3 gap-4">

              <div className="rounded-[24px] border border-white/10 bg-[#111117] p-6">

                <div className="text-[11px] tracking-[0.25em] text-white/30">
                  TOTAL ITEMS
                </div>

                <div
                  className="mt-4 text-5xl"
                  style={{
                    fontWeight: 250,
                    letterSpacing: "-0.08em",
                  }}
                >
                  {
                    inventory.length
                  }
                </div>

              </div>

              <div className="rounded-[24px] border border-red-500/20 bg-red-500/10 p-6">

                <div className="text-[11px] tracking-[0.25em] text-red-300/60">
                  LOW STOCK
                </div>

                <div
                  className="mt-4 text-5xl text-red-400"
                  style={{
                    fontWeight: 250,
                    letterSpacing: "-0.08em",
                  }}
                >
                  {
                    lowStock.length
                  }
                </div>

              </div>

              <div className="rounded-[24px] border border-green-500/20 bg-green-500/10 p-6">

                <div className="text-[11px] tracking-[0.25em] text-green-300/60">
                  STOCK VALUE
                </div>

                <div
                  className="mt-4 text-5xl text-green-400"
                  style={{
                    fontWeight: 250,
                    letterSpacing: "-0.08em",
                  }}
                >
                  ฿
                  {
                    Math.round(
                      totalStockValue
                    )
                  }
                </div>

              </div>

            </div>

            {/* TABLE */}
            <div className="overflow-hidden rounded-[24px] border border-white/10 bg-[#111117]">

              <div className="grid grid-cols-5 border-b border-white/10 px-6 py-4 text-[11px] tracking-[0.25em] text-white/30">

                <div>
                  ITEM
                </div>

                <div>
                  STOCK
                </div>

                <div>
                  MINIMUM
                </div>

                <div>
                  COST
                </div>

                <div>
                  STATUS
                </div>

              </div>

              <div className="divide-y divide-white/5">

                {inventory.map(
                  (item) => {

                    const low =
                      Number(
                        item.stock || 0
                      ) <=
                      Number(
                        item.minimum_stock || 0
                      );

                    return (

                      <div
                        key={item.id}
                        className="grid grid-cols-5 items-center px-6 py-5 transition hover:bg-white/[0.02]"
                      >

                        <div
                          className="text-lg"
                          style={{
                            fontWeight: 300,
                            letterSpacing: "-0.03em",
                          }}
                        >
                          {
                            item.name
                          }
                        </div>

                        <div
                          className={`text-lg ${
                            low
                              ? "text-red-400"
                              : "text-white"
                          }`}
                          style={{
                            fontWeight: 250,
                          }}
                        >
                          {
                            item.stock
                          }
                        </div>

                        <div className="text-white/50">
                          {
                            item.minimum_stock
                          }
                        </div>

                        <div className="text-white/60">
                          ฿
                          {
                            item.cost || 0
                          }
                        </div>

                        <div>

                          <div
                            className={`inline-flex rounded-full px-3 py-1 text-[11px] tracking-[0.15em] ${
                              low
                                ? "border border-red-500/20 bg-red-500/10 text-red-400"
                                : "border border-green-500/20 bg-green-500/10 text-green-400"
                            }`}
                          >
                            {low
                              ? "LOW STOCK"
                              : "NORMAL"}
                          </div>

                        </div>

                      </div>
                    );
                  }
                )}

              </div>

            </div>

          </div>

        )}

      </PageWrapper>

    </div>
  );
}
