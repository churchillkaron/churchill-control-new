"use client";

export const dynamic = "force-dynamic";

import {
  useEffect,
  useState,
} from "react";

import {
  useTenant,
} from "@/app/providers/TenantProvider";

export default function VendorsPage() {

  const tenant =
    useTenant();

  const tenantId =
    tenant?.id;

  const [
    vendors,
    setVendors,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    creating,
    setCreating,
  ] = useState(false);

  const [
    form,
    setForm,
  ] = useState({

    vendor_code: "",

    legal_name: "",

    display_name: "",

    tax_id: "",

    email: "",

    phone: "",

    address: "",

    payment_terms: "",

    notes: "",

  });

  async function loadVendors() {

    try {

      setLoading(true);

      const response =
        await fetch(
          "/api/procurement/vendors/list",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({

              tenant_id:
                tenantId,

            }),

          }
        );

      const result =
        await response.json();

      setVendors(
        result.vendors || []
      );

    } catch (error) {

      console.error(error);

    } finally {

      setLoading(false);

    }

  }

  async function createVendor() {

    try {

      setCreating(true);

      const response =
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
                tenantId,

              ...form,

            }),

          }
        );

      const result =
        await response.json();

      if (!result.success) {

        alert(
          result.error ||
          "Failed to create vendor"
        );

        return;

      }

      setForm({

        vendor_code: "",

        legal_name: "",

        display_name: "",

        tax_id: "",

        email: "",

        phone: "",

        address: "",

        payment_terms: "",

        notes: "",

      });

      loadVendors();

    } catch (error) {

      console.error(error);

    } finally {

      setCreating(false);

    }

  }

  useEffect(() => {

    if (!tenantId) {
      return;
    }

    loadVendors();

  }, [tenantId]);

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <div className="max-w-7xl mx-auto">

        <h1 className="text-6xl font-bold mb-3">
          Vendor Management
        </h1>

        <div className="text-zinc-500 mb-10">
          Enterprise Procurement Vendor Governance
        </div>

        <div className="border border-zinc-800 rounded-3xl p-8 mb-10">

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            <input
              placeholder="Vendor Code"
              value={
                form.vendor_code
              }
              onChange={(e) =>
                setForm({
                  ...form,
                  vendor_code:
                    e.target.value,
                })
              }
              className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4"
            />

            <input
              placeholder="Legal Name"
              value={
                form.legal_name
              }
              onChange={(e) =>
                setForm({
                  ...form,
                  legal_name:
                    e.target.value,
                })
              }
              className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4"
            />

            <input
              placeholder="Display Name"
              value={
                form.display_name
              }
              onChange={(e) =>
                setForm({
                  ...form,
                  display_name:
                    e.target.value,
                })
              }
              className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4"
            />

            <input
              placeholder="Tax ID"
              value={
                form.tax_id
              }
              onChange={(e) =>
                setForm({
                  ...form,
                  tax_id:
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

          </div>

          <textarea
            placeholder="Address"
            value={
              form.address
            }
            onChange={(e) =>
              setForm({
                ...form,
                address:
                  e.target.value,
              })
            }
            className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 w-full mt-4"
          />

          <textarea
            placeholder="Payment Terms / Notes"
            value={
              form.payment_terms
            }
            onChange={(e) =>
              setForm({
                ...form,
                payment_terms:
                  e.target.value,
              })
            }
            className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 w-full mt-4"
          />

          <button
            onClick={
              createVendor
            }
            disabled={
              creating
            }
            className="bg-white text-black rounded-2xl font-bold px-8 py-4 mt-6"
          >
            {
              creating
                ? "CREATING..."
                : "CREATE VENDOR"
            }
          </button>

        </div>

        <div className="space-y-4">

          {loading && (

            <div className="text-zinc-500">
              Loading vendors...
            </div>

          )}

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
                        vendor.display_name
                      }
                    </div>

                    <div className="text-zinc-500 mt-2">
                      {
                        vendor.legal_name
                      }
                    </div>

                    <div className="text-zinc-600 mt-2 text-sm">
                      {
                        vendor.vendor_code
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

                    <div className="text-zinc-600 mt-2 text-sm">
                      {
                        vendor.tax_id
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
