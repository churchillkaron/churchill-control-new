"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useTenant } from "@/app/providers/TenantProvider";

export default function WorkCenterPage() {
  const params = useParams();
  const workCenterId = params?.workCenterId;

  const tenant = useTenant();
  const tenantId = tenant?.id;

  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  const workCenterName =
    tickets?.[0]?.work_center?.name ||
    "Work Center";

  async function loadOrders() {
    if (!tenantId || !workCenterId) return;

    const res = await fetch("/api/work-centers/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tenantId,
        workCenterId,
      }),
    });

    const json = await res.json();

    setTickets(json.data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadOrders();

    const interval = setInterval(
      loadOrders,
      5000
    );

    return () => clearInterval(interval);
  }, [tenantId, workCenterId]);

  async function updateItemStatus(
    item,
    nextStatus
  ) {
    await fetch("/api/work-centers/orders/state", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        itemId: item.id,
        status: nextStatus,
        tenantId,
      }),
    });

    loadOrders();
  }

  const groups = useMemo(() => ({
    NEW: tickets.filter(t => t.status === "NEW"),
    PREPARING: tickets.filter(t => t.status === "PREPARING"),
    READY: tickets.filter(t => t.status === "READY"),
  }), [tickets]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#030712] p-8 text-white">
        Loading work center...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#030712] p-8 text-white">
      <section className="mb-8 rounded-[34px] border border-white/10 bg-white/[0.035] p-8">
        <p className="text-xs uppercase tracking-[0.32em] text-white/40">
          Operations Queue
        </p>

        <h1 className="mt-3 text-5xl font-light tracking-[-0.05em]">
          {workCenterName}
        </h1>

        <p className="mt-3 text-white/45">
          Dynamic work center execution board
        </p>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Column
          title="NEW"
          tickets={groups.NEW}
          actionLabel="START"
          actionStatus="PREPARING"
          updateItemStatus={updateItemStatus}
        />

        <Column
          title="PREPARING"
          tickets={groups.PREPARING}
          actionLabel="READY"
          actionStatus="READY"
          updateItemStatus={updateItemStatus}
        />

        <Column
          title="READY"
          tickets={groups.READY}
          actionLabel="SERVED"
          actionStatus="SERVED"
          updateItemStatus={updateItemStatus}
        />
      </section>
    </main>
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
    <div className="rounded-[30px] border border-white/10 bg-white/[0.03] p-5">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-xl font-light">
          {title}
        </h2>

        <div className="rounded-full border border-white/10 px-3 py-1 text-sm text-white/50">
          {tickets.length}
        </div>
      </div>

      <div className="space-y-4">
        {tickets.map(ticket => (
          <TicketCard
            key={ticket.id}
            ticket={ticket}
            actionLabel={actionLabel}
            actionStatus={actionStatus}
            updateItemStatus={updateItemStatus}
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
  const items = ticket.order_items || [];

  return (
    <div className="rounded-3xl border border-white/10 bg-black/30 p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.25em] text-white/35">
            Table
          </div>

          <div className="mt-1 text-2xl font-light">
            {ticket.table_number || "Unknown"}
          </div>
        </div>

        <div className="text-right">
          <div className="text-xs uppercase tracking-[0.25em] text-white/35">
            Order
          </div>

          <div className="mt-1 text-xs text-white/60">
            {ticket.order_id?.slice(0, 8)}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {items.map(item => (
          <div
            key={item.id}
            className="flex items-center justify-between rounded-2xl bg-white/[0.04] px-3 py-2"
          >
            <div>{item.item_name}</div>
            <div className="text-white/45">
              x{item.quantity}
            </div>
          </div>
        ))}
      </div>

      <button
        className="mt-4 w-full rounded-2xl bg-white py-3 text-sm font-medium text-black"
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
