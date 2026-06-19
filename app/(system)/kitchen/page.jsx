"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useTenant } from "@/app/providers/TenantProvider";

export default function KitchenPage() {
  const tenant = useTenant();
  const tenantId = tenant?.id;

  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  async function loadKitchen() {
    if (!tenantId) return;

    const res = await fetch("/api/kitchen/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tenantId,
      }),
    });

    const json = await res.json();

    setTickets(json.data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadKitchen();

    const interval = setInterval(
      loadKitchen,
      5000
    );

    return () =>
      clearInterval(interval);
  }, [tenantId]);

  async function updateItemStatus(
    item,
    nextStatus
  ) {
    await fetch(
      "/api/kitchen/orders/state",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          itemId: item.id,
          status: nextStatus,
          tenantId,
        }),
      }
    );

    loadKitchen();
  }

  const newTickets =
    tickets.filter(
      t => t.status === "NEW"
    );

  const preparingTickets =
    tickets.filter(
      t => t.status === "PREPARING"
    );

  const readyTickets =
    tickets.filter(
      t => t.status === "READY"
    );

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B0B0B] text-white p-6">
        Loading Kitchen...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0B0B] text-white p-6">
      <div className="mb-8">
        <h1 className="text-4xl font-light">
          Kitchen
        </h1>

        <p className="text-white/50 mt-2">
          Live Kitchen Queue
        </p>
      </div>

      <div className="grid grid-cols-3 gap-6">

        <Column
          title="NEW"
          tickets={newTickets}
          actionLabel="START"
          actionStatus="PREPARING"
          updateItemStatus={
            updateItemStatus
          }
        />

        <Column
          title="PREPARING"
          tickets={preparingTickets}
          actionLabel="READY"
          actionStatus="READY"
          updateItemStatus={
            updateItemStatus
          }
        />

        <Column
          title="READY"
          tickets={readyTickets}
          actionLabel="SERVED"
          actionStatus="SERVED"
          updateItemStatus={
            updateItemStatus
          }
        />

      </div>
    </div>
  );
}

function Column({
  title,
  tickets,
  actionLabel,
  actionStatus,
  updateItemStatus,
}) {
  return (
    <div>
      <div className="mb-4">
        <h2 className="text-xl font-semibold">
          {title}
        </h2>

        <div className="text-white/40 text-sm">
          {tickets.length} tickets
        </div>
      </div>

      <div className="space-y-4">

        {tickets.map(ticket => (
          <TicketCard
            key={ticket.id}
            ticket={ticket}
            actionLabel={
              actionLabel
            }
            actionStatus={
              actionStatus
            }
            updateItemStatus={
              updateItemStatus
            }
          />
        ))}

      </div>
    </div>
  );
}

function TicketCard({
  ticket,
  actionLabel,
  actionStatus,
  updateItemStatus,
}) {
  const items =
    ticket.order_items || [];

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">

      <div className="flex items-center justify-between mb-3">
        <div>

          <div className="text-sm text-white/50">
            TABLE
          </div>

          <div className="text-lg font-semibold">
            {ticket.table_number ||
              "UNKNOWN"}
          </div>

        </div>

        <div className="text-right">
          <div className="text-xs text-white/40">
            ORDER
          </div>

          <div className="text-xs">
            {ticket.order_id
              ?.slice(0, 8)}
          </div>
        </div>
      </div>

      <div className="space-y-2">

        {items.map(item => (
          <div
            key={item.id}
            className="flex items-center justify-between rounded-xl bg-black/30 px-3 py-2"
          >
            <div>
              {item.item_name}
            </div>

            <div className="text-white/50">
              x{item.quantity}
            </div>
          </div>
        ))}

      </div>

      <button
        className="mt-4 w-full rounded-xl bg-white text-black py-2 font-medium"
        onClick={async () => {

          for (const item of items) {
            await updateItemStatus(
              item,
              actionStatus
            );
          }

        }}
      >
        {actionLabel}
      </button>
    </div>
  );
}
