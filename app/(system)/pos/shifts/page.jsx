"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";

import {
  useTenant,
} from "@/app/providers/TenantProvider";

export default function ShiftPage() {

  const tenant =
    useTenant();

  const tenantId =
    tenant?.id;


  const [
    response,
    setResponse,
  ] = useState(null);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    openForm,
    setOpenForm,
  ] = useState({

    staff_id: "",

    staff_name: "",

    opening_cash: 0,
  });

  const [
    closeForm,
    setCloseForm,
  ] = useState({

    shift_id: "",

    closing_cash: 0,
  });

  async function openShift() {

    try {

      setLoading(true);

      const res =
        await fetch(
          "/api/pos/shifts",
          {

            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({

              action:
                "OPEN",

              tenant_id:
                tenantId,

              ...openForm,
            }),
          }
        );

      const json =
        await res.json();

      setResponse(
        json
      );

    } finally {

      setLoading(false);
    }
  }

  async function closeShift() {

    try {

      setLoading(true);

      const res =
        await fetch(
          "/api/pos/shifts",
          {

            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({

              action:
                "CLOSE",

              ...closeForm,
            }),
          }
        );

      const json =
        await res.json();

      setResponse(
        json
      );

    } finally {

      setLoading(false);
    }
  }

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <div className="max-w-5xl mx-auto">

        <h1 className="text-6xl font-bold mb-3">
          Shift Management
        </h1>

        <div className="text-zinc-500 mb-10">
          Cashier Session & POS Shift Control
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">

          <div className="border border-zinc-800 rounded-3xl p-8">

            <div className="text-3xl mb-6">
              Open Shift
            </div>

            <div className="space-y-4">

              <input
                placeholder="Staff ID"
                value={
                  openForm.staff_id
                }
                onChange={(e) =>
                  setOpenForm({

                    ...openForm,

                    staff_id:
                      e.target.value,
                  })
                }
                className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-4"
              />

              <input
                placeholder="Staff Name"
                value={
                  openForm.staff_name
                }
                onChange={(e) =>
                  setOpenForm({

                    ...openForm,

                    staff_name:
                      e.target.value,
                  })
                }
                className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-4"
              />

              <input
                placeholder="Opening Cash"
                type="number"
                value={
                  openForm.opening_cash
                }
                onChange={(e) =>
                  setOpenForm({

                    ...openForm,

                    opening_cash:
                      e.target.value,
                  })
                }
                className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-4"
              />

              <button
                onClick={
                  openShift
                }
                disabled={
                  loading
                }
                className="w-full bg-white text-black rounded-2xl py-4 font-bold"
              >
                OPEN SHIFT
              </button>

            </div>

          </div>

          <div className="border border-zinc-800 rounded-3xl p-8">

            <div className="text-3xl mb-6">
              Close Shift
            </div>

            <div className="space-y-4">

              <input
                placeholder="Shift ID"
                value={
                  closeForm.shift_id
                }
                onChange={(e) =>
                  setCloseForm({

                    ...closeForm,

                    shift_id:
                      e.target.value,
                  })
                }
                className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-4"
              />

              <input
                placeholder="Closing Cash"
                type="number"
                value={
                  closeForm.closing_cash
                }
                onChange={(e) =>
                  setCloseForm({

                    ...closeForm,

                    closing_cash:
                      e.target.value,
                  })
                }
                className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-4"
              />

              <button
                onClick={
                  closeShift
                }
                disabled={
                  loading
                }
                className="w-full bg-red-500 text-white rounded-2xl py-4 font-bold"
              >
                CLOSE SHIFT
              </button>

            </div>

          </div>

        </div>

        {response && (

          <div className="border border-zinc-800 rounded-3xl p-6 mt-10">

            <pre className="text-xs overflow-auto">
              {JSON.stringify(
                response,
                null,
                2
              )}
            </pre>

          </div>
        )}

      </div>

    </div>
  );
}
