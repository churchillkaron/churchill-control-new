"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/shared/supabase/client";

export default function VendorsPage() {

  const [
    vendors,
    setVendors,
  ] = useState([]);

  const [
    form,
    setForm,
  ] = useState({

    vendor_name: "",

    contact_name: "",

    phone: "",

    email: "",

    address: "",
  });

  async function loadVendors() {

    const {
      data,
    } = await supabase
      .from("vendors")
      .select("*")
      .order(
        "vendor_name",
        {
          ascending: true,
        }
      );

    setVendors(
      data || []
    );
  }

  async function createVendor() {

    await fetch(
      "/api/procurement/vendors",
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

    setForm({

      vendor_name: "",

      contact_name: "",

      phone: "",

      email: "",

      address: "",
    });

    loadVendors();
  }

  useEffect(() => {

    loadVendors();

  }, []);

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <div className="max-w-7xl mx-auto">

        <h1 className="text-6xl font-bold mb-3">
          Vendor Management
        </h1>

        <div className="text-zinc-500 mb-10">
          Supplier & Procurement Intelligence
        </div>

        <div className="border border-zinc-800 rounded-3xl p-8 mb-10">

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">

            <input
              placeholder="Vendor Name"
              value={
                form.vendor_name
              }
              onChange={(e) =>
                setForm({

                  ...form,

                  vendor_name:
                    e.target.value,
                })
              }
              className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4"
            />

            <input
              placeholder="Contact"
              value={
                form.contact_name
              }
              onChange={(e) =>
                setForm({

                  ...form,

                  contact_name:
                    e.target.value,
                })
              }
              className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4"
            />

            <input
              placeholder="Phone"
              value={
                form.phone
              }
              onChange={(e) =>
                setForm({

                  ...form,

                  phone:
                    e.target.value,
                })
              }
              className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4"
            />

            <input
              placeholder="Email"
              value={
                form.email
              }
              onChange={(e) =>
                setForm({

                  ...form,

                  email:
                    e.target.value,
                })
              }
              className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4"
            />

            <button
              onClick={
                createVendor
              }
              className="bg-white text-black rounded-2xl font-bold"
            >
              CREATE
            </button>

          </div>

        </div>

        <div className="space-y-4">

          {vendors.map(
            (
              vendor
            ) => (

              <div
                key={vendor.id}
                className="border border-zinc-800 rounded-3xl p-6"
              >

                <div className="flex items-center justify-between">

                  <div>

                    <div className="text-2xl font-bold">
                      {
                        vendor.vendor_name
                      }
                    </div>

                    <div className="text-zinc-500 mt-2">
                      {
                        vendor.contact_name
                      }
                    </div>

                  </div>

                  <div className="text-right">

                    <div>
                      {
                        vendor.phone
                      }
                    </div>

                    <div className="text-zinc-500 mt-2">
                      {
                        vendor.email
                      }
                    </div>

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
