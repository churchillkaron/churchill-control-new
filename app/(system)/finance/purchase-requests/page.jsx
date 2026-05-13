"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/shared/supabase/client";

export default function PurchaseRequestsPage() {

  const [requests, setRequests] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    title: "",
    description: "",
    department: "",
    priority: "normal",
    estimated_cost: "",
    vendor_id: "",
    needed_by: "",
    notes: "",
  });

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {

    setLoading(true);

    const { data: requestData } =
      await supabase
        .from("purchase_requests")
        .select(`
          *,
          vendors (
            id,
            legal_name
          )
        `)
        .order("created_at", {
          ascending: false,
        });

    const { data: vendorData } =
      await supabase
        .from("vendors")
        .select("*")
        .eq("is_active", true)
        .order("legal_name");

    setRequests(requestData || []);
    setVendors(vendorData || []);

    setLoading(false);

  }

  async function createRequest() {

    if (!form.title) {
      alert("Title required");
      return;
    }

    const requestNumber =
      `PR-${Date.now()}`;

    const { error } =
      await supabase
        .from("purchase_requests")
        .insert([{

          request_number:
            requestNumber,

          title:
            form.title,

          description:
            form.description,

          department:
            form.department,

          priority:
            form.priority,

          estimated_cost:
            Number(
              form.estimated_cost || 0
            ),

          vendor_id:
            form.vendor_id || null,

          needed_by:
            form.needed_by || null,

          notes:
            form.notes,

          requested_by:
            "system",

          status:
            "pending_manager",

        }]);

    if (error) {

      console.error(error);
      alert(error.message);

      return;

    }

    setForm({
      title: "",
      description: "",
      department: "",
      priority: "normal",
      estimated_cost: "",
      vendor_id: "",
      needed_by: "",
      notes: "",
    });

    await fetchData();

  }

  if (loading) {

    return (
      <div className="min-h-screen bg-black text-white p-10">
        Loading purchase requests...
      </div>
    );

  }

  return (

    <div className="min-h-screen bg-black text-white p-10">

      {/* HEADER */}
      <div className="mb-10">

        <h1 className="text-4xl font-bold">
          Purchase Requests
        </h1>

        <div className="text-white/50 mt-2">
          Enterprise procurement request system
        </div>

      </div>

      {/* CREATE */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-10">

        <h2 className="text-2xl mb-6">
          Create Purchase Request
        </h2>

        <div className="grid grid-cols-2 gap-4">

          <input
            placeholder="Request Title"
            value={form.title}
            onChange={(e) =>
              setForm({
                ...form,
                title:
                  e.target.value,
              })
            }
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          />

          <input
            placeholder="Department"
            value={form.department}
            onChange={(e) =>
              setForm({
                ...form,
                department:
                  e.target.value,
              })
            }
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          />

          <select
            value={form.priority}
            onChange={(e) =>
              setForm({
                ...form,
                priority:
                  e.target.value,
              })
            }
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          >

            <option value="low">
              Low
            </option>

            <option value="normal">
              Normal
            </option>

            <option value="high">
              High
            </option>

            <option value="critical">
              Critical
            </option>

          </select>

          <input
            type="number"
            placeholder="Estimated Cost"
            value={form.estimated_cost}
            onChange={(e) =>
              setForm({
                ...form,
                estimated_cost:
                  e.target.value,
              })
            }
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          />

          <select
            value={form.vendor_id}
            onChange={(e) =>
              setForm({
                ...form,
                vendor_id:
                  e.target.value,
              })
            }
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          >

            <option value="">
              Select Vendor
            </option>

            {vendors.map((vendor) => (

              <option
                key={vendor.id}
                value={vendor.id}
              >

                {vendor.legal_name}

              </option>

            ))}

          </select>

          <input
            type="date"
            value={form.needed_by}
            onChange={(e) =>
              setForm({
                ...form,
                needed_by:
                  e.target.value,
              })
            }
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          />

        </div>

        <textarea
          placeholder="Description"
          value={form.description}
          onChange={(e) =>
            setForm({
              ...form,
              description:
                e.target.value,
            })
          }
          className="bg-black border border-white/10 rounded-xl px-4 py-3 w-full mt-4 min-h-[120px]"
        />

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
          className="bg-black border border-white/10 rounded-xl px-4 py-3 w-full mt-4 min-h-[100px]"
        />

        <button
          onClick={createRequest}
          className="mt-6 bg-green-600 hover:bg-green-700 px-6 py-3 rounded-xl"
        >
          Create Request
        </button>

      </div>

      {/* REQUESTS */}
      <div>

        <h2 className="text-2xl mb-6">
          Procurement Requests
        </h2>

        {requests.length === 0 && (

          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-white/40">
            No purchase requests
          </div>

        )}

        {requests.map((request) => (

          <div
            key={request.id}
            className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-4"
          >

            <div className="flex justify-between items-start">

              <div>

                <div className="text-2xl font-semibold">
                  {request.title}
                </div>

                <div className="text-white/40 mt-1">
                  {request.request_number}
                </div>

                <div className="mt-4 space-y-1 text-white/70">

                  <div>
                    Department:
                    {" "}
                    {request.department || "-"}
                  </div>

                  <div>
                    Vendor:
                    {" "}
                    {request.vendors?.legal_name || "-"}
                  </div>

                  <div>
                    Estimated Cost:
                    {" "}
                    ฿{Number(
                      request.estimated_cost || 0
                    ).toLocaleString()}
                  </div>

                  <div>
                    Needed By:
                    {" "}
                    {request.needed_by || "-"}
                  </div>

                </div>

              </div>

              <div className="flex flex-col items-end">

                <div className="px-3 py-1 rounded-full text-sm bg-blue-600/20 text-blue-300">

                  {request.status}

                </div>

                <div className="mt-4 text-sm text-white/50">

                  {request.priority}

                </div>

              </div>

            </div>

          </div>

        ))}

      </div>

    </div>

  );

}