"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/shared/supabase/client";

export default function TrialBalancePage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTrialBalance();
  }, []);

  async function fetchTrialBalance() {
    setLoading(true);

    const { data, error } = await supabase
      .from("trial_balance_view")
      .select("*")
      .order("code", { ascending: true });

    if (error) {
      console.error(error);
      alert(error.message);
    }

    setRows(data || []);
    setLoading(false);
  }

  const totals = useMemo(() => {
    const totalDebits = rows.reduce(
      (sum, row) => sum + Number(row.total_debits || 0),
      0
    );

    const totalCredits = rows.reduce(
      (sum, row) => sum + Number(row.total_credits || 0),
      0
    );

    return {
      totalDebits,
      totalCredits,
      difference: totalDebits - totalCredits,
    };
  }, [rows]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white p-10">
        Loading trial balance...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-10">
      <div className="mb-10">
        <h1 className="text-4xl font-bold">Trial Balance</h1>
        <div className="text-white/50 mt-2">
          Ledger integrity validation
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-10">
        <SummaryCard
          title="Total Debits"
          value={`฿${totals.totalDebits.toLocaleString()}`}
        />
        <SummaryCard
          title="Total Credits"
          value={`฿${totals.totalCredits.toLocaleString()}`}
        />
        <SummaryCard
          title="Difference"
          value={`฿${totals.difference.toLocaleString()}`}
          danger={Math.abs(totals.difference) > 0.01}
        />
      </div>

      {Math.abs(totals.difference) > 0.01 ? (
        <div className="mb-8 bg-red-600/20 border border-red-500/30 text-red-300 rounded-2xl p-6">
          Accounting integrity warning: debits and credits do not balance.
        </div>
      ) : (
        <div className="mb-8 bg-green-600/20 border border-green-500/30 text-green-300 rounded-2xl p-6">
          Ledger is balanced.
        </div>
      )}

      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="grid grid-cols-6 gap-4 px-6 py-4 border-b border-white/10 text-white/50 text-sm">
          <div>Code</div>
          <div>Account</div>
          <div>Category</div>
          <div className="text-right">Debits</div>
          <div className="text-right">Credits</div>
          <div className="text-right">Balance</div>
        </div>

        {rows.length === 0 && (
          <div className="p-6 text-white/40">
            No ledger data found
          </div>
        )}

        {rows.map((row) => (
          <div
            key={row.account_id}
            className="grid grid-cols-6 gap-4 px-6 py-4 border-b border-white/10 text-sm"
          >
            <div>{row.code}</div>
            <div>{row.name}</div>
            <div>{row.category}</div>
            <div className="text-right">
              ฿{Number(row.total_debits || 0).toLocaleString()}
            </div>
            <div className="text-right">
              ฿{Number(row.total_credits || 0).toLocaleString()}
            </div>
            <div className="text-right">
              ฿{Number(row.balance || 0).toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryCard({ title, value, danger = false }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
      <div className="text-white/50 text-sm">{title}</div>
      <div
        className={`text-3xl font-bold mt-2 ${
          danger ? "text-red-400" : "text-white"
        }`}
      >
        {value}
      </div>
    </div>
  );
}