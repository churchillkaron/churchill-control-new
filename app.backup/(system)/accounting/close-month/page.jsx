"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/shared/supabase/client";

export default function CloseMonthPage() {

  const [invoices, setInvoices] = useState([]);
  const [payroll, setPayroll] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {

    setLoading(true);

    // PAID INVOICES
    const { data: invoiceData } =
      await supabase
        .from("invoices")
        .select("*")
        .eq("status", "paid")
        .order("created_at", {
          ascending: false,
        });

    // PAID PAYROLL
    const { data: payrollData } =
      await supabase
        .from("approval_rejections")
        .select("*")
        .eq("status", "paid")
        .order("created_at", {
          ascending: false,
        });

    setInvoices(invoiceData || []);
    setPayroll(payrollData || []);

    setLoading(false);

  }

  // ---------------------------------
  // LOCK FINANCIAL RECORD
  // ---------------------------------

  async function lockRecord(
    entityType,
    item
  ) {

    try {

      setActionLoading(
        `${entityType}-${item.id}`
      );

      const response =
        await fetch(

          "/api/approvals/process",

          {

            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({

              entityType,

              entityId:
                item.id,

              currentStatus:
                "paid",

              role:
                "accounting",

              actedBy:
                null,

              notes:
                "Accounting period locked",

            }),

          }

        );

      const result =
        await response.json();

      if (!result.success) {

        alert(
          result.error
        );

        return;

      }

      await fetchData();

    } finally {

      setActionLoading("");

    }

  }

  // ---------------------------------
  // TOTALS
  // ---------------------------------

  const totalPaidInvoices =
    invoices.reduce(
      (sum, inv) =>
        sum +
        Number(
          inv.total_amount || 0
        ),
      0
    );

  // ---------------------------------
  // UI
  // ---------------------------------

  if (loading) {

    return (
      <div className="min-h-screen bg-black text-white p-10">
        Loading accounting closure...
      </div>
    );

  }

  return (

    <div className="min-h-screen bg-black text-white p-10">

      {/* HEADER */}
      <div className="mb-10">

        <h1 className="text-4xl font-bold">
          Accounting Closure
        </h1>

        <div className="text-white/50 mt-2">
          Lock immutable accounting periods
        </div>

      </div>

      {/* SUMMARY */}
      <div className="grid grid-cols-3 gap-4 mb-10">

        <SummaryCard
          title="Paid Invoices"
          value={invoices.length}
        />

        <SummaryCard
          title="Paid Payroll"
          value={payroll.length}
        />

        <SummaryCard
          title="Locked Exposure"
          value={`฿${totalPaidInvoices.toLocaleString()}`}
        />

      </div>

      {/* INVOICES */}
      <div className="mb-16">

        <h2 className="text-2xl mb-6">
          Paid Supplier Records
        </h2>

        {invoices.length === 0 && (

          <Empty text="No paid invoices awaiting lock" />

        )}

        {invoices.map((inv) => (

          <div
            key={inv.id}
            className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-4"
          >

            <div className="flex justify-between items-center">

              <div>

                <div className="text-xl font-semibold">
                  {inv.vendor || "Unknown Vendor"}
                </div>

                <div className="text-white/50 mt-1">
                  {inv.status}
                </div>

                <div className="text-2xl mt-3">
                  ฿{Number(inv.total_amount || 0).toLocaleString()}
                </div>

              </div>

              <button

                onClick={() =>
                  lockRecord(
                    "invoice",
                    inv
                  )
                }

                disabled={
                  actionLoading ===
                  `invoice-${inv.id}`
                }

                className="bg-purple-600 hover:bg-purple-700 px-6 py-3 rounded-xl disabled:opacity-50"

              >

                {actionLoading ===
                `invoice-${inv.id}`

                  ? "Locking..."

                  : "Lock Month"}

              </button>

            </div>

          </div>

        ))}

      </div>

      {/* PAYROLL */}
      <div>

        <h2 className="text-2xl mb-6">
          Paid Payroll Records
        </h2>

        {payroll.length === 0 && (

          <Empty text="No paid payroll awaiting lock" />

        )}

        {payroll.map((p) => (

          <div
            key={p.id}
            className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-4"
          >

            <div className="flex justify-between items-center">

              <div>

                <div className="text-xl font-semibold">
                  Staff ID: {p.staff_id}
                </div>

                <div className="text-white/50 mt-1">
                  {p.status}
                </div>

              </div>

              <button

                onClick={() =>
                  lockRecord(
                    "payroll",
                    p
                  )
                }

                disabled={
                  actionLoading ===
                  `payroll-${p.id}`
                }

                className="bg-purple-600 hover:bg-purple-700 px-6 py-3 rounded-xl disabled:opacity-50"

              >

                {actionLoading ===
                `payroll-${p.id}`

                  ? "Locking..."

                  : "Lock Month"}

              </button>

            </div>

          </div>

        ))}

      </div>

    </div>

  );

}

function SummaryCard({
  title,
  value,
}) {

  return (

    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">

      <div className="text-white/50 text-sm">
        {title}
      </div>

      <div className="text-3xl font-bold mt-2">
        {value}
      </div>

    </div>

  );

}

function Empty({
  text,
}) {

  return (

    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-white/40">
      {text}
    </div>

  );

}