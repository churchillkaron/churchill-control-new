"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { RefreshCw, Users } from "lucide-react";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

const OPEN_STATUSES = new Set([
  "OPEN",
  "ACTIVE",
  "OCCUPIED",
  "DINING",
  "READY",
  "FOOD READY",
  "BILL REQUESTED",
  "PAYMENT_PENDING",
]);

function labelOf(table) {
  return table?.table_name || table?.table_number || table?.name || "Table";
}

function statusOf(table) {
  if (Number(table?.current_guests || 0) > 0 && !table?.status) return "OCCUPIED";
  return String(table?.status || "AVAILABLE").trim().toUpperCase();
}

function statusPresentation(table) {
  const status = statusOf(table);
  if (["BILL REQUESTED", "PAYMENT_PENDING"].includes(status)) {
    return {
      label: "Needs settlement",
      card: "border-[#D6A66A]/55 bg-[#D6A66A]/[0.09]",
      pill: "border-[#D6A66A]/40 bg-[#D6A66A]/10 text-[#F0D59D]",
    };
  }
  if (["READY", "FOOD READY"].includes(status)) {
    return {
      label: "Food ready",
      card: "border-amber-300/35 bg-amber-300/[0.06]",
      pill: "border-amber-300/30 bg-amber-300/[0.08] text-amber-100",
    };
  }
  if (OPEN_STATUSES.has(status) || Number(table?.current_guests || 0) > 0) {
    return {
      label: "Dining",
      card: "border-emerald-300/20 bg-emerald-400/[0.045]",
      pill: "border-emerald-300/20 bg-emerald-400/[0.07] text-emerald-100",
    };
  }
  return {
    label: "Available",
    card: "border-white/10 bg-white/[0.025]",
    pill: "border-white/10 bg-white/[0.035] text-white/45",
  };
}

function formatMoney(value, currencyCode) {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat(
      undefined,
      currencyCode
        ? {
            style: "currency",
            currency: currencyCode,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }
        : {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          },
    ).format(amount);
  } catch {
    return amount.toFixed(2);
  }
}

