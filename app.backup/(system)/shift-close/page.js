"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/shared/supabase/client";

export default function ShiftClosePage() {

  const [tenantId, setTenantId] =
    useState(null);

  const [cashRevenue, setCashRevenue] =
    useState(0);

  const [cardRevenue, setCardRevenue] =
    useState(0);

  const [
    transferRevenue,
    setTransferRevenue,
  ] = useState(0);

  const [totalRevenue, setTotalRevenue] =
    useState(0);

  const [actualCash, setActualCash] =
    useState("");

  const [notes, setNotes] =
    useState("");

  const [cashDifference, setCashDifference] =
    useState(0);

  const [saving, setSaving] =
    useState(false);

  // =========================
  // LOAD TENANT
  // =========================

  useEffect(() => {

    loadTenant();

  }, []);

  const loadTenant =
    async () => {

      const {
        data: { user },
      } =
        await supabase.auth.getUser();

      if (!user) return;

      const {
        data,
        error,
      } = await supabase
        .from("staff_accounts")
        .select(`
          tenant_id
        `)
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
          "TENANT ERROR:",
          error
        );

        return;

      }

      setTenantId(
        data.tenant_id
      );

    };

  // =========================
  // LOAD REVENUE
  // =========================

  useEffect(() => {

    if (!tenantId) return;

    loadRevenue();

  }, [tenantId]);

  const loadRevenue =
    async () => {

      const {
        data: paidOrders,
        error,
      } = await supabase
        .from("orders")
        .select(`
          total,
          payment_method
        `)
        .eq(
          "tenant_id",
          tenantId
        )
        .eq(
          "payment_status",
          "PAID"
        );

      if (error) {

        console.error(
          error
        );

        return;

      }

      const total =
        (
          paidOrders || []
        ).reduce(
          (sum, order) => {

            return (
              sum +
              Number(
                order.total || 0
              )
            );

          },
          0
        );

      const cash =
        (
          paidOrders || []
        )
          .filter(
            (o) =>
              o.payment_method ===
              "CASH"
          )
          .reduce(
            (sum, order) => {

              return (
                sum +
                Number(
                  order.total || 0
                )
              );

            },
            0
          );

      const card =
        (
          paidOrders || []
        )
          .filter(
            (o) =>
              o.payment_method ===
              "CARD"
          )
          .reduce(
            (sum, order) => {

              return (
                sum +
                Number(
                  order.total || 0
                )
              );

            },
            0
          );

      const transfer =
        (
          paidOrders || []
        )
          .filter(
            (o) =>
              o.payment_method ===
              "TRANSFER"
          )
          .reduce(
            (sum, order) => {

              return (
                sum +
                Number(
                  order.total || 0
                )
              );

            },
            0
          );

      setTotalRevenue(total);

      setCashRevenue(cash);

      setCardRevenue(card);

      setTransferRevenue(
        transfer
      );

    };

  // =========================
  // CASH DIFFERENCE
  // =========================

  useEffect(() => {

    const difference =
      Number(
        actualCash || 0
      ) - cashRevenue;

    setCashDifference(
      difference
    );

  }, [
    actualCash,
    cashRevenue,
  ]);

  // =========================
  // SAVE SHIFT CLOSE
  // =========================

  const saveShiftClose =
    async () => {

      try {

        setSaving(true);

        const {
          data: { user },
        } =
          await supabase.auth.getUser();

        const {
          error,
        } = await supabase
          .from(
            "shift_closures"
          )
          .insert({

            tenant_id:
              tenantId,

            cashier_name:
              user?.email ||
              "Unknown",

            expected_cash:
              cashRevenue,

            actual_cash:
              Number(
                actualCash || 0
              ),

            cash_difference:
              cashDifference,

            card_total:
              cardRevenue,

            transfer_total:
              transferRevenue,

            total_revenue:
              totalRevenue,

            notes,

          });

        if (error)
          throw error;

        alert(
          "✅ Shift closed successfully"
        );

        setActualCash("");

        setNotes("");

      } catch (err) {

        console.error(
          "SHIFT CLOSE ERROR:",
          err
        );

        alert(
          "Shift close failed"
        );

      }

      setSaving(false);

    };

  return (

    <div className="max-w-5xl mx-auto p-6 text-white space-y-8">

      <h1 className="text-3xl">
        Shift Close
      </h1>

      {/* ========================= */}
      {/* REVENUE SUMMARY */}
      {/* ========================= */}

      <div className="grid md:grid-cols-4 gap-6">

        <Card
          title="Cash Revenue"
          value={cashRevenue}
          color="text-green-400"
        />

        <Card
          title="Card Revenue"
          value={cardRevenue}
          color="text-blue-400"
        />

        <Card
          title="Transfer Revenue"
          value={transferRevenue}
          color="text-purple-400"
        />

        <Card
          title="Total Revenue"
          value={totalRevenue}
          color="text-orange-400"
        />

      </div>

      {/* ========================= */}
      {/* CASH COUNT */}
      {/* ========================= */}

      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-6">

        <div>

          <div className="text-sm text-white/50 mb-2">
            Actual Cash In Drawer
          </div>

          <input
            type="number"
            value={actualCash}
            onChange={(e) =>
              setActualCash(
                e.target.value
              )
            }
            className="w-full bg-black border border-white/10 rounded-xl p-4"
            placeholder="Enter actual cash counted"
          />

        </div>

        <div>

          <div className="text-sm text-white/50 mb-2">
            Notes
          </div>

          <textarea
            value={notes}
            onChange={(e) =>
              setNotes(
                e.target.value
              )
            }
            className="w-full bg-black border border-white/10 rounded-xl p-4 min-h-[120px]"
            placeholder="Shift notes..."
          />

        </div>

        {/* ========================= */}
        {/* DIFFERENCE */}
        {/* ========================= */}

        <div
          className={`text-2xl font-semibold ${
            cashDifference === 0
              ? "text-green-400"
              : cashDifference > 0
              ? "text-yellow-400"
              : "text-red-400"
          }`}
        >

          Cash Difference:
          {" "}
          THB
          {" "}
          {cashDifference.toLocaleString()}

        </div>

        {/* ========================= */}
        {/* SAVE */}
        {/* ========================= */}

        <button
          onClick={saveShiftClose}
          disabled={saving}
          className="w-full bg-[#ff7a00] text-black py-4 rounded-xl font-semibold"
        >

          {saving
            ? "Saving..."
            : "Close Shift"}

        </button>

      </div>

    </div>

  );

}

function Card({
  title,
  value,
  color,
}) {

  return (

    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">

      <div className="text-sm text-white/50">
        {title}
      </div>

      <div className={`text-2xl mt-2 ${color}`}>
        THB{" "}
        {Number(value || 0).toLocaleString()}
      </div>

    </div>

  );

}
