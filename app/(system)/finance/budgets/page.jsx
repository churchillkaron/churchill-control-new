"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/shared/supabase/client";

export default function BudgetsPage() {

  const [budgets, setBudgets] = useState([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    department: "",
    fiscal_year: new Date().getFullYear(),
    fiscal_month: new Date().getMonth() + 1,
    budget_amount: "",
  });

  useEffect(() => {
    fetchBudgets();
  }, []);

  async function fetchBudgets() {

    setLoading(true);

    const { data, error } =
      await supabase
        .from("department_budgets")
        .select("*")
        .order("fiscal_year", {
          ascending: false,
        })
        .order("fiscal_month", {
          ascending: false,
        });

    if (error) {

      console.error(error);
      alert(error.message);

    }

    setBudgets(data || []);

    setLoading(false);

  }

  // -----------------------------------
  // CREATE BUDGET
  // -----------------------------------

  async function createBudget() {

    if (!form.department) {

      alert(
        "Department required"
      );

      return;

    }

    const budgetAmount =
      Number(
        form.budget_amount || 0
      );

    const { error } =
      await supabase
        .from("department_budgets")
        .insert([{

          department:
            form.department,

          fiscal_year:
            Number(
              form.fiscal_year
            ),

          fiscal_month:
            Number(
              form.fiscal_month
            ),

          budget_amount:
            budgetAmount,

          committed_amount:
            0,

          actual_amount:
            0,

          remaining_amount:
            budgetAmount,

        }]);

    if (error) {

      console.error(error);
      alert(error.message);

      return;

    }

    setForm({
      department: "",
      fiscal_year:
        new Date().getFullYear(),
      fiscal_month:
        new Date().getMonth() + 1,
      budget_amount: "",
    });

    await fetchBudgets();

  }

  // -----------------------------------
  // TOTALS
  // -----------------------------------

  const totals = useMemo(() => {

    const totalBudget =
      budgets.reduce(
        (sum, b) =>
          sum +
          Number(
            b.budget_amount || 0
          ),
        0
      );

    const totalCommitted =
      budgets.reduce(
        (sum, b) =>
          sum +
          Number(
            b.committed_amount || 0
          ),
        0
      );

    const totalActual =
      budgets.reduce(
        (sum, b) =>
          sum +
          Number(
            b.actual_amount || 0
          ),
        0
      );

    const totalRemaining =
      budgets.reduce(
        (sum, b) =>
          sum +
          Number(
            b.remaining_amount || 0
          ),
        0
      );

    return {

      totalBudget,

      totalCommitted,

      totalActual,

      totalRemaining,

    };

  }, [budgets]);

  // -----------------------------------
  // UI
  // -----------------------------------

  if (loading) {

    return (
      <div className="min-h-screen bg-black text-white p-10">
        Loading budgets...
      </div>
    );

  }

  return (

    <div className="min-h-screen bg-black text-white p-10">

      {/* HEADER */}
      <div className="mb-10">

        <h1 className="text-4xl font-bold">
          Budget Governance
        </h1>

        <div className="text-white/50 mt-2">
          Enterprise department spending control
        </div>

      </div>

      {/* SUMMARY */}
      <div className="grid grid-cols-4 gap-4 mb-10">

        <SummaryCard
          title="Total Budget"
          value={totals.totalBudget}
        />

        <SummaryCard
          title="Committed"
          value={totals.totalCommitted}
        />

        <SummaryCard
          title="Actual"
          value={totals.totalActual}
        />

        <SummaryCard
          title="Remaining"
          value={totals.totalRemaining}
          highlight
        />

      </div>

      {/* CREATE */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-10">

        <h2 className="text-2xl mb-6">
          Create Budget
        </h2>

        <div className="grid grid-cols-4 gap-4">

          <input
            placeholder="Department"
            value={form.department}
            onChange={(e) =>
              setForm({
                ...form,
                department:
                  e.target.value,
              })
            }
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          />

          <input
            type="number"
            placeholder="Year"
            value={form.fiscal_year}
            onChange={(e) =>
              setForm({
                ...form,
                fiscal_year:
                  e.target.value,
              })
            }
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          />

          <input
            type="number"
            placeholder="Month"
            value={form.fiscal_month}
            onChange={(e) =>
              setForm({
                ...form,
                fiscal_month:
                  e.target.value,
              })
            }
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          />

          <input
            type="number"
            placeholder="Budget Amount"
            value={form.budget_amount}
            onChange={(e) =>
              setForm({
                ...form,
                budget_amount:
                  e.target.value,
              })
            }
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          />

        </div>

        <button
          onClick={createBudget}
          className="mt-6 bg-green-600 hover:bg-green-700 px-6 py-3 rounded-xl"
        >
          Create Budget
        </button>

      </div>

      {/* BUDGETS */}
      <div>

        <h2 className="text-2xl mb-6">
          Department Budgets
        </h2>

        {budgets.length === 0 && (

          <Empty text="No budgets created" />

        )}

        {budgets.map((budget) => {

          const utilization =
            budget.budget_amount > 0

              ? (
                  Number(
                    budget.actual_amount || 0
                  ) /

                  Number(
                    budget.budget_amount || 0
                  )

                ) * 100

              : 0;

          const warning =
            utilization >=
            budget.warning_threshold;

          const critical =
            utilization >=
            budget.critical_threshold;

          return (

            <div
              key={budget.id}
              className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-4"
            >

              <div className="flex justify-between items-start">

                <div>

                  <div className="text-2xl font-semibold">
                    {budget.department}
                  </div>

                  <div className="text-white/40 mt-1">

                    {budget.fiscal_month}/
                    {budget.fiscal_year}

                  </div>

                  <div className="mt-4 space-y-1 text-white/70">

                    <div>
                      Budget:
                      {" "}
                      ฿{Number(
                        budget.budget_amount || 0
                      ).toLocaleString()}
                    </div>

                    <div>
                      Committed:
                      {" "}
                      ฿{Number(
                        budget.committed_amount || 0
                      ).toLocaleString()}
                    </div>

                    <div>
                      Actual:
                      {" "}
                      ฿{Number(
                        budget.actual_amount || 0
                      ).toLocaleString()}
                    </div>

                    <div>
                      Remaining:
                      {" "}
                      ฿{Number(
                        budget.remaining_amount || 0
                      ).toLocaleString()}
                    </div>

                  </div>

                </div>

                <div className="flex flex-col items-end">

                  <div
                    className={`px-4 py-2 rounded-full text-sm ${
                      critical

                        ? "bg-red-600/20 text-red-300"

                        : warning

                        ? "bg-yellow-600/20 text-yellow-300"

                        : "bg-green-600/20 text-green-300"
                    }`}
                  >

                    {utilization.toFixed(1)}%

                  </div>

                  <div className="mt-3 text-white/40 text-sm">

                    utilization

                  </div>

                </div>

              </div>

            </div>

          );

        })}

      </div>

    </div>

  );

}

// -----------------------------------
// SUMMARY CARD
// -----------------------------------

function SummaryCard({
  title,
  value,
  highlight = false,
}) {

  return (

    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">

      <div className="text-white/50 text-sm">
        {title}
      </div>

      <div
        className={`text-3xl font-bold mt-2 ${
          highlight
            ? "text-green-400"
            : "text-white"
        }`}
      >

        ฿{Number(
          value || 0
        ).toLocaleString()}

      </div>

    </div>

  );

}

// -----------------------------------
// EMPTY
// -----------------------------------

function Empty({
  text,
}) {

  return (

    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-white/40">
      {text}
    </div>

  );

}