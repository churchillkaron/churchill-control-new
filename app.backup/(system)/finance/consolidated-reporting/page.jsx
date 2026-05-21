"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/shared/supabase/client";

export default function ConsolidatedReportingPage() {
  const [rows, setRows] = useState([]);
  const [selectedEntity, setSelectedEntity] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReport();
  }, []);

  async function fetchReport() {
    setLoading(true);

    const { data, error } = await supabase
      .from("consolidated_trial_balance_view")
      .select("*")
      .order("legal_entity_code", { ascending: true })
      .order("account_code", { ascending: true });

    if (error) {
      console.error(error);
      alert(error.message);
    }

    setRows(data || []);
    setLoading(false);
  }

  const entities = useMemo(() => {
    const map = {};

    rows.forEach((row) => {
      const key = row.legal_entity_id || "unassigned";

      if (!map[key]) {
        map[key] = {
          id: key,
          code: row.legal_entity_code || "UNASSIGNED",
          name: row.legal_name || "Unassigned Entity",
        };
      }
    });

    return Object.values(map);
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (selectedEntity === "all") return rows;

    return rows.filter((row) => {
      return (row.legal_entity_id || "unassigned") === selectedEntity;
    });
  }, [rows, selectedEntity]);

  const totals = useMemo(() => {
    const totalDebits = filteredRows.reduce(
      (sum, row) => sum + Number(row.total_debits || 0),
      0
    );

    const totalCredits = filteredRows.reduce(
      (sum, row) => sum + Number(row.total_credits || 0),
      0
    );

    return {
      totalDebits,
      totalCredits,
      difference: totalDebits - totalCredits,
    };
  }, [filteredRows]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white p-10">
        Loading consolidated reporting...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-10">
      <div className="mb-10">
        <h1 className="text-4xl font-bold">Consolidated Reporting</h1>
        <div className="text-white/50 mt-2">
          Holding-company and multi-entity financial reporting
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-10">
        <SummaryCard title="Entities" value={entities.length} plain />
        <SummaryCard title="Total Debits" value={totals.totalDebits} />
        <SummaryCard title="Total Credits" value={totals.totalCredits} />
        <SummaryCard
          title="Difference"
          value={totals.difference}
          danger={Math.abs(totals.difference) > 0.01}
        />
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-8">
        <label className="block text-white/50 text-sm mb-2">
          Legal Entity
        </label>

        <select
          value={selectedEntity}
          onChange={(e) => setSelectedEntity(e.target.value)}
          className="bg-black border border-white/10 rounded-xl px-4 py-3 w-full max-w-md"
        >
          <option value="all">All Entities</option>

          {entities.map((entity) => (
            <option key={entity.id} value={entity.id}>
              {entity.code} — {entity.name}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="grid grid-cols-7 gap-4 px-6 py-4 border-b border-white/10 text-white/50 text-sm">
          <div>Entity</div>
          <div>Account</div>
          <div>Name</div>
          <div>Category</div>
          <div className="text-right">Debits</div>
          <div className="text-right">Credits</div>
          <div className="text-right">Balance</div>
        </div>

        {filteredRows.length === 0 && (
          <div className="p-6 text-white/40">
            No consolidated ledger data found
          </div>
        )}

        {filteredRows.map((row, index) => (
          <div
            key={`${row.legal_entity_id || "none"}-${row.account_code}-${index}`}
            className="grid grid-cols-7 gap-4 px-6 py-4 border-b border-white/10 text-sm"
          >
            <div>{row.legal_entity_code || "UNASSIGNED"}</div>
            <div>{row.account_code}</div>
            <div>{row.account_name}</div>
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

function SummaryCard({ title, value, danger = false, plain = false }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
      <div className="text-white/50 text-sm">{title}</div>
      <div
        className={`text-3xl font-bold mt-2 ${
          danger ? "text-red-400" : "text-white"
        }`}
      >
        {plain ? value : `฿${Number(value || 0).toLocaleString()}`}
      </div>
    </div>
  );
}