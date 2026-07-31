"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Clock3, RefreshCw } from "lucide-react";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

function statusOf(value) {
  return String(value || "").trim().toUpperCase();
}

function elapsed(createdAt) {
  const created = new Date(createdAt || 0).getTime();
  if (!created) return "—";
  const minutes = Math.max(0, Math.floor((Date.now() - created) / 60000));
  return `${minutes}m`;
}

export default function KitchenPage() {
  const params = useParams();
  const businessContext = useBusinessContext() || {};
  const organizationId =
    params?.organizationId ||
    businessContext.organization_id ||
    businessContext.organization?.id ||
    null;

  const [tickets, setTickets] = useState([]);
  const [filter, setFilter] = useState("ACTIVE");
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState(null);
  const [error, setError] = useState(null);

  const loadKitchen = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/restaurant/operations?scope=kitchen&organizationId=${encodeURIComponent(organizationId)}`,
        { cache: "no-store", credentials: "include" }
      );
      const result = await response.json();
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Unable to load kitchen");
      }
      setTickets(result.tickets || []);
    } catch (loadError) {
      setTickets([]);
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadKitchen();
  }, [loadKitchen]);

  const visibleTickets = useMemo(() => {
    if (filter === "ALL") return tickets;
    if (filter === "READY") {
      return tickets.filter(
        (ticket) =>
          statusOf(ticket.status) === "READY" ||
          (ticket.items || []).some((item) => statusOf(item.status) === "READY")
      );
    }
    return tickets.filter(
      (ticket) => !["COMPLETED", "SERVED", "CANCELLED", "VOID"].includes(statusOf(ticket.status))
    );
  }, [filter, tickets]);

  async function updateItem(ticket, item, status) {
    const itemId = item.id || item.order_item_id;
    if (!itemId) return;

    setActionId(`${ticket.id}:${itemId}`);
    setError(null);

    try {
      const response = await fetch("/api/restaurant/operations", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "UPDATE_KITCHEN_ITEM",
          organizationId,
          ticketId: ticket.id,
          itemId,
          status,
        }),
      });
      const result = await response.json();
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Unable to update kitchen item");
      }
      await loadKitchen();
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setActionId(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#080808] px-6 py-8 text-white">
      <div className="mx-auto max-w-[1700px]">
        <header className="rounded-[34px] border border-white/10 bg-white/[0.035] p-7">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[#D6A66A]">Restaurant Operations</p>
              <h1 className="mt-3 text-4xl font-semibold">Kitchen Display</h1>
              <p className="mt-2 text-sm text-white/45">Live preparation tickets across configured production stations.</p>
            </div>
            <button onClick={loadKitchen} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-white/60">
              <RefreshCw size={15} /> Refresh
            </button>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {["ACTIVE", "READY", "ALL"].map((value) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={filter === value ? "rounded-xl bg-[#D6A66A] px-4 py-2 text-xs font-semibold text-black" : "rounded-xl border border-white/10 px-4 py-2 text-xs text-white/50"}
              >
                {value}
              </button>
            ))}
          </div>

          {error ? <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">{error}</div> : null}
        </header>

        <section className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {loading ? (
            <div className="col-span-full rounded-3xl border border-white/10 p-10 text-center text-white/35">Loading kitchen tickets...</div>
          ) : visibleTickets.length ? (
            visibleTickets.map((ticket) => (
              <article key={ticket.id} className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-[#D6A66A]">
                      {ticket.station || ticket.work_center_name || "Kitchen"}
                    </div>
                    <h2 className="mt-2 text-2xl font-semibold">Table {ticket.table_number || "—"}</h2>
                    <div className="mt-1 text-xs text-white/35">{ticket.order_number || ticket.order_id || ticket.id}</div>
                  </div>
                  <div className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs text-white/45">
                    <Clock3 size={13} /> {elapsed(ticket.created_at)}
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  {(ticket.items || []).length ? (ticket.items || []).map((item) => {
                    const itemId = item.id || item.order_item_id;
                    const status = statusOf(item.status || "NEW");
                    const busy = actionId === `${ticket.id}:${itemId}`;
                    return (
                      <div key={itemId || item.item_name} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-medium">{Number(item.quantity || 1)} × {item.item_name || item.name || "Item"}</div>
                            {item.notes ? <div className="mt-1 text-xs text-orange-200/70">{item.notes}</div> : null}
                            {item.cooking_level ? <div className="mt-1 text-xs text-[#D6A66A]">{item.cooking_level}</div> : null}
                          </div>
                          <div className="text-xs text-white/40">{status}</div>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-2">
                          <button
                            disabled={busy || status === "PREPARING" || status === "READY" || status === "SERVED"}
                            onClick={() => updateItem(ticket, item, "PREPARING")}
                            className="rounded-xl border border-white/10 py-2 text-xs text-white/60 disabled:opacity-30"
                          >
                            Start
                          </button>
                          <button
                            disabled={busy || status === "READY" || status === "SERVED"}
                            onClick={() => updateItem(ticket, item, "READY")}
                            className="rounded-xl bg-[#D6A66A] py-2 text-xs font-semibold text-black disabled:opacity-30"
                          >
                            Ready
                          </button>
                        </div>
                      </div>
                    );
                  }) : (
                    <div className="rounded-2xl border border-white/10 p-4 text-sm text-white/35">Ticket has no persisted items.</div>
                  )}
                </div>
              </article>
            ))
          ) : (
            <div className="col-span-full rounded-3xl border border-dashed border-white/10 p-12 text-center text-white/35">
              No kitchen tickets in this view.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
