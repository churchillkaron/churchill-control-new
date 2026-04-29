"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Boxes,
  AlertTriangle,
  Plus,
  Trash2,
  Upload,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function StockControlSetup() {
  const router = useRouter();

  const [tenantId, setTenantId] = useState(null);
  const [loading, setLoading] = useState(false);

  const [items, setItems] = useState([
    { name: "", unit: "kg", quantity: "", warning: "5", critical: "2", cost: "" },
  ]);

  useEffect(() => {
    const loadTenant = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("staff_accounts")
        .select("tenant_id")
        .eq("user_id", user.id)
        .single();

      if (data?.tenant_id) setTenantId(data.tenant_id);
    };

    loadTenant();
  }, []);

  const updateItem = (i, field, value) => {
    const updated = [...items];
    updated[i][field] = value;
    setItems(updated);
  };

  const addItem = () => {
    setItems([
      ...items,
      { name: "", unit: "kg", quantity: "", warning: "5", critical: "2", cost: "" },
    ]);
  };

  const removeItem = (i) => {
    setItems(items.filter((_, idx) => idx !== i));
  };

  const handleCSV = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const Papa = (await import("papaparse")).default;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const parsed = res.data.map((r) => ({
          name: r.Name || "",
          unit: r.Unit || "kg",
          quantity: r.Quantity || "",
          warning: r.Warning || "5",
          critical: r.Critical || "2",
          cost: r.Cost || "",
        }));
        setItems(parsed);
      },
    });
  };

  const handleSave = async () => {
  if (loading) return;

  if (!tenantId) {
    alert("No tenant");
    return;
  }

  setLoading(true);

  try {
    // 🔥 CLEAN OLD DATA
    await supabase.from("ingredients").delete().eq("tenant_id", tenantId);

    // 🔥 INSERT INGREDIENTS
    const ingredientData = items
      .filter((item) => item.name)
      .map((item) => ({
        name: item.name,
        unit: item.unit,
        quantity: item.quantity,
        warning_level: item.warning,
        critical_level: item.critical,
        cost_per_unit: item.cost, // ✅ FIXED
        tenant_id: tenantId,
      }));

    if (ingredientData.length) {
      const { error } = await supabase.from("ingredients").insert(ingredientData);
      if (error) throw error;
    }

    // 🔥 UPDATE STEP
    const { error: stepError } = await supabase
      .from("tenants")
      .update({ setup_step: 7 })
      .eq("id", tenantId);

    if (stepError) throw stepError;

    router.push("/system-setup/step-7");

  } catch (err) {
    console.error("Stock setup error:", err);
    alert("Error saving inventory");
    setLoading(false);
  }
};

  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <section className="max-w-7xl mx-auto px-6 py-10">
        <header className="flex justify-between mb-10">
          <div>
            <p className="text-orange-400 uppercase tracking-[0.3em]">System Setup</p>
            <h1 className="text-5xl font-semibold">Stock Control</h1>
            <p className="text-white/60 mt-3">
              Define your ingredient inventory, cost and alert levels.
            </p>
          </div>
          <span className="text-white/60">Step 6 of 10</span>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">
          <div className="space-y-6">

            <Card className="bg-white/[0.04] border-white/10">
              <CardContent className="p-6">
                <div className="flex justify-between mb-6">
                  <h2 className="flex items-center gap-2"><Boxes /> Ingredients</h2>

                  <div className="flex gap-3">
                    <label className="bg-white/10 px-3 py-2 rounded-xl cursor-pointer">
                      CSV
                      <input type="file" onChange={handleCSV} hidden />
                    </label>

                    <Button onClick={addItem} className="bg-orange-500 text-black">
                      <Plus size={16} /> Add
                    </Button>
                  </div>
                </div>

                {items.map((item, i) => (
                  <div key={i} className="grid grid-cols-3 gap-3 mb-3">
                    <input value={item.name} onChange={(e) => updateItem(i, "name", e.target.value)} placeholder="Ingredient" className="bg-white/5 border border-white/10 p-2 rounded" />
                    <input value={item.unit} onChange={(e) => updateItem(i, "unit", e.target.value)} placeholder="Unit" className="bg-white/5 border border-white/10 p-2 rounded" />
                    <input value={item.quantity} onChange={(e) => updateItem(i, "quantity", e.target.value)} placeholder="Qty" className="bg-white/5 border border-white/10 p-2 rounded" />
                    <input value={item.warning} onChange={(e) => updateItem(i, "warning", e.target.value)} placeholder="Warning" className="bg-white/5 border border-white/10 p-2 rounded" />
                    <input value={item.critical} onChange={(e) => updateItem(i, "critical", e.target.value)} placeholder="Critical" className="bg-white/5 border border-white/10 p-2 rounded" />
                    <input value={item.cost} onChange={(e) => updateItem(i, "cost", e.target.value)} placeholder="Cost" className="bg-white/5 border border-white/10 p-2 rounded" />
                    <button onClick={() => removeItem(i)} className="text-red-400 col-span-3"><Trash2 /></button>
                  </div>
                ))}
              </CardContent>
            </Card>

          </div>

          <aside className="bg-white/[0.05] border border-white/10 p-6 rounded-3xl">
            <h3 className="text-xl mb-4">Inventory Logic</h3>

            <div className="text-sm text-white/60 space-y-2">
              <p>Items: {items.length}</p>
              <p className="text-orange-400">Recipes will deduct these automatically</p>
            </div>

            <Button onClick={handleSave} disabled={loading} className="w-full mt-6 bg-orange-500 text-black h-12">
              Continue
              <ArrowRight className="ml-2" />
            </Button>
          </aside>
        </div>
      </section>
    </main>
  );
}
