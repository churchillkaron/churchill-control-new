"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/shared/supabase/client";

export default function VendorsPage() {

  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    legal_name: "",
    display_name: "",
    tax_id: "",
    email: "",
    phone: "",
    payment_terms: "",
    notes: "",
  });

  useEffect(() => {
    fetchVendors();
  }, []);

  async function fetchVendors() {

    setLoading(true);

    const { data, error } =
      await supabase
        .from("vendors")
        .select("*")
        .order("created_at", {
          ascending: false,
        });

    if (error) {
      console.error(error);
    }

    setVendors(data || []);
    setLoading(false);

  }

  async function createVendor() {

    if (!form.legal_name) {
      alert("Vendor legal name required");
      return;
    }

    const vendorCode =
      `V-${Date.now()}`;

    const { error } =
      await supabase
        .from("vendors")
        .insert([{

          vendor_code:
            vendorCode,

          legal_name:
            form.legal_name,

          display_name:
            form.display_name,

          tax_id:
            form.tax_id,

          email:
            form.email,

          phone:
            form.phone,

          payment_terms:
            form.payment_terms,

          notes:
            form.notes,

        }]);

    if (error) {

      console.error(error);
      alert(error.message);

      return;

    }

    setForm({
      legal_name: "",
      display_name: "",
      tax_id: "",
      email: "",
      phone: "",
      payment_terms: "",
      notes: "",
    });

    await fetchVendors();

  }

  async function toggleVendor(
    vendor
  ) {

    const { error } =
      await supabase
        .from("vendors")
        .update({
          is_active:
            !vendor.is_active,
        })
        .eq("id", vendor.id);

    if (error) {

      console.error(error);
      return;

    }

    await fetchVendors();

  }

  if (loading) {

    return (
      <div className="min-h-screen bg-black text-white p-10">
        Loading vendors...
      </div>
    );

  }

  return (

    <div className="min-h-screen bg-black text-white p-10">

      {/* HEADER */}
      <div className="mb-10">

        <h1 className="text-4xl font-bold">
          Vendor Registry
        </h1>

        <div className="text-white/50 mt-2">
          Enterprise supplier master data
        </div>

      </div>

      {/* CREATE */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-10">

        <h2 className="text-2xl mb-6">
          Create Vendor
        </h2>

        <div className="grid grid-cols-2 gap-4">

          <input
            placeholder="Legal Name"
            value={form.legal_name}
            onChange={(e) =>
              setForm({
                ...form,
                legal_name:
                  e.target.value,
              })
            }
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          />

          <input
            placeholder="Display Name"
            value={form.display_name}
            onChange={(e) =>
              setForm({
                ...form,
                display_name:
                  e.target.value,
              })
            }
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          />

          <input
            placeholder="Tax ID"
            value={form.tax_id}
            onChange={(e) =>
              setForm({
                ...form,
                tax_id:
                  e.target.value,
              })
            }
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          />

          <input
            placeholder="Email"
            value={form.email}
            onChange={(e) =>
              setForm({
                ...form,
                email:
                  e.target.value,
              })
            }
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          />

          <input
            placeholder="Phone"
            value={form.phone}
            onChange={(e) =>
              setForm({
                ...form,
                phone:
                  e.target.value,
              })
            }
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          />

          <input
            placeholder="Payment Terms"
            value={form.payment_terms}
            onChange={(e) =>
              setForm({
                ...form,
                payment_terms:
                  e.target.value,
              })
            }
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          />

        </div>

        <textarea
          placeholder="Notes"
          value={form.notes}
          onChange={(e) =>
            setForm({
              ...form,
              notes:
                e.target.value,
            })
          }
          className="bg-black border border-white/10 rounded-xl px-4 py-3 w-full mt-4 min-h-[120px]"
        />

        <button
          onClick={createVendor}
          className="mt-6 bg-green-600 hover:bg-green-700 px-6 py-3 rounded-xl"
        >
          Create Vendor
        </button>

      </div>

      {/* VENDOR LIST */}
      <div>

        <h2 className="text-2xl mb-6">
          Registered Vendors
        </h2>

        {vendors.length === 0 && (

          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-white/40">
            No vendors registered
          </div>

        )}

        {vendors.map((vendor) => (

          <div
            key={vendor.id}
            className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-4"
          >

            <div className="flex justify-between items-start">

              <div>

                <div className="text-2xl font-semibold">
                  {vendor.legal_name}
                </div>

                <div className="text-white/40 mt-1">
                  {vendor.vendor_code}
                </div>

                <div className="mt-4 space-y-1 text-white/70">

                  <div>
                    Tax ID:
                    {" "}
                    {vendor.tax_id || "-"}
                  </div>

                  <div>
                    Email:
                    {" "}
                    {vendor.email || "-"}
                  </div>

                  <div>
                    Phone:
                    {" "}
                    {vendor.phone || "-"}
                  </div>

                  <div>
                    Terms:
                    {" "}
                    {vendor.payment_terms || "-"}
                  </div>

                </div>

              </div>

              <div className="flex flex-col items-end">

                <div
                  className={`px-3 py-1 rounded-full text-sm ${
                    vendor.is_active
                      ? "bg-green-600/20 text-green-300"
                      : "bg-red-600/20 text-red-300"
                  }`}
                >

                  {vendor.is_active
                    ? "ACTIVE"
                    : "INACTIVE"}

                </div>

                <button

                  onClick={() =>
                    toggleVendor(vendor)
                  }

                  className="mt-4 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl"

                >

                  Toggle Status

                </button>

              </div>

            </div>

          </div>

        ))}

      </div>

    </div>

  );

}