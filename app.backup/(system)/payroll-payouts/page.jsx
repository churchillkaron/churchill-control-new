"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/shared/supabase/client";

import PageWrapper from "@/components/PageWrapper";

import { processPayrollPayout } from "@/lib/payroll/processPayrollPayout";

export default function PayrollPayoutsPage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null);

  const [
    currentUser,
    setCurrentUser,
  ] = useState(null);

  const [
    payrollRecords,
    setPayrollRecords,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    processing,
    setProcessing,
  ] = useState(null);

  // ===== LOAD =====
  async function loadPayrollRecords() {

    if (!tenantId) {
      return;
    }

    const {
      data,
      error,
    } = await supabase
      .from(
        "payroll_records"
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

    setPayrollRecords(
      data || []
    );

    setLoading(false);
  }

  // ===== PROCESS =====
  async function handleProcessPayout(
    payrollRecord
  ) {

    try {

      setProcessing(
        payrollRecord.id
      );

      const payoutReference =
        `PAY-${Date.now()}`;

      await processPayrollPayout({

        tenantId,

        payrollRecord,

        processedBy:
          currentUser?.id,

        paymentMethod:
          "BANK_TRANSFER",

        payoutReference,

        notes:
          "Payroll payout processed",
      });

      await loadPayrollRecords();

      alert(
        "Payroll payout completed"
      );

    } catch (error) {

      console.error(
        error
      );

      alert(
        "Failed to process payout"
      );

    } finally {

      setProcessing(
        null
      );
    }
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

      setCurrentUser(user);

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

    loadPayrollRecords();

  }, [tenantId]);

  // ===== METRICS =====
  const pendingTotal =
    payrollRecords
      .filter(
        (record) =>
          record.payout_status ===
          "PENDING"
      )
      .reduce(
        (
          sum,
          record
        ) =>
          sum +
          Number(
            record.final_salary || 0
          ),
        0
      );

  const completedTotal =
    payrollRecords
      .filter(
        (record) =>
          record.payout_status ===
          "COMPLETED"
      )
      .reduce(
        (
          sum,
          record
        ) =>
          sum +
          Number(
            record.final_salary || 0
          ),
        0
      );

  return (
    <div className="min-h-screen bg-[#050507]">

      <PageWrapper
        title="Payroll Payouts"
        subtitle="Operational salary payout processing"
      >

        {loading ? (

          <div className="text-white/40">
            Loading payouts...
          </div>

        ) : (

          <div className="space-y-6">

            {/* TOP */}
            <div className="grid grid-cols-3 gap-4">

              <div className="rounded-[24px] border border-orange-500/20 bg-orange-500/10 p-6">

                <div className="text-[11px] tracking-[0.25em] text-orange-300/60">
                  PENDING PAYOUTS
                </div>

                <div
                  className="mt-4 text-5xl text-orange-400"
                  style={{
                    fontWeight: 250,
                    letterSpacing: "-0.08em",
                  }}
                >
                  ฿
                  {
                    Math.round(
                      pendingTotal
                    )
                  }
                </div>

              </div>

              <div className="rounded-[24px] border border-green-500/20 bg-green-500/10 p-6">

                <div className="text-[11px] tracking-[0.25em] text-green-300/60">
                  COMPLETED PAYOUTS
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
                      completedTotal
                    )
                  }
                </div>

              </div>

              <div className="rounded-[24px] border border-[#8B5CF6]/20 bg-[#8B5CF6]/10 p-6">

                <div className="text-[11px] tracking-[0.25em] text-[#C4B5FD]/60">
                  TOTAL RECORDS
                </div>

                <div
                  className="mt-4 text-5xl text-[#B58AF8]"
                  style={{
                    fontWeight: 250,
                    letterSpacing: "-0.08em",
                  }}
                >
                  {
                    payrollRecords.length
                  }
                </div>

              </div>

            </div>

            {/* TABLE */}
            <div className="overflow-hidden rounded-[24px] border border-white/10 bg-[#111117]">

              <div className="grid grid-cols-7 border-b border-white/10 px-6 py-4 text-[11px] tracking-[0.25em] text-white/30">

                <div>
                  STAFF
                </div>

                <div>
                  ROLE
                </div>

                <div>
                  MONTH
                </div>

                <div>
                  FINAL SALARY
                </div>

                <div>
                  STATUS
                </div>

                <div>
                  REFERENCE
                </div>

                <div>
                  ACTION
                </div>

              </div>

              <div className="divide-y divide-white/5">

                {payrollRecords.map(
                  (record) => (

                    <div
                      key={record.id}
                      className="grid grid-cols-7 items-center px-6 py-5 transition hover:bg-white/[0.02]"
                    >

                      <div
                        className="text-lg"
                        style={{
                          fontWeight: 300,
                        }}
                      >
                        {
                          record.staff_name
                        }
                      </div>

                      <div className="text-white/50">
                        {
                          record.role
                        }
                      </div>

                      <div className="text-white/60">
                        {
                          record.payroll_month
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
                          Math.round(
                            record.final_salary
                          )
                        }
                      </div>

                      <div>

                        <div
                          className={`inline-flex rounded-full px-3 py-1 text-[11px] tracking-[0.15em] ${
                            record.payout_status ===
                            "COMPLETED"
                              ? "border border-green-500/20 bg-green-500/10 text-green-400"
                              : "border border-orange-500/20 bg-orange-500/10 text-orange-400"
                          }`}
                        >
                          {
                            record.payout_status
                          }
                        </div>

                      </div>

                      <div className="text-sm text-white/40">
                        {
                          record.payment_reference ||
                          "-"
                        }
                      </div>

                      <div>

                        {record.payout_status !==
                        "COMPLETED" ? (

                          <button
                            onClick={() =>
                              handleProcessPayout(
                                record
                              )
                            }
                            disabled={
                              processing ===
                              record.id
                            }
                            className="rounded-[14px] bg-green-500 px-4 py-2 text-xs text-white transition hover:bg-green-400 disabled:opacity-40"
                          >
                            {processing ===
                            record.id
                              ? "PROCESSING..."
                              : "PROCESS"}
                          </button>

                        ) : (

                          <div className="text-green-400 text-xs">
                            COMPLETED
                          </div>

                        )}

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
