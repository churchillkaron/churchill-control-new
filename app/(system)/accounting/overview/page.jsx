"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/shared/supabase/client";

const TENANT_ID =
  "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

export default function AccountingOverview() {
  const [revenue, setRevenue] = useState(0);
  const [expenses, setExpenses] = useState(0);
  const [cogs, setCogs] = useState(0);
  const [profit, setProfit] = useState(0);

  useEffect(() => {
    loadAccounting();
  }, []);

  const loadAccounting = async () => {
    try {

      // =========================
      // REVENUE
      // =========================

      const {
        data: orderItems,
        error: revenueError,
      } = await supabase
        .from("order_items")
        .select(`
          quantity,
          price
        `)
        .eq("tenant_id", TENANT_ID);

      if (revenueError) {
        console.error(revenueError);
      }

      const totalRevenue =
        (orderItems || []).reduce(
          (sum, item) => {
            return (
              sum +
              Number(item.price || 0) *
                Number(item.quantity || 0)
            );
          },
          0
        );
        const cashRevenue = (salesItems || [])
  .filter(
    (o) =>
      o.payment_method ===
      "CASH"
  )
  .reduce(
    (sum, o) =>
      sum +
      Number(o.total || 0),
    0
  );

const cardRevenue = (salesItems || [])
  .filter(
    (o) =>
      o.payment_method ===
      "CARD"
  )
  .reduce(
    (sum, o) =>
      sum +
      Number(o.total || 0),
    0
  );

const transferRevenue = (salesItems || [])
  .filter(
    (o) =>
      o.payment_method ===
      "TRANSFER"
  )
  .reduce(
    (sum, o) =>
      sum +
      Number(o.total || 0),
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
        .eq("tenant_id", TENANT_ID);

      if (cogsError) {
        console.error(cogsError);
      }

      const totalCogs =
        (cogsEntries || []).reduce(
          (sum, item) => {
            return (
              sum +
              Number(item.cost_amount || 0)
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
        .from("accounting_expenses")
        .select(`
          amount
        `)
        .eq("tenant_id", TENANT_ID);

      if (expensesError) {
        console.error(expensesError);
      }

      const totalExpenses =
        (accountingExpenses || []).reduce(
          (sum, item) => {
            return (
              sum +
              Number(item.amount || 0)
            );
          },
          0
        );

      // =========================
      // NET PROFIT
      // =========================

      const netProfit =
        totalRevenue -
        totalCogs -
        totalExpenses;

      setRevenue(totalRevenue);
      setCogs(totalCogs);
      setExpenses(totalExpenses);
      setProfit(netProfit);

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
  } else if (profit > 20000) {
    serviceLevel = 6;
  }

  // =========================
  // SERVICE POOL
  // =========================

  const servicePool =
    (revenue * serviceLevel) / 100;

  return (
    <div className="space-y-10 text-white">

      <h1 className="text-3xl">
        Accounting Overview
      </h1>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-3">

        <div className="text-green-400">
          Revenue: THB{" "}
          {revenue.toLocaleString()}
        </div>

        <div className="text-yellow-400">
          COGS: THB{" "}
          {cogs.toLocaleString()}
        </div>

        <div className="text-red-400">
          Expenses: THB{" "}
          {expenses.toLocaleString()}
        </div>

        <hr className="border-white/10 my-3" />

        <div
          className={`text-xl ${
            profit >= 0
              ? "text-green-400"
              : "text-red-400"
          }`}
        >
          Net Profit: THB{" "}
          {profit.toLocaleString()}
        </div>

      </div>

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
          (Available for Staff)
        </div>

        <div className="text-3xl text-green-400">
          THB{" "}
          {servicePool.toLocaleString()}
        </div>

      </div>

    </div>
  );
}
