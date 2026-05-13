"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/shared/supabase/client";

export default function PeriodClosePage() {
  const [periods, setPeriods] = useState([]);
  const [entities, setEntities] = useState([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    legal_entity_id: "",
    fiscal_year: new Date().getFullYear(),
    fiscal_month: new Date().getMonth() + 1,
    start_date: "",
    end_date: "",
    notes: "",
  });

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);

    const { data: periodData } = await supabase
      .from("accounting_periods")
      .select(`
        *,
        legal_entities (
          id,
          code,
          legal_name
        )
      `)
      .order("fiscal_year", { ascending: false })
      .order("fiscal_month", { ascending: false });

    const { data: entityData } = await supabase
      .from("legal_entities")
      .select("*")
      .eq("is_active", true)
      .order("legal_name");

    setPeriods(periodData || []);
    setEntities(entityData || []);
    setLoading(false);
  }

  async function createPeriod() {
    if (!form.fiscal_year || !form.fiscal_month || !form.start_date || !form.end_date) {
      alert("Year, month, start date and end date are required");
      return;
    }

    const { error } = await supabase.from("accounting_periods").insert([
      {
        legal_entity_id: form.legal_entity_id || null,
        fiscal_year: Number(form.fiscal_year),
        fiscal_month: Number(form.fiscal_month),
        start_date: form.start_date,
        end_date: form.end_date,
        status: "open",
        notes: form.notes,
      },
    ]);

    if (error) {
      alert(error.message);
      return;
    }

    setForm({
      legal_entity_id: "",
      fiscal_year: new Date().getFullYear(),
      fiscal_month: new Date().getMonth() + 1,
      start_date: "",
      end_date: "",
      notes: "",
    });

    await fetchData();
  }

  async function updateStatus(
  period,
  status
) {

  const response =
    await fetch(
      "/api/finance/periods/update-status",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({

          periodId:
            period.id,

          status,

          userId:
            "system",

        }),

      }
    );

  const result =
    await response.json();

  if (!response.ok) {

    alert(
      result.error ||
      "Failed to update period"
    );

    return;

  }

  await fetchData();

}

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white p-10">
        Loading accounting periods...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-10">
      <div className="mb-10">
        <h1 className="text-4xl font-bold">Period Close</h1>
        <div className="text-white/50 mt-2">
          Enterprise monthly accounting close control
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-10">
        <h2 className="text-2xl mb-6">Create Accounting Period</h2>

        <div className="grid grid-cols-3 gap-4">
          <select
            value={form.legal_entity_id}
            onChange={(e) => setForm({ ...form, legal_entity_id: e.target.value })}
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          >
            <option value="">All / Unassigned Entity</option>
            {entities.map((entity) => (
              <option key={entity.id} value={entity.id}>
                {entity.code} — {entity.legal_name}
              </option>
            ))}
          </select>

          <input
            type="number"
            placeholder="Fiscal Year"
            value={form.fiscal_year}
            onChange={(e) => setForm({ ...form, fiscal_year: e.target.value })}
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          />

          <input
            type="number"
            placeholder="Fiscal Month"
            value={form.fiscal_month}
            onChange={(e) => setForm({ ...form, fiscal_month: e.target.value })}
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          />

          <input
            type="date"
            value={form.start_date}
            onChange={(e) => setForm({ ...form, start_date: e.target.value })}
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          />

          <input
            type="date"
            value={form.end_date}
            onChange={(e) => setForm({ ...form, end_date: e.target.value })}
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          />
        </div>

        <textarea
          placeholder="Notes"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          className="bg-black border border-white/10 rounded-xl px-4 py-3 w-full mt-4 min-h-[100px]"
        />

        <button
          onClick={createPeriod}
          className="mt-6 bg-green-600 hover:bg-green-700 px-6 py-3 rounded-xl"
        >
          Create Period
        </button>
      </div>

      <h2 className="text-2xl mb-6">Accounting Periods</h2>

      {periods.length === 0 && <Empty text="No accounting periods created" />}

      {periods.map((period) => (
        <div
          key={period.id}
          className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-4"
        >
          <div className="flex justify-between items-start">
            <div>
              <div className="text-2xl font-semibold">
                {period.fiscal_month}/{period.fiscal_year}
              </div>

              <div className="text-white/40 mt-1">
                {period.legal_entities?.code || "ALL"} —{" "}
                {period.legal_entities?.legal_name || "Unassigned Entity"}
              </div>

              <div className="mt-4 space-y-1 text-white/70">
                <div>Start: {period.start_date}</div>
                <div>End: {period.end_date}</div>
                <div>Closed By: {period.closed_by || "-"}</div>
                <div>Closed At: {period.closed_at || "-"}</div>
              </div>
            </div>

            <div className="flex flex-col items-end gap-3">
              <div className="px-4 py-2 rounded-full text-sm bg-blue-600/20 text-blue-300">
                {period.status}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => updateStatus(period, "soft_closed")}
                  className="bg-yellow-600 hover:bg-yellow-700 px-4 py-2 rounded-xl"
                >
                  Soft Close
                </button>

                <button
                  onClick={() => updateStatus(period, "closed")}
                  className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-xl"
                >
                  Close
                </button>

                <button
                  onClick={() => updateStatus(period, "locked")}
                  className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-xl"
                >
                  Lock
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Empty({ text }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-white/40">
      {text}
    </div>
  );
}