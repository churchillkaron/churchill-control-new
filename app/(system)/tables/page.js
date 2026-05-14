"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/shared/supabase/client";

export default function TablesPage() {

  const [tables, setTables] =
    useState([]);

  const [selectedOrder, setSelectedOrder] =
    useState(null);

  const [paymentMethod, setPaymentMethod] =
    useState("CASH");

  const [amountReceived, setAmountReceived] =
    useState("");

  const [processingPayment, setProcessingPayment] =
    useState(false);

  // =========================
  // LOAD TABLES
  // =========================

  const loadTables = async () => {

    const { data: orders } =
      await supabase
        .from("orders")
        .select("*")
        .neq("status", "closed")
        .order("created_at", {
          ascending: false,
        });

    const { data: items } =
      await supabase
        .from("order_items")
        .select("*")
        .neq("status", "REMOVED");

    const merged =
      (orders || []).map(
        (order) => ({

          ...order,

          items: Array.from(
            new Map(

              (items || [])
                .filter(
                  (i) =>
                    i.order_id ===
                    order.id
                )
                .map(
                  (item) => [
                    item.id,
                    item,
                  ]
                )

            ).values()
          ),

        })
      );

    setTables(merged);

  };

  useEffect(() => {

    loadTables();

    const interval =
      setInterval(
        loadTables,
        2000
      );

    return () =>
      clearInterval(interval);

  }, []);

  // =========================
  // CLOSE TABLE
  // =========================

  const closeTable = async (
    orderId
  ) => {

    const { error } =
      await supabase
        .from("orders")
        .update({
          status: "closed",
        })
        .eq("id", orderId);

    if (error) {

      console.error(
        "CLOSE ERROR:",
        error
      );

    }

    loadTables();

  };

  // =========================
  // OPEN PAYMENT
  // =========================

  const openPaymentModal = (
    table
  ) => {

    setSelectedOrder(table);

    setAmountReceived(
      table.total || ""
    );

    setPaymentMethod("CASH");

  };

  // =========================
  // MARK PAID
  // =========================

  const markAsPaid =
    async () => {

      if (!selectedOrder)
        return;

      setProcessingPayment(
        true
      );

      try {

        const total =
          Number(
            selectedOrder.total || 0
          );

        const paid =
          Number(
            amountReceived || 0
          );

        const change =
          paid - total;

        if (paid < total) {

          alert(
            "Insufficient payment"
          );

          setProcessingPayment(
            false
          );

          return;

        }

        const {
          data: { user },
        } =
          await supabase.auth.getUser();

        const {
          error,
        } = await supabase
          .from("orders")
          .update({
            payment_status:
              "PAID",
            payment_method:
              paymentMethod,
            amount_paid:
              paid,
            change_amount:
              change,
            paid_at:
              new Date().toISOString(),
            cashier_name:
              user?.email || null,
          })
          .eq(
            "id",
            selectedOrder.id
          );

        if (error)
          throw error;

        alert(
          "✅ Payment completed"
        );

        setSelectedOrder(null);

        loadTables();

      } catch (err) {

        console.error(
          "PAYMENT ERROR:",
          err
        );

        alert(
          "Payment failed"
        );

      }

      setProcessingPayment(
        false
      );

    };

  return (

    <div className="space-y-10 text-white">

      <h1 className="text-3xl">
        Tables
      </h1>

      <div className="grid md:grid-cols-3 gap-6">

        {tables.length === 0 && (

          <div className="text-white/40 text-sm">
            No active tables
          </div>

        )}

        {tables.map((table) => {

          const totalItems =
            table.items.length;

          const servedItems =
            table.items.filter(
              (i) =>
                i.status === "DONE"
            ).length;

          const allServed =
            totalItems > 0 &&
            servedItems ===
              totalItems;

          const isPaid =
            table.payment_status ===
            "PAID";

          const awaitingPayment =
            allServed &&
            !isPaid;

          let statusLabel =
            "In Progress";

          let statusColor =
            "text-yellow-400";

          if (
            awaitingPayment
          ) {

            statusLabel =
              "Awaiting Payment";

            statusColor =
              "text-orange-400";

          }

          if (isPaid) {

            statusLabel =
              "Paid";

            statusColor =
              "text-green-400";

          }

          return (

            <div
              key={table.id}
              className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4"
            >

              <div className="flex justify-between items-center">

                <div className="text-xl">
                  Table{" "}
                  {
                    table.table_number
                  }
                </div>

                <div className="text-xs text-white/50">

                  {new Date(
                    table.created_at
                  ).toLocaleTimeString()}

                </div>

              </div>

              <div className="text-sm text-white/50">

                Items: {totalItems}

              </div>

              <div className="text-lg">

                {table.total} THB

              </div>

              <div className="text-xs">

                Status:{" "}

                <span
                  className={
                    statusColor
                  }
                >
                  {statusLabel}
                </span>

              </div>

              <div className="text-xs text-white/40">

                Payment:{" "}

                {table.payment_status ||
                  "UNPAID"}

              </div>

              <div className="text-sm space-y-1">

                {table.items.map(
                  (item) => (

                    <div
                      key={item.id}
                    >

                      {
                        item.item_name
                      }{" "}

                      (
                      {
                        item.status
                      }
                      )

                    </div>

                  )
                )}

              </div>

              {allServed &&
                !isPaid && (

                  <button

                    onClick={() =>
                      openPaymentModal(
                        table
                      )
                    }

                    className="w-full bg-orange-500 text-black py-2 rounded font-semibold"

                  >

                    Pay Table

                  </button>

                )}

              {isPaid && (

                <button

                  onClick={() =>
                    closeTable(
                      table.id
                    )
                  }

                  className="w-full bg-green-500 text-black py-2 rounded font-semibold"

                >

                  Close Table

                </button>

              )}

            </div>

          );

        })}

      </div>

      {/* ========================= */}
      {/* PAYMENT MODAL */}
      {/* ========================= */}

      {selectedOrder && (

        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">

          <div className="bg-[#111] border border-white/10 rounded-2xl p-6 w-full max-w-md space-y-4">

            <h2 className="text-2xl font-semibold">

              Payment

            </h2>

            <div className="text-xl">

              Total:
              {" "}
              ฿
              {selectedOrder.total}

            </div>

            <select
              value={
                paymentMethod
              }
              onChange={(e) =>
                setPaymentMethod(
                  e.target.value
                )
              }
              className="w-full bg-black border border-white/20 rounded p-3"
            >

              <option value="CASH">
                CASH
              </option>

              <option value="CARD">
                CARD
              </option>

              <option value="TRANSFER">
                TRANSFER
              </option>

            </select>

            <input
              type="number"
              placeholder="Amount received"
              value={
                amountReceived
              }
              onChange={(e) =>
                setAmountReceived(
                  e.target.value
                )
              }
              className="w-full bg-black border border-white/20 rounded p-3"
            />

            <div className="text-sm text-white/60">

              Change:
              {" "}
              ฿
              {Math.max(
                Number(
                  amountReceived || 0
                ) -
                  Number(
                    selectedOrder.total ||
                      0
                  ),
                0
              )}

            </div>

            <div className="flex gap-3">

              <button
                onClick={() =>
                  setSelectedOrder(
                    null
                  )
                }
                className="flex-1 bg-white/10 py-3 rounded"
              >

                Cancel

              </button>

              <button
                disabled={
                  processingPayment
                }
                onClick={
                  markAsPaid
                }
                className="flex-1 bg-green-500 text-black py-3 rounded font-semibold"
              >

                {processingPayment
                  ? "Processing..."
                  : "Confirm Payment"}

              </button>

            </div>

          </div>

        </div>

      )}

    </div>

  );

}