"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/shared/supabase/client";

export default function CostCentersPage() {
  const [costCenters, setCostCenters] = useState([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    code: "",
    name: "",
    type: "",
    manager: "",
  });

  useEffect(() => {
    fetchCostCenters();
  }, []);

  async function fetchCostCenters() {
    setLoading(true);

    const { data, error } = await supabase
      .from("cost_centers")
      .select("*")
      .order("code", { ascending: true });

    if (error) {
      console.error(error);
      alert(error.message);
    }

    setCostCenters(data || []);
    setLoading(false);
  }

  async function createCostCenter() {
    if (!form.code || !form.name) {
      alert("Code and name are required");
      return;
    }

    const { error } = await supabase.from("cost_centers").insert([
      {
        code: form.code,
        name: form.name,
        type: form.type,
        manager: form.manager,
        is_active: true,
      },
    ]);

    if (error) {
      console.error(error);
      alert(error.message);
      return;
    }

    setForm({
      code: "",
      name: "",
      type: "",
      manager: "",
    });

    await fetchCostCenters();
  }

  async function toggleCostCenter(center) {
    const { error } = await supabase
      .from("cost_centers")
      .update({
        is_active: !center.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", center.id);

    if (error) {
      console.error(error);
      alert(error.message);
      return;
    }

    await fetchCostCenters();
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white p-10">
        Loading cost centers...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-10">
      <div className="mb-10">
        <h1 className="text-4xl font-bold">Cost Centers</h1>
        <div className="text-white/50 mt-2">
          Enterprise financial segmentation structure
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-10">
        <h2 className="text-2xl mb-6">Create Cost Center</h2>

        <div className="grid grid-cols-4 gap-4">
          <input
            placeholder="Code"
            value={form.code}
            onChange={(e) =>
              setForm({
                ...form,
                code: e.target.value,
              })
            }
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          />

          <input
            placeholder="Name"
            value={form.name}
            onChange={(e) =>
              setForm({
                ...form,
                name: e.target.value,
              })
            }
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          />

          <input
            placeholder="Type"
            value={form.type}
            onChange={(e) =>
              setForm({
                ...form,
                type: e.target.value,
              })
            }
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          />

          <input
            placeholder="Manager"
            value={form.manager}
            onChange={(e) =>
              setForm({
                ...form,
                manager: e.target.value,
              })
            }
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          />
        </div>

        <button
          onClick={createCostCenter}
          className="mt-6 bg-green-600 hover:bg-green-700 px-6 py-3 rounded-xl"
        >
          Create Cost Center
        </button>
      </div>

      <h2 className="text-2xl mb-6">Registered Cost Centers</h2>

      {costCenters.length === 0 && <Empty text="No cost centers created" />}

      {costCenters.map((center) => (
        <div
          key={center.id}
          className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-4"
        >
          <div className="flex justify-between items-start">
            <div>
              <div className="text-2xl font-semibold">{center.name}</div>
              <div className="text-white/40 mt-1">{center.code}</div>

              <div className="mt-4 space-y-1 text-white/70">
                <div>Type: {center.type || "-"}</div>
                <div>Manager: {center.manager || "-"}</div>
              </div>
            </div>

            <div className="flex flex-col items-end">
              <div
                className={`px-4 py-2 rounded-full text-sm ${
                  center.is_active
                    ? "bg-green-600/20 text-green-300"
                    : "bg-red-600/20 text-red-300"
                }`}
              >
                {center.is_active ? "ACTIVE" : "INACTIVE"}
              </div>

              <button
                onClick={() => toggleCostCenter(center)}
                className="mt-4 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl"
              >
                Toggle Status
              </button>
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