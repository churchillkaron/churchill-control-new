"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";


export default function FinancePaymentsPage() {

  const [
    payables,
    setPayables,
  ] = useState([]);

  async function loadPayables() {

    const response =
      await fetch(
        "/api/finance/payments/list",
        {
          method: "POST",
        }
      );

    const result =
      await response.json();

    setPayables(
      result.payables || []
    );
  }

  async function processPayment(
    id
  ) {

    await fetch(
      "/api/finance/payments",
      {

        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({

          accounts_payable_id:
            id,

          payment_method:
            "BANK_TRANSFER",
        }),
      }
    );

    loadPayables();
  }

  useEffect(() => {

    loadPayables();

  }, []);

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <div className="max-w-7xl mx-auto">

        <h1 className="text-6xl font-bold mb-3">
          Vendor Payments
        </h1>

        <div className="text-zinc-500 mb-10">
          Treasury & Cash Management
        </div>

        <div className="space-y-4">

          {payables.map(
            (
              payable
            ) => (

              <div
                key={payable.id}
                className="border border-zinc-800 rounded-3xl p-6"
              >

                <div className="flex items-center justify-between">

                  <div>

                    <div className="text-2xl font-bold">
                      {
                        payable.vendors
                          ?.display_name
                      }
                    </div>

                    <div className="text-zinc-500 mt-2">
                      {
                        payable.status
                      }
                    </div>

                  </div>

                  <div className="flex items-center gap-6">

                    <div className="text-3xl font-bold">

                      ฿
                      {
                        payable.amount
                      }

                    </div>

                    <button
                      onClick={() =>
                        processPayment(
                          payable.id
                        )
                      }
                      className="bg-green-600 rounded-2xl px-6 py-3 font-bold"
                    >
                      PAY
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
