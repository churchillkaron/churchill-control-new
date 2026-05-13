"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/shared/supabase/client";

export default function PaymentsPage() {

  const [invoices, setInvoices] = useState([]);
  const [payroll, setPayroll] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {

    setLoading(true);

    // APPROVED INVOICES
    const { data: invoiceData } =
      await supabase
        .from("invoices")
        .select("*")
        .eq("status", "approved")
        .order("created_at", {
          ascending: false,
        });

    // APPROVED PAYROLL
    const { data: payrollData } =
      await supabase
        .from("approval_rejections")
        .select("*")
        .eq("status", "approved")
        .order("created_at", {
          ascending: false,
        });

    setInvoices(invoiceData || []);
    setPayroll(payrollData || []);

    setLoading(false);

  }

  // -----------------------------
  // RELEASE PAYMENT
  // -----------------------------

  async function releasePayment(
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
                "approved",

              role:
                "accounting",

              actedBy:
                null,

              notes:
                "Payment released",

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

  // -----------------------------
  // TOTALS
  // -----------------------------

  const totalInvoiceExposure =
    invoices.reduce(
      (sum, inv) =>
        sum +
        Number(
          inv.total_amount || 0
        ),
      0
    );

  // -----------------------------
  // UI
  // -----------------------------

  if (loading) {

    return (
      <div className="min-h-screen bg-black text-white p-10">
        Loading payment execution...
      </div>
    );

  }

  return (

    <div className="min-h-screen bg-black text-white p-10">

      {/* HEADER */}
      <div className="mb-10">

        <h1 className="text-4xl font-bold">
          Payment Execution
        </h1>

        <div className="text-white/50 mt-2">
          Approved liabilities awaiting payment release
        </div>

      </div>

      {/* SUMMARY */}
      <div className="grid grid-cols-3 gap-4 mb-10">

        <SummaryCard
          title="Approved Invoices"
          value={invoices.length}
        />

        <SummaryCard
          title="Approved Payroll"
          value={payroll.length}
        />

        <SummaryCard
          title="Outstanding Liability"
          value={`฿${totalInvoiceExposure.toLocaleString()}`}
        />

      </div>

      {/* INVOICES */}
      <div className="mb-16">

        <h2 className="text-2xl mb-6">
          Approved Supplier Payments
        </h2>

        {invoices.length === 0 && (
          <Empty text="No approved invoices awaiting payment" />
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
                  releasePayment(
                    "invoice",
                    inv
                  )
                }

                disabled={
                  actionLoading ===
                  `invoice-${inv.id}`
                }

                className="bg-green-600 hover:bg-green-700 px-6 py-3 rounded-xl disabled:opacity-50"

              >

                {actionLoading ===
                `invoice-${inv.id}`

                  ? "Processing..."

                  : "Mark Paid"}

              </button>

            </div>

          </div>

        ))}

      </div>

      {/* PAYROLL */}
      <div>

        <h2 className="text-2xl mb-6">
          Approved Payroll Payments
        </h2>

        {payroll.length === 0 && (
          <Empty text="No approved payroll awaiting payment" />
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
                  releasePayment(
                    "payroll",
                    p
                  )
                }

                disabled={
                  actionLoading ===
                  `payroll-${p.id}`
                }

                className="bg-green-600 hover:bg-green-700 px-6 py-3 rounded-xl disabled:opacity-50"

              >

                {actionLoading ===
                `payroll-${p.id}`

                  ? "Processing..."

                  : "Mark Paid"}

              </button>

            </div>

          </div>

        ))}

      </div>

    </div>

  );

}

// -----------------------------
// UI COMPONENTS
// -----------------------------

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