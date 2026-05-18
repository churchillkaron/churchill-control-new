"use client";

import { useMemo, useState } from "react";

import {
  POS_TYPES,
  ORDER_TYPES,
  PAYMENT_TYPES,
} from "@/lib/pos/core/POS_TYPES";

import calculateOrderTotals from "@/lib/pos/orders/calculateOrderTotals";

const DEMO_PRODUCTS = [
  {
    id: 1,
    name: "Burger",
    price: 299,
    category: "Food",
  },
  {
    id: 2,
    name: "Pizza",
    price: 450,
    category: "Food",
  },
  {
    id: 3,
    name: "Beer",
    price: 180,
    category: "Drinks",
  },
  {
    id: 4,
    name: "Coffee",
    price: 120,
    category: "Cafe",
  },
  {
    id: 5,
    name: "T-Shirt",
    price: 790,
    category: "Retail",
  },
];

export default function UniversalPOSPage() {

  const [cart, setCart] =
    useState([]);

  const [posType, setPosType] =
    useState(
      POS_TYPES.RESTAURANT
    );

  const [orderType, setOrderType] =
    useState(
      ORDER_TYPES.DINE_IN
    );

  const [paymentType, setPaymentType] =
    useState(
      PAYMENT_TYPES.CARD
    );

  const [
    customerName,
    setCustomerName,
  ] = useState("");

  const [
    tableNumber,
    setTableNumber,
  ] = useState("");

  const [loading, setLoading] =
    useState(false);

  const [response, setResponse] =
    useState(null);

  function addItem(product) {

    setCart((prev) => {

      const existing =
        prev.find(
          (item) =>
            item.id === product.id
        );

      if (existing) {

        return prev.map((item) => {

          if (
            item.id === product.id
          ) {

            return {

              ...item,

              quantity:
                item.quantity + 1,
            };
          }

          return item;
        });
      }

      return [
        ...prev,
        {
          ...product,
          quantity: 1,
        },
      ];
    });
  }

  function updateQuantity(
    id,
    change
  ) {

    setCart((prev) =>
      prev
        .map((item) => {

          if (item.id === id) {

            return {

              ...item,

              quantity:
                item.quantity + change,
            };
          }

          return item;
        })
        .filter(
          (item) =>
            item.quantity > 0
        )
    );
  }

  const totals = useMemo(() => {

    return calculateOrderTotals({

      items:
        cart.map((item) => ({

          quantity:
            item.quantity,

          price:
            item.price,
        })),

      discount: 0,

      taxRate: 7,

      serviceChargeRate:
        posType ===
        POS_TYPES.RESTAURANT
          ? 5
          : 0,
    });

  }, [cart, posType]);

  async function submitOrder() {

    try {

      setLoading(true);

      const payload = {

        tenant_id:
          "demo",

        order: {

          pos_type:
            posType,

          order_type:
            orderType,

          payment_type:
            paymentType,

          customer_name:
            customerName,

          table_number:
            tableNumber,

          taxRate: 7,

          serviceChargeRate:
            posType ===
            POS_TYPES.RESTAURANT
              ? 5
              : 0,

          items:
            cart.map((item) => ({

              name:
                item.name,

              quantity:
                item.quantity,

              price:
                item.price,
            })),
        },
      };

      const res =
        await fetch(
          "/api/pos/core",
          {

            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify(
                payload
              ),
          }
        );

      const json =
        await res.json();

      setResponse(json);

      if (json.success) {

        setCart([]);
      }

    } finally {

      setLoading(false);
    }
  }

  return (

    <div className="min-h-screen bg-black text-white">

      <div className="grid grid-cols-12 min-h-screen">

        <div className="col-span-8 border-r border-zinc-900 p-8">

          <div className="mb-8">

            <h1 className="text-5xl font-bold">
              Churchill POS
            </h1>

            <div className="text-zinc-500 mt-2">
              Universal Enterprise POS
            </div>

          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-6">

            {DEMO_PRODUCTS.map((product) => (

              <button
                key={product.id}
                onClick={() =>
                  addItem(product)
                }
                className="border border-zinc-800 rounded-3xl p-6 text-left hover:border-white transition"
              >

                <div className="text-2xl mb-3">
                  {product.name}
                </div>

                <div className="text-zinc-500 mb-4">
                  {product.category}
                </div>

                <div className="text-3xl">
                  ฿{product.price}
                </div>

              </button>
            ))}

          </div>

        </div>

        <div className="col-span-4 p-8">

          <div className="space-y-6">

            <select
              value={posType}
              onChange={(e) =>
                setPosType(
                  e.target.value
                )
              }
              className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-4"
            >

              {Object.values(
                POS_TYPES
              ).map((type) => (

                <option
                  key={type}
                  value={type}
                >
                  {type}
                </option>
              ))}

            </select>

            <select
              value={orderType}
              onChange={(e) =>
                setOrderType(
                  e.target.value
                )
              }
              className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-4"
            >

              {Object.values(
                ORDER_TYPES
              ).map((type) => (

                <option
                  key={type}
                  value={type}
                >
                  {type}
                </option>
              ))}

            </select>

            <select
              value={paymentType}
              onChange={(e) =>
                setPaymentType(
                  e.target.value
                )
              }
              className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-4"
            >

              {Object.values(
                PAYMENT_TYPES
              ).map((type) => (

                <option
                  key={type}
                  value={type}
                >
                  {type}
                </option>
              ))}

            </select>

            <input
              value={customerName}
              onChange={(e) =>
                setCustomerName(
                  e.target.value
                )
              }
              placeholder="Customer Name"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-4"
            />

            {posType ===
              POS_TYPES.RESTAURANT && (

              <input
                value={tableNumber}
                onChange={(e) =>
                  setTableNumber(
                    e.target.value
                  )
                }
                placeholder="Table Number"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-4"
              />
            )}

            <div className="border border-zinc-800 rounded-3xl p-6">

              <div className="text-2xl mb-6">
                Cart
              </div>

              <div className="space-y-4">

                {cart.map((item) => (

                  <div
                    key={item.id}
                    className="flex items-center justify-between"
                  >

                    <div>

                      <div>
                        {item.name}
                      </div>

                      <div className="text-zinc-500 text-sm mt-1">
                        ฿{item.price}
                      </div>

                    </div>

                    <div className="flex items-center gap-3">

                      <button
                        onClick={() =>
                          updateQuantity(
                            item.id,
                            -1
                          )
                        }
                        className="w-8 h-8 rounded-full border border-zinc-700"
                      >
                        -
                      </button>

                      <div>
                        {item.quantity}
                      </div>

                      <button
                        onClick={() =>
                          updateQuantity(
                            item.id,
                            1
                          )
                        }
                        className="w-8 h-8 rounded-full border border-zinc-700"
                      >
                        +
                      </button>

                    </div>

                  </div>
                ))}

              </div>

              <div className="border-t border-zinc-800 mt-6 pt-6 space-y-3">

                <div className="flex justify-between">
                  <div>Subtotal</div>
                  <div>฿{totals.subtotal}</div>
                </div>

                <div className="flex justify-between">
                  <div>Tax</div>
                  <div>฿{totals.tax}</div>
                </div>

                <div className="flex justify-between">
                  <div>Service</div>
                  <div>฿{totals.service_charge}</div>
                </div>

                <div className="flex justify-between text-2xl font-bold pt-4">
                  <div>Total</div>
                  <div>฿{totals.total}</div>
                </div>

              </div>

              <button
                onClick={submitOrder}
                disabled={
                  loading ||
                  cart.length === 0
                }
                className="w-full mt-8 bg-white text-black rounded-2xl py-5 text-xl font-bold disabled:opacity-50"
              >

                {loading
                  ? "PROCESSING..."
                  : "COMPLETE SALE"}

              </button>

            </div>

            {response && (

              <div className="border border-zinc-800 rounded-2xl p-4">

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

    </div>
  );
}