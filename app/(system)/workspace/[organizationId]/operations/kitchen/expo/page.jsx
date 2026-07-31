"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { BellRing, CheckCircle2, RefreshCw } from "lucide-react";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

function statusOf(value) {
  return String(value || "").trim().toUpperCase();
}

export default function ExpoPage() {
  const params = useParams();
  const businessContext = useBusinessContext() || {};
  const organizationId =
    params?.organizationId ||
    businessContext.organization_id ||
    businessContext.organization?.id ||
    null;

  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState(null);
  const [error, setError] = useState(null);

  const loadExpo = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/restaurant/operations?scope=expo&organizationId=${encodeURIComponent(organizationId)}`,
        { cache: "no-store", credentials: "include" }
      );
      const result = await response.json();
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Unable to load Expo");
      }
      setTickets(result.readyTickets || []);
    } catch (loadError) {
      setTickets([]);
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadExpo();
  }, [loadExpo]);

  const readyTables = useMemo(() => {
    const grouped = new Map();

    for (const ticket of tickets) {
      const table = ticket.table_number || "Unassigned";
      const readyItems = (ticket.items || []).filter(
        (item) => statusOf(item.status) === "READY"
      );
      if (!readyItems.length && statusOf(ticket.status) === "READY") {
        readyItems.push(...(ticket.items || []).filter((item) => statusOf(item.status) !== "SERVED"));
      }
      if (!readyItems.length) continue;

      if (!grouped.has(table)) grouped.set(table, []);
      grouped.get(table).push(
        ...readyItems.map((item) => ({ ...item, ticketId: ticket.id }))
      );
    }

    return [...grouped.entries()];
  }, [tickets]);

  async function serveItems(items) {
    setError(null);

    for (const item of items) {
      const itemId = item.id || item.order_item_id;
      if (!itemId) continue;
      setActionId(`${item.ticketId}:${itemId}`);

      const response = await fetch("/api/restaurant/operations", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "UPDATE_KITCHEN_ITEM",
          organizationId,
          ticketId: item.ticketId,
          itemId,
          status: "SERVED",
        }),
      });
      const result = await response.json();
      if (!response.ok || result.success === false) {
        setActionId(null);
        throw new Error(result.error || "Unable to mark item served");
      }
    }

    setActionId(null);
    await loadExpo();
  }

  async function serveTable(items) {
    try {
      await serveItems(items);
    } catch (serveError) {
      setError(serveError.message);
    }
  }

  return (
    <main className="min-h-screen bg-[#080808] px-6 py-8 text-white">
      <div className="mx-auto max-w-[1600px]">
        <header className="rounded-[34px] border border-white/10 bg-white/[0.035] p-7">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[#D6A66A]">Restaurant Operations</p>
              <h1 className="mt-3 text-4xl font-semibold">Expo & Service Handoff</h1>
              <p className="mt-2 text-sm text-white/45">Assemble ready items, call service and confirm collection.</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl border border-white/10 bg-black/25 px-5 py-3">
                <div className="flex items-center gap-2 text-xs text-white/40"><BellRing size={15} /> Ready tables</div>
                <div className="mt-1 text-2xl font-semibold">{readyTables.length}</div>
              </div>
              <button onClick={loadExpo} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-white/60">
                <RefreshCw size={15} /> Refresh
              </button>
            </div>
          </div>
          {error ? <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">{error}</div> : null}
        </header>

        <section className="mt-6 grid gap-6 xl:grid-cols-2">
          {loading ? (
            <div className="col-span-full rounded-3xl border border-white/10 p-12 text-center text-white/35">Loading ready service...</div>
          ) : readyTables.length ? (
            readyTables.map(([table, items]) => (
              <article key={table} className="rounded-[30px] border border-[#D6A66A]/25 bg-[#D6A66A]/[0.045] p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-[#D6A66A]">Table</div>
                    <h2 className="mt-1 text-4xl font-semibold">{table}</h2>
                  </div>
                  <CheckCircle2 className="text-emerald-300" size={32} />
                </div>

                <div className="mt-6 space-y-3">
                  {items.map((item) => {
                    const itemId = item.id || item.order_item_id;
                    return (
                      <div key={`${item.ticketId}:${itemId}`} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-lg font-medium">{Number(item.quantity || 1)} × {item.item_name || item.name || "Item"}</div>
                            {item.seat_position ? <div className="mt-1 text-xs text-cyan-200/70">Seat {item.seat_position}</div> : null}
                            {item.notes ? <div className="mt-1 text-sm text-orange-200/70">{item.notes}</div> : null}
                          </div>
                          <div className="text-xs font-semibold text-emerald-300">READY</div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button
                  onClick={() => serveTable(items)}
                  disabled={Boolean(actionId)}
                  className="mt-6 w-full rounded-2xl bg-emerald-400 py-4 text-sm font-semibold text-black disabled:opacity-40"
                >
                  {actionId ? "Updating..." : "Mark Table Collected / Served"}
                </button>
              </article>
            ))
          ) : (
            <div className="col-span-full rounded-3xl border border-dashed border-white/10 p-16 text-center text-white/35">
              No items are ready for service.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
