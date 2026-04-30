"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

export default function SalaryManagementPage() {
  const [staff, setStaff] = useState([]);
  const [confirmations, setConfirmations] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);

    const { data: staffData } = await supabase
      .from("staff_accounts")
      .select("*");

    const { data: confirmationData } = await supabase
      .from("salary_confirmations")
      .select("*");

    const { data: decisionData } = await supabase
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
      (c) => String(c.staff_id) === String(staffMember.id)
    );
  }

  function getDecision(staffMember) {
    return decisions.find(
      (d) => String(d.staff_id) === String(staffMember.id)
    );
  }

  async function handleDecision(staffMember, status) {
    const { error } = await supabase
      .from("approval_rejections")
      .insert([
        {
          staff_id: staffMember.id,
          status: status,
        },
      ]);

    if (error) {
      alert("Error: " + error.message);
      return;
    }

    fetchData();
  }

  // -----------------------------
  // STATE GROUPING
  // -----------------------------

  const confirmedStaff = staff.filter(
    (s) => isConfirmed(s) && !getDecision(s)
  );

  const approvedStaff = staff.filter((s) => {
    const d = getDecision(s);
    return d && d.status === "approved_manager";
  });

  const rejectedStaff = staff.filter((s) => {
    const d = getDecision(s);
    return d && d.status === "rejected_manager";
  });

  const notConfirmedStaff = staff.filter(
    (s) => !isConfirmed(s)
  );

  // -----------------------------
  // UI
  // -----------------------------

  if (loading) {
    return <div className="text-white p-10">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-black text-white p-10">
      <h1 className="text-3xl mb-8">Salary Management</h1>

      {/* CONFIRMED - NEED ACTION */}
      <div className="mb-12">
        <h2 className="text-xl mb-4 text-green-400">
          Confirmed (Needs Approval)
        </h2>

        {confirmedStaff.length === 0 && (
          <div className="text-gray-500">No staff pending approval</div>
        )}

        {confirmedStaff.map((s) => (
          <div
            key={s.id}
            className="bg-white/5 p-4 mb-3 rounded-xl flex justify-between items-center"
          >
            <div>
              <div className="text-lg">{s.name}</div>
              <div className="text-sm text-gray-400">{s.role}</div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => handleDecision(s, "approved_manager")}
                className="bg-green-600 px-4 py-2 rounded"
              >
                Approve
              </button>

              <button
                onClick={() => handleDecision(s, "rejected_manager")}
                className="bg-red-600 px-4 py-2 rounded"
              >
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* APPROVED */}
      <div className="mb-12">
        <h2 className="text-xl mb-4 text-blue-400">
          Approved (Sent to Accounting)
        </h2>

        {approvedStaff.length === 0 && (
          <div className="text-gray-500">No approved staff</div>
        )}

        {approvedStaff.map((s) => (
          <div
            key={s.id}
            className="bg-white/5 p-4 mb-3 rounded-xl flex justify-between items-center"
          >
            <div>
              <div className="text-lg">{s.name}</div>
              <div className="text-sm text-gray-400">{s.role}</div>
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
          <div className="text-gray-500">No rejected staff</div>
        )}

        {rejectedStaff.map((s) => (
          <div
            key={s.id}
            className="bg-white/5 p-4 mb-3 rounded-xl flex justify-between items-center"
          >
            <div>
              <div className="text-lg">{s.name}</div>
              <div className="text-sm text-gray-400">{s.role}</div>
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
          Not Confirmed
        </h2>

        {notConfirmedStaff.length === 0 && (
          <div className="text-gray-500">All staff confirmed</div>
        )}

        {notConfirmedStaff.map((s) => (
          <div
            key={s.id}
            className="bg-white/5 p-4 mb-3 rounded-xl flex justify-between items-center"
          >
            <div>
              <div className="text-lg">{s.name}</div>
              <div className="text-sm text-gray-400">{s.role}</div>
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