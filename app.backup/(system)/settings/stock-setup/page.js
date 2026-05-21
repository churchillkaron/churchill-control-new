"use client";

export const dynamic = "force-dynamic";

import React, { useState } from "react";
import { Boxes, Plus, Trash2, Upload, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function StockSetupFull() {
  const [items, setItems] = useState([
    { name: "", unit: "kg", quantity: "", warning: "5", critical: "2", cost: "" },
  ]);

  const addItem = () => {
    setItems([...items, { name: "", unit: "kg", quantity: "", warning: "5", critical: "2", cost: "" }]);
  };

  const updateItem = (index, field, value) => {
    const updated = [...items];
    updated[index][field] = value;
    setItems(updated);
  };

  const removeItem = (index) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleCSV = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const Papa = (await import("papaparse")).default;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsed = results.data.map((row) => ({
          name: row.Name || "",
          unit: row.Unit || "kg",
          quantity: row.Quantity || "",
          warning: row.Warning || "5",
          critical: row.Critical || "2",
          cost: row.Cost || "",
        }));
        setItems(parsed);
      },
    });
  };

  return (
    <main className="min-h-screen bg-[#070707] text-white relative">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,120,40,0.22),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(255,85,0,0.14),transparent_35%)]" />

      <section className="relative z-10 max-w-7xl mx-auto px-6 py-8">
        <header className="flex items-center justify-between mb-10">
          <div>
            <p className="text-sm text-orange-300 uppercase tracking-[0.3em]">System Setup</p>
            <h1 className="text-4xl font-semibold mt-2">Stock Setup</h1>
            <p className="text-white/55 mt-3">
              Manage ingredients and raw materials. This controls inventory, alerts, and cost.
            </p>
          </div>
        </header>

        <Card className="bg-white/[0.04] border-white/10 rounded-3xl">
          <CardContent className="p-6">

            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-3">
                <Boxes className="text-orange-400" />
                <h2 className="text-xl font-semibold">Ingredients</h2>
              </div>

              <div className="flex gap-3">
                <label className="bg-white/10 px-4 py-2 rounded-xl cursor-pointer flex items-center gap-2">
                  <Upload size={16} /> CSV
                  <input type="file" accept=".csv" onChange={handleCSV} className="hidden" />
                </label>

                <Button onClick={addItem} className="bg-orange-500 text-black">
                  <Plus size={16} className="mr-2" /> Add
                </Button>
              </div>
            </div>

            <div className="hidden md:grid grid-cols-[1.5fr_0.7fr_0.8fr_0.8fr_0.8fr_0.8fr_40px] gap-3 text-xs text-white/40 mb-3">
              <span>Name</span>
              <span>Unit</span>
              <span>Qty</span>
              <span>Warning</span>
              <span>Critical</span>
              <span>Cost</span>
              <span />
            </div>

            <div className="space-y-3">
              {items.map((item, index) => (
                <div key={index} className="grid grid-cols-1 md:grid-cols-[1.5fr_0.7fr_0.8fr_0.8fr_0.8fr_0.8fr_40px] gap-3 bg-white/5 p-3 rounded-xl">
                  <input value={item.name} onChange={(e) => updateItem(index, "name", e.target.value)} placeholder="Name" className="bg-transparent border border-white/10 rounded-lg px-3 py-2" />
                  <input value={item.unit} onChange={(e) => updateItem(index, "unit", e.target.value)} placeholder="Unit" className="bg-transparent border border-white/10 rounded-lg px-3 py-2" />
                  <input value={item.quantity} onChange={(e) => updateItem(index, "quantity", e.target.value)} placeholder="Qty" className="bg-transparent border border-white/10 rounded-lg px-3 py-2" />
                  <input value={item.warning} onChange={(e) => updateItem(index, "warning", e.target.value)} placeholder="Warn" className="bg-transparent border border-white/10 rounded-lg px-3 py-2" />
                  <input value={item.critical} onChange={(e) => updateItem(index, "critical", e.target.value)} placeholder="Critical" className="bg-transparent border border-white/10 rounded-lg px-3 py-2" />
                  <input value={item.cost} onChange={(e) => updateItem(index, "cost", e.target.value)} placeholder="Cost" className="bg-transparent border border-white/10 rounded-lg px-3 py-2" />
                  <button onClick={() => removeItem(index)} className="text-red-400"><Trash2 size={18} /></button>
                </div>
              ))}
            </div>

          </CardContent>
        </Card>

        <div className="mt-10 flex justify-end">
          <Button className="bg-orange-500 text-black h-12 px-6">
            Continue <ArrowRight className="ml-2" />
          </Button>
        </div>
      </section>
    </main>
  );
}
