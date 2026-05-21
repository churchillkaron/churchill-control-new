"use client";

export const dynamic = "force-dynamic";

import React, { useState } from "react";
import {
  ArrowRight,
  Factory,
  Package,
  Boxes,
  ClipboardList,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const emptyProduct = {
  name: "",
  category: "Production",
  unit: "pcs",
  sellingPrice: "",
  targetStock: "",
};

const emptyIngredient = {
  name: "",
  unit: "kg",
  quantity: "",
  warning: "5",
  critical: "2",
  cost: "",
};

const emptyRecipe = {
  product: "",
  ingredient: "",
  quantity: "",
  unit: "kg",
};

export default function ProductionSetupPage() {
  const [products, setProducts] = useState([emptyProduct]);
  const [ingredients, setIngredients] = useState([emptyIngredient]);
  const [recipes, setRecipes] = useState([emptyRecipe]);

  const parseCSV = async (file, mapper, setter) => {
    if (!file) return;

    const Papa = (await import("papaparse")).default;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data.map(mapper);
        setter(rows.length ? rows : []);
      },
    });
  };

  const updateRow = (setter, rows, index, field, value) => {
    const updated = [...rows];
    updated[index] = { ...updated[index], [field]: value };
    setter(updated);
  };

  const removeRow = (setter, rows, index) => {
    setter(rows.filter((_, i) => i !== index));
  };

  return (
    <main className="min-h-screen bg-[#070707] text-white relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,120,40,0.22),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(255,85,0,0.14),transparent_35%)]" />
      <div className="absolute inset-0 bg-black/40" />

      <section className="relative z-10 max-w-7xl mx-auto px-6 py-8">
        <header className="flex items-center justify-between mb-10">
          <div>
            <p className="text-sm text-orange-300 tracking-[0.3em] uppercase mb-2">
              System Setup
            </p>
            <h1 className="text-3xl md:text-5xl font-semibold tracking-tight">
              Production Setup
            </h1>
            <p className="text-white/55 mt-3 max-w-3xl">
              Define what you produce, what ingredients you use, and how recipes connect ingredients to finished products.
            </p>
          </div>

          <div className="hidden md:flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-400 shadow-[0_0_18px_rgba(251,146,60,0.9)]" />
            <span className="text-sm text-white/70">Production mode</span>
          </div>
        </header>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
          <div className="space-y-6">
            <Card className="bg-white/[0.04] border-white/10 rounded-3xl">
              <CardContent className="p-6">
                <SectionHeader
                  icon={Package}
                  title="Finished Products"
                  description="Products you produce and sell. Example: sauce batch, frozen meal, bakery item."
                  onAdd={() => setProducts([...products, emptyProduct])}
                  onCSV={(file) =>
                    parseCSV(
                      file,
                      (row) => ({
                        name: row.Name || row.Product || "",
                        category: row.Category || "Production",
                        unit: row.Unit || "pcs",
                        sellingPrice: row.SellingPrice || row.Price || "",
                        targetStock: row.TargetStock || "",
                      }),
                      setProducts
                    )
                  }
                />

                <div className="hidden md:grid grid-cols-[1.4fr_1fr_0.8fr_1fr_1fr_40px] gap-3 text-xs uppercase tracking-[0.2em] text-white/35 mb-3 px-1">
                  <span>Name</span>
                  <span>Category</span>
                  <span>Unit</span>
                  <span>Price</span>
                  <span>Target</span>
                  <span />
                </div>

                <div className="space-y-3">
                  {products.map((item, index) => (
                    <div key={index} className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr_0.8fr_1fr_1fr_40px] gap-3 bg-black/30 border border-white/10 p-3 rounded-2xl">
                      <Input value={item.name} placeholder="Product name" onChange={(v) => updateRow(setProducts, products, index, "name", v)} />
                      <Input value={item.category} placeholder="Category" onChange={(v) => updateRow(setProducts, products, index, "category", v)} />
                      <Input value={item.unit} placeholder="Unit" onChange={(v) => updateRow(setProducts, products, index, "unit", v)} />
                      <Input value={item.sellingPrice} placeholder="Price" onChange={(v) => updateRow(setProducts, products, index, "sellingPrice", v)} />
                      <Input value={item.targetStock} placeholder="Target" onChange={(v) => updateRow(setProducts, products, index, "targetStock", v)} />
                      <DeleteButton onClick={() => removeRow(setProducts, products, index)} />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white/[0.04] border-white/10 rounded-3xl">
              <CardContent className="p-6">
                <SectionHeader
                  icon={Boxes}
                  title="Ingredients / Raw Materials"
                  description="Raw stock used for production. This controls cost, inventory, and low-stock alerts."
                  onAdd={() => setIngredients([...ingredients, emptyIngredient])}
                  onCSV={(file) =>
                    parseCSV(
                      file,
                      (row) => ({
                        name: row.Name || row.Ingredient || "",
                        unit: row.Unit || "kg",
                        quantity: row.Quantity || row.Qty || "",
                        warning: row.Warning || "5",
                        critical: row.Critical || "2",
                        cost: row.Cost || "",
                      }),
                      setIngredients
                    )
                  }
                />

                <div className="hidden md:grid grid-cols-[1.4fr_0.7fr_0.8fr_0.8fr_0.8fr_0.8fr_40px] gap-3 text-xs uppercase tracking-[0.2em] text-white/35 mb-3 px-1">
                  <span>Name</span>
                  <span>Unit</span>
                  <span>Qty</span>
                  <span>Warning</span>
                  <span>Critical</span>
                  <span>Cost</span>
                  <span />
                </div>

                <div className="space-y-3">
                  {ingredients.map((item, index) => (
                    <div key={index} className="grid grid-cols-1 md:grid-cols-[1.4fr_0.7fr_0.8fr_0.8fr_0.8fr_0.8fr_40px] gap-3 bg-black/30 border border-white/10 p-3 rounded-2xl">
                      <Input value={item.name} placeholder="Ingredient" onChange={(v) => updateRow(setIngredients, ingredients, index, "name", v)} />
                      <Input value={item.unit} placeholder="Unit" onChange={(v) => updateRow(setIngredients, ingredients, index, "unit", v)} />
                      <Input value={item.quantity} placeholder="Qty" onChange={(v) => updateRow(setIngredients, ingredients, index, "quantity", v)} />
                      <Input value={item.warning} placeholder="Warn" onChange={(v) => updateRow(setIngredients, ingredients, index, "warning", v)} />
                      <Input value={item.critical} placeholder="Critical" onChange={(v) => updateRow(setIngredients, ingredients, index, "critical", v)} />
                      <Input value={item.cost} placeholder="Cost" onChange={(v) => updateRow(setIngredients, ingredients, index, "cost", v)} />
                      <DeleteButton onClick={() => removeRow(setIngredients, ingredients, index)} />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white/[0.04] border-white/10 rounded-3xl">
              <CardContent className="p-6">
                <SectionHeader
                  icon={ClipboardList}
                  title="Recipes / Bill of Materials"
                  description="Connect products to ingredients. This allows cost calculation and automatic stock deduction."
                  onAdd={() => setRecipes([...recipes, emptyRecipe])}
                  onCSV={(file) =>
                    parseCSV(
                      file,
                      (row) => ({
                        product: row.Product || row.Dish || "",
                        ingredient: row.Ingredient || "",
                        quantity: row.Quantity || row.Qty || "",
                        unit: row.Unit || "kg",
                      }),
                      setRecipes
                    )
                  }
                />

                <div className="hidden md:grid grid-cols-[1.3fr_1.3fr_0.8fr_0.8fr_40px] gap-3 text-xs uppercase tracking-[0.2em] text-white/35 mb-3 px-1">
                  <span>Product</span>
                  <span>Ingredient</span>
                  <span>Qty</span>
                  <span>Unit</span>
                  <span />
                </div>

                <div className="space-y-3">
                  {recipes.map((item, index) => (
                    <div key={index} className="grid grid-cols-1 md:grid-cols-[1.3fr_1.3fr_0.8fr_0.8fr_40px] gap-3 bg-black/30 border border-white/10 p-3 rounded-2xl">
                      <Input value={item.product} placeholder="Product" onChange={(v) => updateRow(setRecipes, recipes, index, "product", v)} />
                      <Input value={item.ingredient} placeholder="Ingredient" onChange={(v) => updateRow(setRecipes, recipes, index, "ingredient", v)} />
                      <Input value={item.quantity} placeholder="Qty" onChange={(v) => updateRow(setRecipes, recipes, index, "quantity", v)} />
                      <Input value={item.unit} placeholder="Unit" onChange={(v) => updateRow(setRecipes, recipes, index, "unit", v)} />
                      <DeleteButton onClick={() => removeRow(setRecipes, recipes, index)} />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <aside className="rounded-3xl bg-white/[0.06] border border-white/10 backdrop-blur-xl p-6 h-fit sticky top-8">
            <div className="w-14 h-14 rounded-2xl bg-orange-500 text-black flex items-center justify-center mb-5">
              <Factory size={28} />
            </div>

            <p className="text-sm text-orange-300 uppercase tracking-[0.25em] mb-3">
              Production logic
            </p>
            <h3 className="text-3xl font-semibold mb-4">Ingredients → Recipe → Product</h3>
            <p className="text-white/55 text-sm leading-6 mb-6">
              This setup creates the production engine. Ingredients decrease during production, finished products increase, and cost can be calculated automatically.
            </p>

            <div className="space-y-3 mb-8 text-sm">
              <div className="flex justify-between border-b border-white/10 pb-3">
                <span className="text-white/45">Finished products</span>
                <span className="text-white/85">{products.length}</span>
              </div>
              <div className="flex justify-between border-b border-white/10 pb-3">
                <span className="text-white/45">Ingredients</span>
                <span className="text-white/85">{ingredients.length}</span>
              </div>
              <div className="flex justify-between border-b border-white/10 pb-3">
                <span className="text-white/45">Recipe lines</span>
                <span className="text-white/85">{recipes.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/45">CSV import</span>
                <span className="text-white/85">Enabled</span>
              </div>
            </div>

            <div className="rounded-2xl bg-black/30 border border-white/10 p-4 mb-6">
              <h4 className="font-semibold text-orange-300 mb-3">CSV headers</h4>
              <div className="space-y-3 text-xs text-white/55 leading-5">
                <p><span className="text-white">Products:</span> Name, Category, Unit, Price, TargetStock</p>
                <p><span className="text-white">Ingredients:</span> Name, Unit, Quantity, Warning, Critical, Cost</p>
                <p><span className="text-white">Recipes:</span> Product, Ingredient, Quantity, Unit</p>
              </div>
            </div>

            <Button className="w-full h-14 rounded-2xl bg-orange-500 hover:bg-orange-400 text-black font-semibold text-base">
              Continue to Finance Setup
              <ArrowRight className="ml-2" size={18} />
            </Button>
          </aside>
        </div>
      </section>
    </main>
  );
}

function SectionHeader({ icon: Icon, title, description, onAdd, onCSV }) {
  return (
    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-6">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <Icon size={22} className="text-orange-300" />
          <h2 className="text-2xl font-semibold">{title}</h2>
        </div>
        <p className="text-sm text-white/50 max-w-2xl">{description}</p>
      </div>

      <div className="flex gap-3">
        <label className="h-11 px-4 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 cursor-pointer flex items-center gap-2 text-sm">
          <Upload size={16} /> CSV
          <input type="file" accept=".csv" onChange={(e) => onCSV(e.target.files?.[0])} className="hidden" />
        </label>

        <Button onClick={onAdd} className="h-11 rounded-xl bg-orange-500 hover:bg-orange-400 text-black">
          <Plus size={16} className="mr-2" /> Add
        </Button>
      </div>
    </div>
  );
}

function Input({ value, placeholder, onChange }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none text-white placeholder:text-white/30 focus:border-orange-400/60"
    />
  );
}

function DeleteButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="h-12 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 flex items-center justify-center hover:bg-red-500/20"
    >
      <Trash2 size={18} />
    </button>
  );
}
