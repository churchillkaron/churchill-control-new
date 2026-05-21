"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/shared/supabase/client";

export default function SalaryManagementPage() {

  const [staff, setStaff] = useState([]);
  const [confirmations, setConfirmations] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {

    setLoading(true);

    const { data: staffData } =
      await supabase
        .from("staff_accounts")
        .select("*");

    const { data: confirmationData } =
      await supabase
        .from("salary_confirmations")
        .select("*");

    const { data: decisionData } =
      await supabase
        .from("approval_rejections")
        .select("*");

    setStaff(staffData || []);
    setConfirmations(confirmationData || []);
    setDecisions(decisionData || []);

    setLoading(false);

  }

  // -----------------------------
  // HELPERS
  // -----------------------------

  function isConfirmed(staffMember) {

    return confirmations.some(
      (c) =>
        String(c.staff_id) ===
        String(staffMember.id)
    );

  }

  function getDecision(staffMember) {

    return decisions.find(
      (d) =>
        String(d.staff_id) ===
        String(staffMember.id)
    );

  }

  // -----------------------------
  // GOVERNED APPROVAL ACTION
  // -----------------------------

  async function handleApproval(
    staffMember
  ) {

    try {

      setActionLoading(
        `${staffMember.id}-approve`
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

              entityType:
                "payroll",

              entityId:
                staffMember.id,

              currentStatus:
                "pending_manager",

              role:
                "manager",

              actedBy:
                null,

              notes:
                "Salary approved by manager",

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
  // GOVERNED REJECTION ACTION
  // -----------------------------

  async function handleRejection(
    staffMember
  ) {

    try {

      setActionLoading(
        `${staffMember.id}-reject`
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

              entityType:
                "payroll",

              entityId:
                staffMember.id,

              currentStatus:
                "pending_manager",

              role:
                "manager",

              actedBy:
                null,

              reason:
                "Salary rejected by manager",

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
  // STATE GROUPING
  // -----------------------------

  const confirmedStaff =
    staff.filter(
      (s) =>
        isConfirmed(s) &&
        !getDecision(s)
    );

  const approvedStaff =
    staff.filter((s) => {

      const d =
        getDecision(s);

      return (
        d &&
        d.status ===
          "pending_accounting"
      );

    });

  const rejectedStaff =
    staff.filter((s) => {

      const d =
        getDecision(s);

      return (
        d &&
        d.status ===
          "rejected"
      );

    });

  const notConfirmedStaff =
    staff.filter(
      (s) =>
        !isConfirmed(s)
    );

  // -----------------------------
  // UI
  // -----------------------------

  if (loading) {

    return (
      <div className="text-white p-10">
        Loading...
      </div>
    );

  }

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <h1 className="text-3xl mb-8">
        Salary Governance
      </h1>

      {/* CONFIRMED */}
      <div className="mb-12">

        <h2 className="text-xl mb-4 text-green-400">
          Pending Manager Approval
        </h2>

        {confirmedStaff.length === 0 && (

          <div className="text-gray-500">
            No salary approvals pending
          </div>

        )}

        {confirmedStaff.map((s) => (

          <div
            key={s.id}
            className="bg-white/5 p-4 mb-3 rounded-xl flex justify-between items-center"
          >

            <div>

              <div className="text-lg">
                {s.name}
              </div>

              <div className="text-sm text-gray-400">
                {s.role}
              </div>

            </div>

            <div className="flex gap-2">

              <button

                onClick={() =>
                  handleApproval(s)
                }

                disabled={
                  actionLoading ===
                  `${s.id}-approve`
                }

                className="bg-green-600 px-4 py-2 rounded disabled:opacity-50"

              >

                {actionLoading ===
                `${s.id}-approve`

                  ? "Approving..."

                  : "Approve"}

              </button>

              <button

                onClick={() =>
                  handleRejection(s)
                }

                disabled={
                  actionLoading ===
                  `${s.id}-reject`
                }

                className="bg-red-600 px-4 py-2 rounded disabled:opacity-50"

              >

                {actionLoading ===
                `${s.id}-reject`

                  ? "Rejecting..."

                  : "Reject"}

              </button>

            </div>

          </div>

        ))}

      </div>

      {/* ACCOUNTING QUEUE */}
      <div className="mb-12">

        <h2 className="text-xl mb-4 text-blue-400">
          Pending Accounting
        </h2>

        {approvedStaff.length === 0 && (

          <div className="text-gray-500">
            No salary approvals in accounting queue
          </div>

        )}

        {approvedStaff.map((s) => (

          <div
            key={s.id}
            className="bg-white/5 p-4 mb-3 rounded-xl flex justify-between items-center"
          >

            <div>

              <div className="text-lg">
                {s.name}
              </div>

              <div className="text-sm text-gray-400">
                {s.role}
              </div>

            </div>

            <div className="text-blue-400 text-sm">
              Sent to Accounting
            </div>

          </div>

        ))}

      </div>

      {/* REJECTED */}
      <div className="mb-12">

        <h2 className="text-xl mb-4 text-red-400">
          Rejected
        </h2>

        {rejectedStaff.length === 0 && (

          <div className="text-gray-500">
            No rejected salaries
          </div>

        )}

        {rejectedStaff.map((s) => (

          <div
            key={s.id}
            className="bg-white/5 p-4 mb-3 rounded-xl flex justify-between items-center"
          >

            <div>

              <div className="text-lg">
                {s.name}
              </div>

              <div className="text-sm text-gray-400">
                {s.role}
              </div>

            </div>

            <div className="text-red-400 text-sm">
              Rejected
            </div>

          </div>

        ))}

      </div>

      {/* NOT CONFIRMED */}
      <div>

        <h2 className="text-xl mb-4 text-yellow-400">
          Awaiting Staff Confirmation
        </h2>

        {notConfirmedStaff.length === 0 && (

          <div className="text-gray-500">
            All staff confirmed
          </div>

        )}

        {notConfirmedStaff.map((s) => (

          <div
            key={s.id}
            className="bg-white/5 p-4 mb-3 rounded-xl flex justify-between items-center"
          >

            <div>

              <div className="text-lg">
                {s.name}
              </div>

              <div className="text-sm text-gray-400">
                {s.role}
              </div>

            </div>

            <div className="text-yellow-400 text-sm">
              Awaiting confirmation
            </div>

          </div>

        ))}

      </div>

    </div>

  );

}