"use client";

export const dynamic = "force-dynamic";

import {
  useEffect,
  useState,
} from "react";

import {
  useSearchParams,
} from "next/navigation";

export default function ReceiptsPage() {

  const searchParams =
    useSearchParams();

  const [
    orderId,
    setOrderId,
  ] = useState("");

  const [
    receipt,
    setReceipt,
  ] = useState(null);

  useEffect(() => {

    const orderIdFromUrl =
      searchParams.get(
        "order_id"
      );

    if (
      orderIdFromUrl
    ) {

      setOrderId(
        orderIdFromUrl
      );

    }

  }, [searchParams]);

  useEffect(() => {

    if (
      orderId
    ) {

      loadReceipt();

    }

  }, [orderId]);

  async function loadReceipt() {

    const res =
      await fetch(
        `/api/pos/receipts?order_id=${orderId}`
      );

    const json =
      await res.json();

    setReceipt(
      json.receipt
    );

  }

  async function requestVoid(
    payment
  ) {

    const reason =
      prompt(
        "Void reason"
      );

    if (!reason)
      return;

    try {

      await fetch(
        "/api/pos/payments/void",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({

            payment,

            reason,

          }),

        }
      );

      alert(
        "Void request submitted"
      );

    } catch (err) {

      console.error(err);

      alert(
        err.message
      );

    }

  }

  return (

    <>

      <style jsx global>{`

        @media print {

          body {
            background: white !important;
            color: black !important;
          }

          button {
            display: none !important;
          }

        }

      `}</style>

      <div className="min-h-screen bg-black text-white p-10">

        <div className="max-w-4xl mx-auto">

          <h1 className="text-6xl font-bold mb-3">
            Receipt Engine
          </h1>

          <div className="text-zinc-500 mb-10">
            Universal POS Receipt System
          </div>

          <div className="flex gap-4 mb-10">

            <input
              value={orderId}
              onChange={(e) =>
                setOrderId(
                  e.target.value
                )
              }
              placeholder="Order ID"
              className="flex-1 bg-zinc-950 border border-zinc-800 rounded-2xl p-5"
            />

            <button
              onClick={
                loadReceipt
              }
              className="bg-white text-black rounded-2xl px-8"
            >
              LOAD
            </button>

          </div>

          {receipt && (

            <div>

              <div className="flex gap-4 mb-6">

                <button
                  onClick={() =>
                    window.print()
                  }
                  className="bg-white text-black rounded-2xl px-6 py-3 font-semibold"
                >

                  PRINT RECEIPT

                </button>

                <button
                  onClick={() => {

                    const receiptWindow =
                      window.open(
                        "",
                        "_blank"
                      );

                    receiptWindow.document.write(
                      document.documentElement.innerHTML
                    );

                    receiptWindow.document.close();

                    receiptWindow.print();

                  }}
                  className="bg-violet-500 text-white rounded-2xl px-6 py-3 font-semibold"
                >

                  PDF EXPORT

                </button>

              </div>

              <div className="border border-zinc-800 rounded-3xl p-8">

                <div className="text-3xl font-bold mb-2">
                  Churchill Receipt
                </div>

                <div className="text-zinc-500 mb-8">
                  {
                    receipt.receipt_number
                  }
                </div>

                <div className="space-y-3 mb-10">

                  {receipt.items?.map(
                    (
                      item,
                      index
                    ) => (

                      <div
                        key={index}
                        className="flex justify-between"
                      >

                        <div>

                          {item.seat_position && (
                            <span className="mr-2 font-black text-cyan-400">
                              S{item.seat_position}
                            </span>
                          )}

                          {
                            item.item_name
                          }{" "}
                          x
                          {
                            item.quantity
                          }

                        </div>

                        <div>
                          ฿
                          {
                            item.total
                          }
                        </div>

                      </div>

                    )
                  )}

                </div>

                <div className="border-t border-zinc-800 pt-6 space-y-3">

                  <div className="flex justify-between">
                    <div>Subtotal</div>
                    <div>
                      ฿
                      {
                        receipt.subtotal
                      }
                    </div>
                  </div>

                  <div className="flex justify-between">
                    <div>Discount</div>
                    <div>
                      ฿
                      {
                        receipt.discount
                      }
                    </div>
                  </div>

                  <div className="flex justify-between">
                    <div>Tax</div>
                    <div>
                      ฿
                      {
                        receipt.tax
                      }
                    </div>
                  </div>

                  <div className="flex justify-between">
                    <div>Service</div>
                    <div>
                      ฿
                      {
                        receipt.service_charge
                      }
                    </div>
                  </div>

                  <div className="flex justify-between text-2xl font-bold pt-4">

                    <div>Total</div>

                    <div>
                      ฿
                      {
                        receipt.total
                      }
                    </div>

                  </div>

                </div>

                <div className="mt-10 border-t border-zinc-800 pt-8">

                  <div className="text-2xl font-bold mb-6">

                    Payment Ledger

                  </div>

                  <div className="space-y-4">

                    {receipt.payment_breakdown?.map(
                      (
                        payment,
                        index
                      ) => (

                        <div
                          key={index}
                          className={`flex items-center justify-between rounded-2xl border p-4 ${
                            payment.method === "REVERSAL"
                              ? "border-red-500/30 bg-red-500/10"
                              : "border-zinc-800"
                          }`}
                        >

                          <div>

                            <div className="font-semibold">

                              {
                                payment.method
                              }

                            </div>

                            <div className="text-sm text-zinc-500">

                              {
                                payment.method === "REVERSAL"
                                  ? "REVERSAL ENTRY"
                                  : "PAYMENT ENTRY"
                              }

                            </div>

                            <div className="mt-2 text-xs text-zinc-600">

                              {
                                payment.created_at || ""
                              }

                            </div>

                          </div>

                          <div className="flex items-center gap-4">

                            <div className="text-xl font-bold">

                              ฿{
                                Number(
                                  payment.amount || 0
                                ).toLocaleString()
                              }

                            </div>

                            <button
                              onClick={() =>
                                requestVoid(
                                  payment
                                )
                              }
                              className="rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white"
                            >

                              VOID

                            </button>

                          </div>

                        </div>

                      )
                    )}

                  </div>

                </div>

              </div>

            </div>

          )}

        </div>

      </div>

    </>

  );

}
