"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Package,
  ClipboardList,
  Plus,
  Trash2,
  Upload,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/shared/supabase/client";

export default function ProductsRecipesSetup() {
  const router = useRouter();

  const [tenantId, setTenantId] = useState(null);
  const [loading, setLoading] = useState(false);

  const [products, setProducts] = useState([
    { name: "", price: "", category: "Food" },
  ]);

  const [recipes, setRecipes] = useState([
    { product: "", ingredient: "", quantity: "" },
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

  const updateProduct = (i, field, value) => {
    const updated = [...products];
    updated[i][field] = value;
    setProducts(updated);
  };

  const addProduct = () => {
    setProducts([...products, { name: "", price: "", category: "Food" }]);
  };

  const removeProduct = (i) => {
    setProducts(products.filter((_, idx) => idx !== i));
  };

  const updateRecipe = (i, field, value) => {
    const updated = [...recipes];
    updated[i][field] = value;
    setRecipes(updated);
  };

  const addRecipe = () => {
    setRecipes([...recipes, { product: "", ingredient: "", quantity: "" }]);
  };

  const removeRecipe = (i) => {
    setRecipes(recipes.filter((_, idx) => idx !== i));
  };

  const handleCSVProducts = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const Papa = (await import("papaparse")).default;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const parsed = res.data.map((r) => ({
          name: r.Name || "",
          price: r.Price || "",
          category: r.Category || "Food",
        }));
        setProducts(parsed);
      },
    });
  };

  const handleCSVRecipes = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const Papa = (await import("papaparse")).default;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const parsed = res.data.map((r) => ({
          product: r.Product || "",
          ingredient: r.Ingredient || "",
          quantity: r.Quantity || "",
        }));
        setRecipes(parsed);
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
    await supabase.from("products").delete().eq("tenant_id", tenantId);
    await supabase.from("recipes").delete().eq("tenant_id", tenantId);

    // 🔥 INSERT PRODUCTS
    const productData = products
      .filter((p) => p.name)
      .map((p) => ({
        name: p.name,
        price: p.price,
        category: p.category,
        tenant_id: tenantId,
      }));

    if (productData.length) {
      const { error } = await supabase.from("products").insert(productData);
      if (error) throw error;
    }

    // 🔥 INSERT RECIPES
    const recipeData = recipes
      .filter((r) => r.product && r.ingredient)
      .map((r) => ({
        product_name: r.product,
        ingredient_name: r.ingredient,
        quantity: r.quantity,
        tenant_id: tenantId,
      }));

    if (recipeData.length) {
      const { error } = await supabase.from("recipes").insert(recipeData);
      if (error) throw error;
    }

    // 🔥 UPDATE STEP
    const { error: stepError } = await supabase
      .from("tenants")
      .update({ setup_step: 6 })
      .eq("id", tenantId);

    if (stepError) throw stepError;

    router.push("/system-setup/step-6");

  } catch (err) {
    console.error("Product setup error:", err);
    alert("Error saving products");
    setLoading(false);
  }
};
  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <section className="max-w-7xl mx-auto px-6 py-10">
        <header className="flex justify-between mb-10">
          <div>
            <p className="text-orange-400 uppercase tracking-[0.3em]">System Setup</p>
            <h1 className="text-5xl font-semibold">Products & Recipes</h1>
            <p className="text-white/60 mt-3">
              First create your dishes/products. Then connect ingredients to EACH dish.
            </p>
          </div>
          <span className="text-white/60">Step 5 of 10</span>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">
          <div className="space-y-6">

            {/* PRODUCTS */}
            <Card className="bg-white/[0.04] border-white/10">
              <CardContent className="p-6">
                <div className="flex justify-between mb-6">
                  <h2 className="flex items-center gap-2"><Package /> Dishes / Products</h2>

                  <div className="flex gap-3">
                    <label className="bg-white/10 px-3 py-2 rounded-xl cursor-pointer">
                      CSV
                      <input type="file" onChange={handleCSVProducts} hidden />
                    </label>

                    <Button onClick={addProduct} className="bg-orange-500 text-black">
                      <Plus size={16} /> Add
                    </Button>
                  </div>
                </div>

                {products.map((p, i) => (
                  <div key={i} className="grid grid-cols-3 gap-3 mb-3">
                    <input value={p.name} onChange={(e) => updateProduct(i, "name", e.target.value)} placeholder="Dish Name" className="bg-white/5 border border-white/10 p-2 rounded" />
                    <input value={p.price} onChange={(e) => updateProduct(i, "price", e.target.value)} placeholder="Price" className="bg-white/5 border border-white/10 p-2 rounded" />
                    <input value={p.category} onChange={(e) => updateProduct(i, "category", e.target.value)} placeholder="Category" className="bg-white/5 border border-white/10 p-2 rounded" />
                    <button onClick={() => removeProduct(i)} className="text-red-400 col-span-3"><Trash2 /></button>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* RECIPES */}
            <Card className="bg-white/[0.04] border-white/10">
              <CardContent className="p-6">
                <div className="flex justify-between mb-6">
                  <h2 className="flex items-center gap-2"><ClipboardList /> Recipes (per dish)</h2>

                  <div className="flex gap-3">
                    <label className="bg-white/10 px-3 py-2 rounded-xl cursor-pointer">
                      CSV
                      <input type="file" onChange={handleCSVRecipes} hidden />
                    </label>

                    <Button onClick={addRecipe} className="bg-orange-500 text-black">
                      <Plus size={16} /> Add
                    </Button>
                  </div>
                </div>

                {recipes.map((r, i) => (
                  <div key={i} className="grid grid-cols-3 gap-3 mb-3">
                    <input value={r.product} onChange={(e) => updateRecipe(i, "product", e.target.value)} placeholder="Dish (must match product)" className="bg-white/5 border border-white/10 p-2 rounded" />
                    <input value={r.ingredient} onChange={(e) => updateRecipe(i, "ingredient", e.target.value)} placeholder="Ingredient" className="bg-white/5 border border-white/10 p-2 rounded" />
                    <input value={r.quantity} onChange={(e) => updateRecipe(i, "quantity", e.target.value)} placeholder="Qty" className="bg-white/5 border border-white/10 p-2 rounded" />
                    <button onClick={() => removeRecipe(i)} className="text-red-400 col-span-3"><Trash2 /></button>
                  </div>
                ))}
              </CardContent>
            </Card>

          </div>

          <aside className="bg-white/[0.05] border border-white/10 p-6 rounded-3xl">
            <h3 className="text-xl mb-4">System Logic</h3>

            <div className="text-sm text-white/60 space-y-2">
              <p>Products: {products.length}</p>
              <p>Recipe lines: {recipes.length}</p>
              <p className="text-orange-400">Each recipe MUST connect to a dish</p>
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
