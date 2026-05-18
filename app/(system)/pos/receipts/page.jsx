"use client";

import { useState } from "react";

export default function ReceiptsPage() {

  const [
    orderId,
    setOrderId,
  ] = useState("");

  const [
    receipt,
    setReceipt,
  ] = useState(null);

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

  return (

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
                      {
                        item.item_name
                      }
                      {" "}
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

          </div>
        )}

      </div>

    </div>
  );
}
