"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/shared/supabase/client";

import PageWrapper from "@/components/PageWrapper";

export default function ReceiptsPage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null);

  const [
    receipts,
    setReceipts,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  // ===== LOAD =====
  async function loadReceipts() {

    if (!tenantId) {
      return;
    }

    const {
      data,
      error,
    } = await supabase
      .from(
        "payment_transactions"
      )
      .select("*")
      .eq(
        "tenant_id",
        tenantId
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      );

    if (error) {

      console.error(
        error
      );

      return;
    }

    setReceipts(
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

    loadReceipts();

  }, [tenantId]);

  // ===== TOTAL =====
  const totalRevenue =
    receipts.reduce(
      (
        sum,
        receipt
      ) =>
        sum +
        Number(
          receipt.final_total || 0
        ),
      0
    );

  return (
    <div className="min-h-screen bg-[#050507]">

      <PageWrapper
        title="Receipts"
        subtitle="Payment transaction history"
      >

        {loading ? (

          <div className="text-white/40">
            Loading receipts...
          </div>

        ) : (

          <div className="space-y-6">

            {/* TOP */}
            <div className="grid grid-cols-3 gap-4">

              <div className="rounded-[24px] border border-white/10 bg-[#111117] p-6">

                <div className="text-[11px] tracking-[0.25em] text-white/30">
                  TOTAL RECEIPTS
                </div>

                <div
                  className="mt-4 text-5xl"
                  style={{
                    fontWeight: 250,
                    letterSpacing: "-0.08em",
                  }}
                >
                  {
                    receipts.length
                  }
                </div>

              </div>

              <div className="rounded-[24px] border border-green-500/20 bg-green-500/10 p-6">

                <div className="text-[11px] tracking-[0.25em] text-green-300/60">
                  TOTAL REVENUE
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
                      totalRevenue
                    )
                  }
                </div>

              </div>

              <div className="rounded-[24px] border border-blue-500/20 bg-blue-500/10 p-6">

                <div className="text-[11px] tracking-[0.25em] text-blue-300/60">
                  SYSTEM
                </div>

                <div
                  className="mt-5 text-xl text-blue-400"
                  style={{
                    fontWeight: 300,
                  }}
                >
                  PAYMENT LOGGING
                </div>

              </div>

            </div>

            {/* RECEIPTS */}
            <div className="overflow-hidden rounded-[24px] border border-white/10 bg-[#111117]">

              <div className="grid grid-cols-7 border-b border-white/10 px-6 py-4 text-[11px] tracking-[0.25em] text-white/30">

                <div>
                  RECEIPT
                </div>

                <div>
                  TABLE
                </div>

                <div>
                  PAYMENT
                </div>

                <div>
                  CASHIER
                </div>

                <div>
                  TOTAL
                </div>

                <div>
                  STATUS
                </div>

                <div>
                  CREATED
                </div>

              </div>

              <div className="divide-y divide-white/5">

                {receipts.map(
                  (receipt) => (

                    <div
                      key={receipt.id}
                      className="grid grid-cols-7 items-center px-6 py-5 transition hover:bg-white/[0.02]"
                    >

                      <div className="text-sm text-white/70">
                        {
                          receipt.receipt_number
                        }
                      </div>

                      <div
                        className="text-2xl"
                        style={{
                          fontWeight: 250,
                          letterSpacing: "-0.05em",
                        }}
                      >
                        {
                          receipt.table_number
                        }
                      </div>

                      <div>

                        <div className="inline-flex rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] tracking-[0.15em] text-white/60">
                          {
                            receipt.payment_method
                          }
                        </div>

                      </div>

                      <div className="text-white/60">
                        {
                          receipt.cashier_name
                        }
                      </div>

                      <div
                        className="text-xl"
                        style={{
                          fontWeight: 250,
                        }}
                      >
                        ฿
                        {
                          receipt.final_total
                        }
                      </div>

                      <div>

                        <div className="inline-flex rounded-full border border-green-500/20 bg-green-500/10 px-3 py-1 text-[11px] tracking-[0.15em] text-green-400">
                          {
                            receipt.status
                          }
                        </div>

                      </div>

                      <div className="text-sm text-white/40">

                        {receipt.created_at
                          ? new Date(
                              receipt.created_at
                            ).toLocaleString()
                          : "-"}

                      </div>

                    </div>
                  )
                )}

              </div>

            </div>

          </div>

        )}

      </PageWrapper>

    </div>
  );
}
