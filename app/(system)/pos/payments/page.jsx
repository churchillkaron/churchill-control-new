"use client";

import { useState } from "react";

export default function PaymentsPage() {

  const [
    form,
    setForm,
  ] = useState({

    order_id: "",

    payment_type:
      "CARD",

    amount_paid: "",

    reference_number: "",
  });

  const [
    response,
    setResponse,
  ] = useState(null);

  const [
    loading,
    setLoading,
  ] = useState(false);

  async function submitPayment() {

    try {

      setLoading(true);

      const res =
        await fetch(
          "/api/pos/payments",
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

      <div className="max-w-2xl mx-auto">

        <h1 className="text-6xl font-bold mb-3">
          POS Payments
        </h1>

        <div className="text-zinc-500 mb-10">
          Universal Payment Processing Engine
        </div>

        <div className="space-y-6">

          <input
            placeholder="Order ID"
            value={
              form.order_id
            }
            onChange={(e) =>
              setForm({

                ...form,

                order_id:
                  e.target.value,
              })
            }
            className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-5"
          />

          <select
            value={
              form.payment_type
            }
            onChange={(e) =>
              setForm({

                ...form,

                payment_type:
                  e.target.value,
              })
            }
            className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-5"
          >

            <option value="CASH">
              CASH
            </option>

            <option value="CARD">
              CARD
            </option>

            <option value="QR">
              QR
            </option>

            <option value="TRANSFER">
              TRANSFER
            </option>

          </select>

          <input
            placeholder="Amount Paid"
            value={
              form.amount_paid
            }
            onChange={(e) =>
              setForm({

                ...form,

                amount_paid:
                  e.target.value,
              })
            }
            className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-5"
          />

          <input
            placeholder="Reference Number"
            value={
              form.reference_number
            }
            onChange={(e) =>
              setForm({

                ...form,

                reference_number:
                  e.target.value,
              })
            }
            className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-5"
          />

          <button
            onClick={
              submitPayment
            }
            disabled={loading}
            className="w-full bg-white text-black rounded-2xl py-5 text-xl font-bold disabled:opacity-50"
          >

            {loading
              ? "PROCESSING..."
              : "PROCESS PAYMENT"}

          </button>

          {response && (

            <div className="border border-zinc-800 rounded-2xl p-6">

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

    </div>
  );
}
