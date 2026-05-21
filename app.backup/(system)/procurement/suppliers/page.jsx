"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/shared/supabase/client";

export default function SuppliersPage() {

  const [
    vendors,
    setVendors,
  ] = useState([]);

  const [
    ingredients,
    setIngredients,
  ] = useState([]);

  const [
    supplierPrices,
    setSupplierPrices,
  ] = useState([]);

  const [
    bestPrice,
    setBestPrice,
  ] = useState(null);

  const [
    form,
    setForm,
  ] = useState({

    vendor_id: "",

    ingredient_id: "",

    price: 0,

    minimum_order_quantity: 1,
  });

  async function loadData() {

    const [
      vendorsRes,
      ingredientsRes,
      pricesRes,
    ] = await Promise.all([

      supabase
        .from("vendors")
        .select("*")
        .order(
          "vendor_name",
          {
            ascending: true,
          }
        ),

      supabase
        .from("ingredients")
        .select("*")
        .order(
          "name",
          {
            ascending: true,
          }
        ),

      supabase
        .from("supplier_prices")
        .select(`
          *,
          vendors (
            vendor_name
          ),
          ingredients (
            name
          )
        `)
        .order(
          "created_at",
          {
            ascending: false,
          }
        ),
    ]);

    setVendors(
      vendorsRes.data || []
    );

    setIngredients(
      ingredientsRes.data || []
    );

    setSupplierPrices(
      pricesRes.data || []
    );
  }

  async function createPrice() {

    await fetch(
      "/api/procurement/suppliers",
      {

        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({

          tenant_id:
            "demo",

          ...form,
        }),
      }
    );

    loadData();
  }

  async function analyzeBestPrice(
    ingredient_id
  ) {

    const res =
      await fetch(
        "/api/procurement/suppliers",
        {

          method: "PUT",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({

            ingredient_id,
          }),
        }
      );

    const json =
      await res.json();

    setBestPrice(
      json.best_supplier
    );
  }

  useEffect(() => {

    loadData();

  }, []);

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <div className="max-w-7xl mx-auto">

        <h1 className="text-6xl font-bold mb-3">
          Supplier Pricing
        </h1>

        <div className="text-zinc-500 mb-10">
          Procurement Pricing Intelligence
        </div>

        <div className="border border-zinc-800 rounded-3xl p-8 mb-10">

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

            <select
              value={form.vendor_id}
              onChange={(e) =>
                setForm({

                  ...form,

                  vendor_id:
                    e.target.value,
                })
              }
              className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4"
            >

              <option value="">
                Vendor
              </option>

              {vendors.map(
                (
                  vendor
                ) => (

                  <option
                    key={vendor.id}
                    value={vendor.id}
                  >
                    {
                      vendor.vendor_name
                    }
                  </option>
                )
              )}

            </select>

            <select
              value={form.ingredient_id}
              onChange={(e) =>
                setForm({

                  ...form,

                  ingredient_id:
                    e.target.value,
                })
              }
              className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4"
            >

              <option value="">
                Ingredient
              </option>

              {ingredients.map(
                (
                  ingredient
                ) => (

                  <option
                    key={ingredient.id}
                    value={ingredient.id}
                  >
                    {
                      ingredient.name
                    }
                  </option>
                )
              )}

            </select>

            <input
              type="number"
              placeholder="Price"
              value={form.price}
              onChange={(e) =>
                setForm({

                  ...form,

                  price:
                    e.target.value,
                })
              }
              className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4"
            />

            <button
              onClick={
                createPrice
              }
              className="bg-white text-black rounded-2xl font-bold"
            >
              SAVE PRICE
            </button>

          </div>

        </div>

        {bestPrice && (

          <div className="border border-green-800 rounded-3xl p-6 mb-10">

            <div className="text-2xl font-bold">
              Best Supplier
            </div>

            <div className="mt-4">
              {
                bestPrice.vendors
                  ?.vendor_name
              }
            </div>

            <div className="text-green-400 mt-2">
              ฿
              {
                bestPrice.price
              }
            </div>

          </div>
        )}

        <div className="space-y-4">

          {supplierPrices.map(
            (
              item
            ) => (

              <div
                key={item.id}
                className="border border-zinc-800 rounded-3xl p-6"
              >

                <div className="flex items-center justify-between">

                  <div>

                    <div className="text-2xl font-bold">
                      {
                        item.ingredients
                          ?.name
                      }
                    </div>

                    <div className="text-zinc-500 mt-2">
                      {
                        item.vendors
                          ?.vendor_name
                      }
                    </div>

                  </div>

                  <div className="flex items-center gap-4">

                    <div className="text-right">

                      <div className="text-2xl">
                        ฿
                        {
                          item.price
                        }
                      </div>

                    </div>

                    <button
                      onClick={() =>
                        analyzeBestPrice(
                          item.ingredient_id
                        )
                      }
                      className="bg-zinc-900 border border-zinc-700 rounded-2xl px-4 py-2"
                    >
                      BEST PRICE
                    </button>

                  </div>

                </div>

              </div>
            )
          )}

        </div>

      </div>

    </div>
  );
}
