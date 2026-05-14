"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/shared/supabase/client";

const TENANT_ID =
  "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

export default function AccountingOverview() {

  const [revenue, setRevenue] =
    useState(0);

  const [expenses, setExpenses] =
    useState(0);

  const [cogs, setCogs] =
    useState(0);

  const [profit, setProfit] =
    useState(0);

  const [cashRevenue, setCashRevenue] =
    useState(0);

  const [cardRevenue, setCardRevenue] =
    useState(0);

  const [
    transferRevenue,
    setTransferRevenue,
  ] = useState(0);

  const [
    latestShift,
    setLatestShift,
  ] = useState(null);

  useEffect(() => {

    loadAccounting();

  }, []);

  const loadAccounting =
    async () => {

      try {

        // =========================
        // PAID ORDERS ONLY
        // =========================

        const {
          data: salesItems,
          error: salesError,
        } = await supabase
          .from("orders")
          .select(`
            total,
            payment_method,
            payment_status
          `)
          .eq(
            "tenant_id",
            TENANT_ID
          )
          .eq(
            "payment_status",
            "PAID"
          );

        if (salesError) {

          console.error(
            salesError
          );

        }

        const totalRevenue =
          (
            salesItems || []
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
            salesItems || []
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
            salesItems || []
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
            salesItems || []
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

        // =========================
        // COGS
        // =========================

        const {
          data: cogsEntries,
          error: cogsError,
        } = await supabase
          .from("cogs_entries")
          .select(`
            cost_amount
          `)
          .eq(
            "tenant_id",
            TENANT_ID
          );

        if (cogsError) {

          console.error(
            cogsError
          );

        }

        const totalCogs =
          (
            cogsEntries || []
          ).reduce(
            (sum, item) => {

              return (
                sum +
                Number(
                  item.cost_amount || 0
                )
              );

            },
            0
          );

        // =========================
        // EXPENSES
        // =========================

        const {
          data: accountingExpenses,
          error: expensesError,
        } = await supabase
          .from(
            "accounting_expenses"
          )
          .select(`
            amount
          `)
          .eq(
            "tenant_id",
            TENANT_ID
          );

        if (expensesError) {

          console.error(
            expensesError
          );

        }

        const totalExpenses =
          (
            accountingExpenses || []
          ).reduce(
            (sum, item) => {

              return (
                sum +
                Number(
                  item.amount || 0
                )
              );

            },
            0
          );

        // =========================
        // SHIFT CLOSE
        // =========================

        const {
          data: shiftData,
          error: shiftError,
        } = await supabase
          .from(
            "shift_closures"
          )
          .select("*")
          .eq(
            "tenant_id",
            TENANT_ID
          )
          .order(
            "created_at",
            {
              ascending: false,
            }
          )
          .limit(1)
          .single();

        if (
          shiftError &&
          shiftError.code !==
            "PGRST116"
        ) {

          console.error(
            shiftError
          );

        }

        // =========================
        // NET PROFIT
        // =========================

        const netProfit =
          totalRevenue -
          totalCogs -
          totalExpenses;

        setRevenue(
          totalRevenue
        );

        setCashRevenue(
          cash
        );

        setCardRevenue(
          card
        );

        setTransferRevenue(
          transfer
        );

        setCogs(
          totalCogs
        );

        setExpenses(
          totalExpenses
        );

        setProfit(
          netProfit
        );

        setLatestShift(
          shiftData || null
        );

      } catch (error) {

        console.error(
          "ACCOUNTING LOAD ERROR:",
          error
        );

      }

    };

  // =========================
  // SERVICE LEVEL
  // =========================

  let serviceLevel = 5;

  if (profit > 50000) {

    serviceLevel = 7;

  } else if (
    profit > 20000
  ) {

    serviceLevel = 6;

  }

  // =========================
  // SERVICE POOL
  // =========================

  const servicePool =
    (revenue *
      serviceLevel) /
    100;

  return (

    <div className="space-y-10 text-white">

      <h1 className="text-3xl">
        Accounting Overview
      </h1>

      {/* ========================= */}
      {/* MAIN OVERVIEW */}
      {/* ========================= */}

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">

        <Card
          title="Revenue"
          value={revenue}
          color="text-green-400"
        />

        <Card
          title="COGS"
          value={cogs}
          color="text-yellow-400"
        />

        <Card
          title="Expenses"
          value={expenses}
          color="text-red-400"
        />

        <Card
          title="Net Profit"
          value={profit}
          color={
            profit >= 0
              ? "text-green-400"
              : "text-red-400"
          }
        />

      </div>

      {/* ========================= */}
      {/* PAYMENT BREAKDOWN */}
      {/* ========================= */}

      <div className="grid md:grid-cols-3 gap-6">

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

      </div>

      {/* ========================= */}
      {/* SHIFT CLOSE */}
      {/* ========================= */}

      {latestShift && (

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">

          <div className="text-2xl">
            Latest Shift Close
          </div>

          <div className="grid md:grid-cols-2 gap-4 text-sm">

            <div>
              Cashier:
              {" "}
              {
                latestShift.cashier_name
              }
            </div>

            <div>
              Expected Cash:
              {" "}
              THB
              {" "}
              {Number(
                latestShift.expected_cash || 0
              ).toLocaleString()}
            </div>

            <div>
              Actual Cash:
              {" "}
              THB
              {" "}
              {Number(
                latestShift.actual_cash || 0
              ).toLocaleString()}
            </div>

            <div
              className={`font-semibold ${
                Number(
                  latestShift.cash_difference || 0
                ) === 0
                  ? "text-green-400"
                  : Number(
                      latestShift.cash_difference || 0
                    ) > 0
                  ? "text-yellow-400"
                  : "text-red-400"
              }`}
            >
              {latestShift.notes && (

  <div className="bg-black/30 border border-white/10 rounded-xl p-4 mt-4">

    <div className="text-sm text-white/50 mb-2">
      Shift Notes
    </div>

    <div className="text-white whitespace-pre-wrap">
      {latestShift.notes}
    </div>

  </div>

)}

              Difference:
              {" "}
              THB
              {" "}
              {Number(
                latestShift.cash_difference || 0
              ).toLocaleString()}

            </div>

          </div>

        </div>

      )}

      {/* ========================= */}
      {/* SERVICE CHARGE */}
      {/* ========================= */}

      <div className="bg-[#ff7a00]/10 border border-[#ff7a00]/30 rounded-2xl p-6">

        <div className="text-sm text-white/60">
          Service Charge Level
        </div>

        <div className="text-3xl text-[#ff7a00]">

          {serviceLevel}%

        </div>

      </div>

      <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-6">

        <div className="text-sm text-white/60">

          Service Charge Pool

        </div>

        <div className="text-3xl text-green-400">

          THB
          {" "}
          {servicePool.toLocaleString()}

        </div>

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

        THB
        {" "}
        {Number(value || 0).toLocaleString()}

      </div>

    </div>

  );

}