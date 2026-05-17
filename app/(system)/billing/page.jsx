"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/shared/supabase/client";

import PageWrapper from "@/components/PageWrapper";

import { calculateBill } from "@/lib/finance/calculateBill";
import { createPaymentTransaction } from "@/lib/finance/createPaymentTransaction";

export default function BillingPage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null);

  const [
    currentUser,
    setCurrentUser,
  ] = useState(null);

  const [
    settings,
    setSettings,
  ] = useState({
    service_charge: 5,
    vat_percent: 7,
  });

  const [
    sessions,
    setSessions,
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
  async function loadBilling() {

    if (!tenantId) {
      return;
    }

    // ===== SETTINGS =====
    const {
      data: settingsData,
    } = await supabase
      .from(
        "restaurant_settings"
      )
      .select("*")
      .eq(
        "tenant_id",
        tenantId
      )
      .single();

    if (settingsData) {

      setSettings({
        service_charge:
          settingsData.service_charge || 5,

        vat_percent:
          settingsData.vat_percent || 7,
      });
    }

    // ===== SESSIONS =====
    const {
      data,
      error,
    } = await supabase
      .from("table_sessions")
      .select("*")
      .eq(
        "tenant_id",
        tenantId
      )
      .eq(
        "status",
        "ACTIVE"
      )
      .order(
        "started_at",
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

    setSessions(
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

    loadBilling();

  }, [tenantId]);

  // ===== REALTIME =====
  useEffect(() => {

    if (!tenantId) {
      return;
    }

    const channel =
      supabase
        .channel(
          "billing-live"
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
            loadBilling()
        )

        .subscribe();

    return () => {
      supabase.removeChannel(
        channel
      );
    };

  }, [tenantId]);

  // ===== PAYMENT =====
  async function processPayment(
    session
  ) {

    try {

      setProcessing(
        session.id
      );

      const bill =
        calculateBill({

          subtotal:
            session.revenue,

          serviceChargePercent:
            settings.service_charge,

          vatPercent:
            settings.vat_percent,

          discountAmount: 0,
        });

      // ===== CREATE PAYMENT TRANSACTION =====
      await createPaymentTransaction({

        tenantId,

        tableSessionId:
          session.id,

        tableNumber:
          session.table_number,

        paymentMethod:
          "CASH",

        subtotal:
          bill.subtotal,

        serviceChargeAmount:
          bill.serviceCharge,

        vatAmount:
          bill.vat,

        discountAmount:
          bill.discount,

        finalTotal:
          bill.finalTotal,

        paidAmount:
          bill.finalTotal,

        changeAmount: 0,

        createdBy:
          currentUser?.id,
      });

      // ===== COMPLETE ORDERS =====
      await supabase
        .from("orders")
        .update({
          status:
            "PAID",

          kitchen_status:
            "COMPLETED",
        })
        .eq(
          "tenant_id",
          tenantId
        )
        .eq(
          "table_number",
          session.table_number
        );

      // ===== UPDATE SESSION =====
      await supabase
        .from("table_sessions")
        .update({

          status:
            "PAID",

          payment_method:
            "CASH",

          paid_amount:
            bill.finalTotal,

          service_charge_amount:
            bill.serviceCharge,

          vat_amount:
            bill.vat,

          discount_amount:
            bill.discount,

          final_total:
            bill.finalTotal,

          closed_at:
            new Date(),
        })
        .eq(
          "id",
          session.id
        );

      await loadBilling();

    } catch (error) {

      console.error(
        error
      );

      alert(
        "Failed to process payment"
      );

    } finally {

      setProcessing(
        null
      );
    }
  }

  return (
    <div className="min-h-screen bg-[#050507]">

      <PageWrapper
        title="Billing"
        subtitle="Operational payment processing"
      >

        {loading ? (

          <div className="text-white/40">
            Loading billing...
          </div>

        ) : (

          <div className="grid grid-cols-3 gap-4">

            {sessions.map(
              (session) => {

                const duration =
                  Math.floor(
                    (
                      Date.now() -
                      new Date(
                        session.started_at
                      ).getTime()
                    ) / 60000
                  );

                const bill =
                  calculateBill({

                    subtotal:
                      session.revenue,

                    serviceChargePercent:
                      settings.service_charge,

                    vatPercent:
                      settings.vat_percent,

                    discountAmount: 0,
                  });

                return (

                  <div
                    key={session.id}
                    className="rounded-[24px] border border-white/10 bg-[#111117] p-5"
                  >

                    {/* HEADER */}
                    <div className="flex items-start justify-between">

                      <div>

                        <div className="text-[11px] tracking-[0.25em] text-white/30">
                          TABLE
                        </div>

                        <div
                          className="mt-2 text-4xl"
                          style={{
                            fontWeight: 250,
                            letterSpacing: "-0.06em",
                          }}
                        >
                          {
                            session.table_number
                          }
                        </div>

                      </div>

                      <div className="rounded-full bg-blue-500/10 px-3 py-1 text-[11px] tracking-[0.15em] text-blue-400">
                        BILLING
                      </div>

                    </div>

                    {/* BILL */}
                    <div className="mt-5 space-y-3 rounded-[18px] border border-white/10 bg-black/20 p-4">

                      <div className="flex items-center justify-between text-sm">

                        <div className="text-white/40">
                          Subtotal
                        </div>

                        <div>
                          ฿
                          {
                            bill.subtotal
                          }
                        </div>

                      </div>

                      <div className="flex items-center justify-between text-sm">

                        <div className="text-white/40">
                          Service Charge
                        </div>

                        <div>
                          ฿
                          {
                            bill.serviceCharge
                          }
                        </div>

                      </div>

                      <div className="flex items-center justify-between text-sm">

                        <div className="text-white/40">
                          VAT
                        </div>

                        <div>
                          ฿
                          {
                            bill.vat
                          }
                        </div>

                      </div>

                      <div className="border-t border-white/10 pt-3">

                        <div className="flex items-center justify-between">

                          <div className="text-sm text-white/40">
                            FINAL TOTAL
                          </div>

                          <div
                            className="text-2xl"
                            style={{
                              fontWeight: 250,
                              letterSpacing: "-0.05em",
                            }}
                          >
                            ฿
                            {
                              bill.finalTotal
                            }
                          </div>

                        </div>

                      </div>

                    </div>

                    {/* METRICS */}
                    <div className="mt-4 grid grid-cols-2 gap-2">

                      <div className="rounded-[14px] border border-white/10 bg-black/20 p-3">

                        <div className="text-[10px] tracking-[0.18em] text-white/30">
                          TIME
                        </div>

                        <div
                          className="mt-2 text-lg"
                          style={{
                            fontWeight: 250,
                          }}
                        >
                          {
                            duration
                          }m
                        </div>

                      </div>

                      <div className="rounded-[14px] border border-white/10 bg-black/20 p-3">

                        <div className="text-[10px] tracking-[0.18em] text-white/30">
                          ORDERS
                        </div>

                        <div
                          className="mt-2 text-lg"
                          style={{
                            fontWeight: 250,
                          }}
                        >
                          {
                            session.orders
                          }
                        </div>

                      </div>

                    </div>

                    {/* ACTION */}
                    <div className="mt-5">

                      <button
                        onClick={() =>
                          processPayment(
                            session
                          )
                        }
                        disabled={
                          processing ===
                          session.id
                        }
                        className="w-full rounded-[18px] bg-green-500 px-5 py-4 text-sm text-white transition hover:bg-green-400 disabled:opacity-40"
                      >
                        {processing ===
                        session.id
                          ? "PROCESSING..."
                          : "PROCESS PAYMENT"}
                      </button>

                    </div>

                  </div>
                );
              }
            )}

          </div>

        )}

      </PageWrapper>

    </div>
  );
}
