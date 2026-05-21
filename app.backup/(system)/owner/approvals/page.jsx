"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/shared/supabase/client";

export default function OwnerApprovalsPage() {

  const [invoices, setInvoices] = useState([]);
  const [payroll, setPayroll] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {

    setLoading(true);

    // INVOICES
    const { data: invoiceData } =
      await supabase
        .from("invoices")
        .select("*")
        .eq("status", "pending_owner")
        .order("created_at", {
          ascending: false,
        });

    // PAYROLL
    const { data: payrollData } =
      await supabase
        .from("approval_rejections")
        .select("*")
        .eq("status", "pending_owner")
        .order("created_at", {
          ascending: false,
        });

    setInvoices(invoiceData || []);
    setPayroll(payrollData || []);

    setLoading(false);

  }

  // -----------------------------
  // APPROVE
  // -----------------------------

  async function approveItem(
    entityType,
    item
  ) {

    try {

      setActionLoading(
        `${entityType}-${item.id}-approve`
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
                item.status,

              role:
                "owner",

              actedBy:
                null,

              notes:
                "Owner approval",

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
  // REJECT
  // -----------------------------

  async function rejectItem(
    entityType,
    item
  ) {

    try {

      setActionLoading(
        `${entityType}-${item.id}-reject`
      );

      const response =
        await fetch(

          "/api/approvals/reject",

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
                item.status,

              role:
                "owner",

              actedBy:
                null,

              reason:
                "Rejected by owner",

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

  const totalInvoiceAmount =
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
        Loading owner governance...
      </div>
    );

  }

  return (

    <div className="min-h-screen bg-black text-white p-10">

      {/* HEADER */}
      <div className="mb-10">

        <h1 className="text-4xl font-bold">
          Owner Governance
        </h1>

        <div className="text-white/50 mt-2">
          Final financial authority layer
        </div>

      </div>

      {/* SUMMARY */}
      <div className="grid grid-cols-3 gap-4 mb-10">

        <SummaryCard
          title="Pending Invoices"
          value={invoices.length}
        />

        <SummaryCard
          title="Pending Payroll"
          value={payroll.length}
        />

        <SummaryCard
          title="Invoice Exposure"
          value={`฿${totalInvoiceAmount.toLocaleString()}`}
        />

      </div>

      {/* INVOICES */}
      <div className="mb-16">

        <h2 className="text-2xl mb-6">
          Pending Owner Invoice Approvals
        </h2>

        {invoices.length === 0 && (

          <Empty text="No invoices pending owner approval" />

        )}

        {invoices.map((inv) => (

          <div
            key={inv.id}
            className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-4"
          >

            <div className="flex justify-between items-start">

              <div>

                <div className="text-xl font-semibold">
                  {inv.vendor || "Unknown Vendor"}
                </div>

                <div className="text-white/50 mt-1">
                  {inv.status}
                </div>

                <div className="mt-3 text-2xl">
                  ฿{Number(inv.total_amount || 0).toLocaleString()}
                </div>

              </div>

              <div className="flex gap-3">

                <button

                  onClick={() =>
                    approveItem(
                      "invoice",
                      inv
                    )
                  }

                  disabled={
                    actionLoading ===
                    `invoice-${inv.id}-approve`
                  }

                  className="bg-green-600 hover:bg-green-700 px-5 py-2 rounded-xl disabled:opacity-50"

                >

                  {actionLoading ===
                  `invoice-${inv.id}-approve`

                    ? "Approving..."

                    : "Approve"}

                </button>

                <button

                  onClick={() =>
                    rejectItem(
                      "invoice",
                      inv
                    )
                  }

                  disabled={
                    actionLoading ===
                    `invoice-${inv.id}-reject`
                  }

                  className="bg-red-600 hover:bg-red-700 px-5 py-2 rounded-xl disabled:opacity-50"

                >

                  {actionLoading ===
                  `invoice-${inv.id}-reject`

                    ? "Rejecting..."

                    : "Reject"}

                </button>

              </div>

            </div>

          </div>

        ))}

      </div>

      {/* PAYROLL */}
      <div>

        <h2 className="text-2xl mb-6">
          Pending Owner Payroll Approvals
        </h2>

        {payroll.length === 0 && (

          <Empty text="No payroll pending owner approval" />

        )}

        {payroll.map((p) => (

          <div
            key={p.id}
            className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-4"
          >

            <div className="flex justify-between items-center">

              <div>

                <div className="text-xl font-semibold">
                  Staff ID:
                  {" "}
                  {p.staff_id}
                </div>

                <div className="text-white/50 mt-1">
                  {p.status}
                </div>

              </div>

              <div className="flex gap-3">

                <button

                  onClick={() =>
                    approveItem(
                      "payroll",
                      p
                    )
                  }

                  disabled={
                    actionLoading ===
                    `payroll-${p.id}-approve`
                  }

                  className="bg-green-600 hover:bg-green-700 px-5 py-2 rounded-xl disabled:opacity-50"

                >

                  {actionLoading ===
                  `payroll-${p.id}-approve`

                    ? "Approving..."

                    : "Approve"}

                </button>

                <button

                  onClick={() =>
                    rejectItem(
                      "payroll",
                      p
                    )
                  }

                  disabled={
                    actionLoading ===
                    `payroll-${p.id}-reject`
                  }

                  className="bg-red-600 hover:bg-red-700 px-5 py-2 rounded-xl disabled:opacity-50"

                >

                  {actionLoading ===
                  `payroll-${p.id}-reject`

                    ? "Rejecting..."

                    : "Reject"}

                </button>

              </div>

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

      <div className="text-3xl mt-2 font-bold">
        {value}
      </div>

    </div>

  );

}

function Empty({
  text,
}) {

  return (

    <div className="text-white/40 bg-white/5 border border-white/10 rounded-2xl p-6">
      {text}
    </div>

  );

}