export default function TablesPage() {
  const params = useParams();
  const router = useRouter();
  const businessContext = useBusinessContext() || {};
  const organizationId =
    params?.organizationId ||
    businessContext.organization_id ||
    businessContext.organization?.id ||
    null;
  const currencyCode =
    businessContext.organization?.currency_code ||
    businessContext.organization?.currency ||
    businessContext.currency ||
    null;

  const [tables, setTables] = useState([]);
  const [zones, setZones] = useState([]);
  const [activeZoneId, setActiveZoneId] = useState(null);
  const [selectedTableId, setSelectedTableId] = useState(null);
  const [tableState, setTableState] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadTables = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/pos/runtime?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: "no-store", credentials: "include" },
      );
      const result = await response.json();
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Unable to load restaurant floor");
      }

      setTables(result.tables || []);
      setZones(result.zones || []);
      setActiveZoneId((current) => current || result.zones?.[0]?.id || null);
    } catch (loadError) {
      setTables([]);
      setZones([]);
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadTables();
  }, [loadTables]);

  const visibleTables = useMemo(
    () =>
      tables
        .filter((table) => !activeZoneId || table.zone_id === activeZoneId)
        .sort((a, b) =>
          String(labelOf(a)).localeCompare(String(labelOf(b)), undefined, {
            numeric: true,
          }),
        ),
    [activeZoneId, tables],
  );

  const metrics = useMemo(() => {
    let dining = 0;
    let ready = 0;
    let settlement = 0;
    let guests = 0;

    visibleTables.forEach((table) => {
      const status = statusOf(table);
      guests += Number(table.current_guests || 0);
      if (["READY", "FOOD READY"].includes(status)) ready += 1;
      else if (["BILL REQUESTED", "PAYMENT_PENDING"].includes(status)) settlement += 1;
      else if (OPEN_STATUSES.has(status) || Number(table.current_guests || 0) > 0) dining += 1;
    });

    return { dining, ready, settlement, guests };
  }, [visibleTables]);

  async function selectTable(table) {
    setSelectedTableId(table.id);
    setError(null);

    try {
      const response = await fetch("/api/pos/tables/open", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, tableId: table.id }),
      });
      const result = await response.json();
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Unable to open table");
      }

      setTableState((current) => ({ ...current, [table.id]: result }));
    } catch (openError) {
      setError(openError.message);
    }
  }

  const selectedTable = tables.find((table) => table.id === selectedTableId) || null;
  const selectedState = selectedTable ? tableState[selectedTable.id] || null : null;
  const selectedSummary = selectedState?.summary || {};
  const selectedItems = (selectedState?.orders || []).flatMap(
    (order) => order.order_items || [],
  );

  function continueAtPOS(table) {
    const tableReference = table.table_number || table.table_name || table.id;
    const query = new URLSearchParams({
      view: "stationary",
      table: String(tableReference),
    });
    router.push(`/workspace/${organizationId}/operations/pos?${query.toString()}`);
  }

  return (
    <main className="min-h-screen bg-black px-4 py-5 text-white lg:px-6 lg:py-7">
      <div className="mx-auto max-w-[1760px]">
        <header className="rounded-[30px] border border-white/10 bg-white/[0.03] p-5 lg:p-6">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#D6A66A]">
                Restaurant Floor
              </p>
              <h1 className="mt-2 text-3xl font-light tracking-tight lg:text-4xl">
                See the room. Act on what needs attention.
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-white/42">
                Live tables, covers, kitchen readiness and settlement attention from the same restaurant state used by Waiter and POS.
              </p>
            </div>

            <button
              type="button"
              onClick={loadTables}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.025] px-4 py-2.5 text-xs text-white/55"
            >
              <RefreshCw size={14} /> Refresh live floor
            </button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-4">
            {[
              ["Dining", metrics.dining],
              ["Food ready", metrics.ready],
              ["Settle", metrics.settlement],
              ["Guests", metrics.guests],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
                <div className="text-[9px] uppercase tracking-[0.18em] text-white/32">{label}</div>
                <div className="mt-1 text-2xl font-light">{value}</div>
              </div>
            ))}
          </div>

          {zones.length ? (
            <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
              {zones.map((zone) => (
                <button
                  key={zone.id}
                  type="button"
                  onClick={() => setActiveZoneId(zone.id)}
                  className={
                    activeZoneId === zone.id
                      ? "shrink-0 rounded-xl bg-[#D6A66A] px-4 py-2 text-xs font-semibold text-black"
                      : "shrink-0 rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-xs text-white/50"
                  }
                >
                  {zone.name}
                </button>
              ))}
            </div>
          ) : null}

          {error ? (
            <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          ) : null}
        </header>

        <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="rounded-[28px] border border-white/10 bg-white/[0.018] p-4">
            {loading ? (
              <div className="flex min-h-[520px] items-center justify-center text-sm text-white/30">
                Loading live floor...
              </div>
            ) : visibleTables.length ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {visibleTables.map((table) => {
                  const presentation = statusPresentation(table);
                  const state = tableState[table.id];
                  const total = Number(state?.summary?.total || 0);
                  return (
                    <button
                      key={table.id}
                      type="button"
                      onClick={() => selectTable(table)}
                      className={`min-h-40 rounded-[24px] border p-4 text-left transition hover:-translate-y-0.5 ${presentation.card} ${
                        selectedTableId === table.id ? "ring-1 ring-[#D6A66A]/70" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-[9px] uppercase tracking-[0.2em] text-white/30">Table</div>
                          <div className="mt-1 text-3xl font-light">{labelOf(table)}</div>
                        </div>
                        <Users size={18} className="text-white/35" />
                      </div>

                      <div className={`mt-4 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium ${presentation.pill}`}>
                        {presentation.label}
                      </div>

                      <div className="mt-3 flex items-center justify-between text-xs text-white/42">
                        <span>{Number(table.current_guests || 0)} guests</span>
                        {state ? <span>{formatMoney(total, currencyCode)}</span> : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex min-h-[520px] items-center justify-center rounded-3xl border border-dashed border-white/10 text-sm text-white/30">
                No restaurant tables are configured in this zone.
              </div>
            )}
          </div>

          <aside className="rounded-[28px] border border-white/10 bg-[#080808] p-5 xl:sticky xl:top-4 xl:self-start">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[#D6A66A]">Service detail</p>
            <h2 className="mt-2 text-2xl font-light">
              {selectedTable ? `Table ${labelOf(selectedTable)}` : "Select a table"}
            </h2>

            {selectedTable ? (
              <>
                <div className="mt-5 max-h-[300px] space-y-1.5 overflow-y-auto pr-1">
                  {selectedItems.length ? (
                    selectedItems.map((item) => (
                      <div key={item.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2.5 text-xs">
                        <div className="min-w-0">
                          <div className="truncate font-medium">{item.item_name || item.name || "Item"}</div>
                          <div className="mt-0.5 text-[10px] text-white/32">Seat {item.seat_position || item.seat_number || "—"}</div>
                        </div>
                        <div className="ml-3 text-white/45">{Number(item.quantity || 1)} × {formatMoney(item.price, currencyCode)}</div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-xs text-white/30">
                      No active items on this table.
                    </div>
                  )}
                </div>

                <div className="mt-5 space-y-2 border-t border-white/10 pt-4 text-xs">
                  <div className="flex justify-between text-white/42"><span>Subtotal</span><span>{formatMoney(selectedSummary.subtotal, currencyCode)}</span></div>
                  <div className="flex justify-between text-white/42"><span>Service</span><span>{formatMoney(selectedSummary.service, currencyCode)}</span></div>
                  <div className="flex justify-between text-white/42"><span>Tax</span><span>{formatMoney(selectedSummary.vat, currencyCode)}</span></div>
                  <div className="flex justify-between pt-1 text-lg font-medium"><span>Total</span><span>{formatMoney(selectedSummary.total, currencyCode)}</span></div>
                </div>

                <button
                  type="button"
                  onClick={() => continueAtPOS(selectedTable)}
                  className="mt-5 w-full rounded-2xl bg-[#D6A66A] px-4 py-3.5 text-sm font-semibold text-black"
                >
                  Continue at stationary POS
                </button>
                <div className="mt-2 text-center text-[10px] leading-4 text-white/28">
                  Order, split and settlement continue together on the cashier workstation. No separate payment workspace.
                </div>
              </>
            ) : (
              <div className="mt-5 rounded-2xl border border-dashed border-white/10 p-5 text-xs leading-5 text-white/30">
                Tap a table to see its active check and next operational state.
              </div>
            )}
          </aside>
        </section>
      </div>
    </main>
  );
}
