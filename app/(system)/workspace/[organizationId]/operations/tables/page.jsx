"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CreditCard, RefreshCw, Receipt, Users } from "lucide-react";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

function labelOf(table) {
  return table?.table_name || table?.table_number || table?.name || "Table";
}

function activeStatus(status) {
  return [
    "OPEN",
    "ACTIVE",
    "OCCUPIED",
    "DINING",
    "READY",
    "FOOD READY",
    "BILL REQUESTED",
    "PAYMENT_PENDING",
  ].includes(String(status || "").trim().toUpperCase());
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
          }
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
        {
          cache: "no-store",
          credentials: "include",
        }
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
          })
        ),
    [activeZoneId, tables]
  );

  async function selectTable(table) {
    setSelectedTableId(table.id);
    setError(null);

    try {
      const response = await fetch("/api/pos/tables/open", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          tableId: table.id,
        }),
      });
      const result = await response.json();

      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Unable to open table");
      }

      setTableState((current) => ({
        ...current,
        [table.id]: result,
      }));
    } catch (openError) {
      setError(openError.message);
    }
  }

  const selectedTable = tables.find((table) => table.id === selectedTableId) || null;
  const selectedState = selectedTable ? tableState[selectedTable.id] || null : null;
  const selectedSummary = selectedState?.summary || {};
  const selectedItems = (selectedState?.orders || []).flatMap(
    (order) => order.order_items || []
  );

  function openOrder(table) {
    const tableNumber = table.table_number || table.table_name || table.id;
    router.push(
      `/workspace/${organizationId}/operations/pos/orders?table=${encodeURIComponent(tableNumber)}`
    );
  }

  function openPayment(table) {
    const tableNumber = table.table_number || table.table_name || table.id;
    router.push(
      `/workspace/${organizationId}/operations/pos/payments?table=${encodeURIComponent(tableNumber)}`
    );
  }

  return (
    <main className="min-h-screen bg-black px-6 py-8 text-white">
      <div className="mx-auto max-w-[1600px]">
        <header className="rounded-[34px] border border-white/10 bg-white/[0.035] p-7">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-[#D6A66A]">
                Restaurant Operations
              </p>
              <h1 className="mt-3 text-4xl font-semibold">Floor & Tables</h1>
              <p className="mt-2 text-sm text-white/45">
                Live table status, guests, active orders and settlement.
              </p>
            </div>
            <button
              type="button"
              onClick={loadTables}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-white/60"
            >
              <RefreshCw size={15} /> Refresh
            </button>
          </div>

          {zones.length ? (
            <div className="mt-6 flex flex-wrap gap-2">
              {zones.map((zone) => (
                <button
                  key={zone.id}
                  type="button"
                  onClick={() => setActiveZoneId(zone.id)}
                  className={
                    activeZoneId === zone.id
                      ? "rounded-xl bg-[#D6A66A] px-4 py-2 text-xs font-semibold text-black"
                      : "rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-xs text-white/55"
                  }
                >
                  {zone.name}
                </button>
              ))}
            </div>
          ) : null}

          {error ? (
            <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          ) : null}
        </header>

        <section className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
          <div className="rounded-[30px] border border-white/10 bg-white/[0.025] p-5">
            {loading ? (
              <div className="flex min-h-[520px] items-center justify-center text-white/35">
                Loading live floor...
              </div>
            ) : visibleTables.length ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {visibleTables.map((table) => {
                  const occupied = activeStatus(table.status) || Number(table.current_guests || 0) > 0;
                  const state = tableState[table.id];
                  const total = Number(state?.summary?.total || 0);

                  return (
                    <button
                      key={table.id}
                      type="button"
                      onClick={() => selectTable(table)}
                      className={`min-h-44 rounded-[26px] border p-5 text-left transition hover:-translate-y-0.5 ${
                        occupied
                          ? "border-[#D6A66A]/45 bg-[#D6A66A]/[0.08]"
                          : "border-white/10 bg-black/25"
                      } ${selectedTableId === table.id ? "ring-2 ring-[#D6A66A]/50" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xs uppercase tracking-[0.2em] text-white/35">
                            Table
                          </div>
                          <div className="mt-1 text-3xl font-semibold">{labelOf(table)}</div>
                        </div>
                        <Users className={occupied ? "text-[#D6A66A]" : "text-white/25"} />
                      </div>
                      <div className="mt-5 text-xs uppercase tracking-[0.15em] text-white/45">
                        {table.status || "AVAILABLE"}
                      </div>
                      <div className="mt-2 text-sm text-white/50">
                        {Number(table.current_guests || 0)} guest(s)
                      </div>
                      {state ? (
                        <div className="mt-4 text-sm font-medium text-white/75">
                          {formatMoney(total, currencyCode)}
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex min-h-[520px] items-center justify-center rounded-3xl border border-dashed border-white/10 text-sm text-white/35">
                No restaurant tables are configured for this organization.
              </div>
            )}
          </div>

          <aside className="rounded-[30px] border border-white/10 bg-white/[0.03] p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-[#D6A66A]">Selected Table</p>
            <h2 className="mt-3 text-3xl font-light">
              {selectedTable ? labelOf(selectedTable) : "Select a table"}
            </h2>

            {selectedTable ? (
              <>
                <div className="mt-6 max-h-72 space-y-2 overflow-y-auto">
                  {selectedItems.length ? (
                    selectedItems.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm"
                      >
                        <span>{item.item_name || item.name || "Item"}</span>
                        <span className="text-white/45">
                          {Number(item.quantity || 1)} × {formatMoney(item.price, currencyCode)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/35">
                      No active items on this table.
                    </div>
                  )}
                </div>

                <div className="mt-6 space-y-3 border-t border-white/10 pt-5 text-sm">
                  <div className="flex justify-between text-white/50">
                    <span>Subtotal</span>
                    <span>{formatMoney(selectedSummary.subtotal, currencyCode)}</span>
                  </div>
                  <div className="flex justify-between text-white/50">
                    <span>Service</span>
                    <span>{formatMoney(selectedSummary.service, currencyCode)}</span>
                  </div>
                  <div className="flex justify-between text-white/50">
                    <span>Tax</span>
                    <span>{formatMoney(selectedSummary.vat, currencyCode)}</span>
                  </div>
                  <div className="flex justify-between text-xl font-semibold">
                    <span>Total</span>
                    <span>{formatMoney(selectedSummary.total, currencyCode)}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => openOrder(selectedTable)}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 py-4 text-sm font-semibold"
                >
                  <Receipt size={17} /> Open Order
                </button>
                <button
                  type="button"
                  onClick={() => openPayment(selectedTable)}
                  disabled={Number(selectedSummary.total || 0) <= 0}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#D6A66A] py-4 text-sm font-semibold text-black disabled:opacity-35"
                >
                  <CreditCard size={17} /> Open Payment
                </button>
              </>
            ) : (
              <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-white/35">
                Select a table to inspect its active order and payment state.
              </div>
            )}
          </aside>
        </section>
      </div>
    </main>
  );
}
