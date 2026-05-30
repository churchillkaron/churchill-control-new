"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";

export default function IntercompanyPage() {

  const [transactions, setTransactions] = useState([]);
  const [entities, setEntities] = useState([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    from_legal_entity_id: "",
    to_legal_entity_id: "",
    transaction_type: "",
    reference_number: "",
    description: "",
    amount: "",
    currency: "THB",
    due_date: "",
  });

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {

    setLoading(true);

    try {

      const response =
        await fetch(
          "/api/finance/intercompany/runtime",
          {
            method: "POST",
          }
        );

      const result =
        await response.json();

      if (!result.success) {

        alert(result.error);

        return;

      }

      setEntities(
        result.entities || []
      );

      setTransactions(
        result.transactions || []
      );

    } catch (error) {

      console.error(error);

    } finally {

      setLoading(false);

    }

  }

  async function createTransaction() {

    if (
      !form.from_legal_entity_id ||
      !form.to_legal_entity_id ||
      !form.amount
    ) {

      alert(
        "Missing required fields"
      );

      return;

    }

    if (
      form.from_legal_entity_id ===
      form.to_legal_entity_id
    ) {

      alert(
        "Entities cannot match"
      );

      return;

    }

    const response =
      await fetch(
        "/api/finance/intercompany/create",
        {

          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({

            ...form,

            amount:
              Number(form.amount),

          }),

        }
      );

    const result =
      await response.json();

    if (!result.success) {

      console.error(result.error);

      alert(result.error);

      return;

    }

    setForm({
      from_legal_entity_id: "",
      to_legal_entity_id: "",
      transaction_type: "",
      reference_number: "",
      description: "",
      amount: "",
      currency: "THB",
      due_date: "",
    });

    await fetchData();

  }

  async function settleTransaction(
    transaction
  ) {

    const response =
      await fetch(
        "/api/finance/intercompany/settle",
        {

          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({

            transaction_id:
              transaction.id,

          }),

        }
      );

    const result =
      await response.json();

    if (!result.success) {

      console.error(result.error);

      alert(result.error);

      return;

    }

    await fetchData();

  }

  const totals = useMemo(() => {

    const totalPending =
      transactions
        .filter(
          (t) =>
            t.status ===
            "pending"
        )
        .reduce(
          (sum, t) =>
            sum +
            Number(
              t.amount || 0
            ),
          0
        );

    const totalSettled =
      transactions
        .filter(
          (t) =>
            t.status ===
            "settled"
        )
        .reduce(
          (sum, t) =>
            sum +
            Number(
              t.amount || 0
            ),
          0
        );

    return {

      totalPending,

      totalSettled,

    };

  }, [transactions]);

  if (loading) {

    return (
      <div className="min-h-screen bg-black text-white p-10">
        Loading intercompany...
      </div>
    );

  }

  return (

    <div className="min-h-screen bg-black text-white p-10">

      {/* HEADER */}
      <div className="mb-10">

        <h1 className="text-4xl font-bold">
          Intercompany Accounting
        </h1>

        <div className="text-white/50 mt-2">
          Enterprise multi-entity reconciliation
        </div>

      </div>

      {/* SUMMARY */}
      <div className="grid grid-cols-2 gap-4 mb-10">

        <SummaryCard
          title="Pending"
          value={totals.totalPending}
        />

        <SummaryCard
          title="Settled"
          value={totals.totalSettled}
          highlight
        />

      </div>

      {/* CREATE */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-10">

        <h2 className="text-2xl mb-6">
          Create Intercompany Transaction
        </h2>

        <div className="grid grid-cols-2 gap-4">

          <select
            value={form.from_legal_entity_id}
            onChange={(e) =>
              setForm({
                ...form,
                from_legal_entity_id:
                  e.target.value,
              })
            }
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          >

            <option value="">
              From Entity
            </option>

            {entities.map((entity) => (

              <option
                key={entity.id}
                value={entity.id}
              >

                {entity.code} — {entity.legal_name}

              </option>

            ))}

          </select>

          <select
            value={form.to_legal_entity_id}
            onChange={(e) =>
              setForm({
                ...form,
                to_legal_entity_id:
                  e.target.value,
              })
            }
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          >

            <option value="">
              To Entity
            </option>

            {entities.map((entity) => (

              <option
                key={entity.id}
                value={entity.id}
              >

                {entity.code} — {entity.legal_name}

              </option>

            ))}

          </select>

          <input
            placeholder="Transaction Type"
            value={form.transaction_type}
            onChange={(e) =>
              setForm({
                ...form,
                transaction_type:
                  e.target.value,
              })
            }
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          />

          <input
            placeholder="Reference Number"
            value={form.reference_number}
            onChange={(e) =>
              setForm({
                ...form,
                reference_number:
                  e.target.value,
              })
            }
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          />

          <input
            type="number"
            placeholder="Amount"
            value={form.amount}
            onChange={(e) =>
              setForm({
                ...form,
                amount:
                  e.target.value,
              })
            }
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          />

          <input
            type="date"
            value={form.due_date}
            onChange={(e) =>
              setForm({
                ...form,
                due_date:
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

        <button
          onClick={createTransaction}
          className="mt-6 bg-green-600 hover:bg-green-700 px-6 py-3 rounded-xl"
        >
          Create Transaction
        </button>

      </div>

      {/* TRANSACTIONS */}
      <div>

        <h2 className="text-2xl mb-6">
          Intercompany Transactions
        </h2>

        {transactions.length === 0 && (

          <Empty text="No intercompany transactions" />

        )}

        {transactions.map((transaction) => (

          <div
            key={transaction.id}
            className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-4"
          >

            <div className="flex justify-between items-start">

              <div>

                <div className="text-2xl font-semibold">

                  ฿{Number(
                    transaction.amount || 0
                  ).toLocaleString()}

                </div>

                <div className="text-white/40 mt-1">

                  {transaction.transaction_type || "-"}

                </div>

                <div className="mt-4 space-y-1 text-white/70">

                  <div>

                    From:
                    {" "}
                    {transaction.from_entity?.code}
                    {" — "}
                    {transaction.from_entity?.legal_name}

                  </div>

                  <div>

                    To:
                    {" "}
                    {transaction.to_entity?.code}
                    {" — "}
                    {transaction.to_entity?.legal_name}

                  </div>

                  <div>
                    Reference:
                    {" "}
                    {transaction.reference_number || "-"}
                  </div>

                  <div>
                    Due:
                    {" "}
                    {transaction.due_date || "-"}
                  </div>

                </div>

              </div>

              <div className="flex flex-col items-end">

                <div
                  className={`px-4 py-2 rounded-full text-sm ${
                    transaction.status === "settled"
                      ? "bg-green-600/20 text-green-300"
                      : "bg-yellow-600/20 text-yellow-300"
                  }`}
                >

                  {transaction.status}

                </div>

                {transaction.status !== "settled" && (

                  <button
                    onClick={() =>
                      settleTransaction(
                        transaction
                      )
                    }
                    className="mt-4 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-xl"
                  >

                    Settle

                  </button>

                )}

              </div>

            </div>

          </div>

        ))}

      </div>

    </div>

  );

}

function SummaryCard({
  title,
  value,
  highlight = false,
}) {

  return (

    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">

      <div className="text-white/50 text-sm">
        {title}
      </div>

      <div
        className={`text-3xl font-bold mt-2 ${
          highlight
            ? "text-green-400"
            : "text-white"
        }`}
      >

        ฿{Number(
          value || 0
        ).toLocaleString()}

      </div>

    </div>

  );

}

function Empty({
  text,
}) {

  return (

    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-white/40">
      {text}
    </div>

  );

}