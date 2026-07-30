"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import { loadWaiterData } from "@/lib/restaurant/pos/waiter/loadWaiterData";

function tableName(table) {
  return table?.table_name || table?.table_number || table?.name || "Table";
}

function formatMoney(value, currencyCode) {
  const amount = Number(value || 0);

  if (!currencyCode) {
    return new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }

  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }
}

function statusClass(status) {
  const normalized = String(status || "").toUpperCase();

  if (["BILL REQUESTED", "PAYMENT_PENDING"].includes(normalized)) {
    return "border-[#D6A66A]/60 bg-[#D6A66A]/10 text-[#F3D7A2]";
  }

  if (["FOOD READY", "READY"].includes(normalized)) {
    return "border-orange-300/40 bg-orange-400/10 text-orange-100";
  }

  if (["DINING", "OCCUPIED", "ACTIVE", "OPEN"].includes(normalized)) {
    return "border-emerald-300/25 bg-emerald-400/10 text-emerald-100";
  }

  return "border-white/10 bg-white/[0.025] text-white/60";
}

export default function StationaryPOSUI() {
  const params = useParams();
  const router = useRouter();
  const businessContext = useBusinessContext() || {};
  const organizationId =
    params?.organizationId ||
    businessContext?.organization?.id ||
    businessContext?.organizationId ||
    null;

  const [runtime, setRuntime] = useState(null);
  const [activeZoneId, setActiveZoneId] = useState(null);
  const [selectedTable, setSelectedTable] = useState(null);
  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState({
    subtotal: 0,
    service: 0,
    vat: 0,
    total: 0,
    item_count: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const currencyCode =
    runtime?.organization?.currency_code ||
    runtime?.organization?.currency ||
    null;
  const zones = runtime?.zones || [];
  const tables = runtime?.tables || [];

  const loadRuntime = useCallback(async () => {
    if (!organizationId) return;

    setLoading(true);
    setError(null);

    try {
      const loaded = await loadWaiterData(organizationId);
      setRuntime(loaded);
      setActiveZoneId((current) => current || loaded?.zones?.[0]?.id || null);
    } catch (loadError) {
      setError(loadError.message);
      setRuntime({ zones: [], tables: [], organization: null });
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadRuntime();
  }, [loadRuntime]);

  const visibleTables = useMemo(() => {
    return tables
      .filter((table) => !activeZoneId || table.zone_id === activeZoneId)
      .sort((a, b) =>
        String(tableName(a)).localeCompare(String(tableName(b)), undefined, {
          numeric: true,
        })
      );
  }, [activeZoneId, tables]);

  async function openTable(table) {
    setSelectedTable(table);
    setOrders([]);
    setSummary({ subtotal: 0, service: 0, vat: 0, total: 0, item_count: 0 });

    try {
      const response = await fetch("/api/pos/tables/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          organization_id: organizationId,
          tableId: table.id,
        }),
      });
      const result = await response.json();

      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Unable to open table");
      }

      setOrders(result.orders || []);
      setSummary({
        subtotal: Number(result.summary?.subtotal || 0),
        service: Number(
          result.summary?.service || result.summary?.service_charge_amount || 0
        ),
        vat: Number(result.summary?.vat || result.summary?.tax || 0),
        total: Number(result.summary?.total || 0),
        item_count: Number(result.summary?.item_count || 0),
      });
    } catch (openError) {
      setError(openError.message);
    }
  }

  function openPayment() {
    if (!selectedTable) return;

    const tableNumber =
      selectedTable.table_number || selectedTable.table_name || selectedTable.id;

    router.push(
      `/workspace/${organizationId}/operations/pos/payments?table=${encodeURIComponent(tableNumber)}`
    );
  }

  const openTables = tables.filter((table) =>
    ["DINING", "OCCUPIED", "ACTIVE", "OPEN", "FOOD READY", "READY", "BILL REQUESTED"].includes(
      String(table.status || "").toUpperCase()
    )
  ).length;

  return (
    <main className="min-h-screen bg-[#030712] px-6 py-6 text-white">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-6">
        <header className="rounded-[34px] border border-white/10 bg-white/[0.035] p-6 shadow-2xl backdrop-blur-2xl">
          <p className="text-xs uppercase tracking-[0.4em] text-[#D6A66A]">
            Avantiqo POS
          </p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-4xl font-light tracking-tight">Stationary Control</h1>
              <p className="mt-2 text-sm text-white/45">
                {runtime?.organization?.name || "Organization"}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-right">
              <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.2em] text-white/35">
                  Open tables
                </div>
                <div className="mt-1 text-2xl font-semibold">{openTables}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.2em] text-white/35">
                  Tables
                </div>
                <div className="mt-1 text-2xl font-semibold">{tables.length}</div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {zones.map((zone) => (
              <button
                key={zone.id}
                onClick={() => setActiveZoneId(zone.id)}
                className={
                  activeZoneId === zone.id
                    ? "rounded-xl bg-[#D6A66A] px-4 py-2 text-xs font-semibold text-black"
                    : "rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs text-white/60"
                }
              >
                {zone.name}
              </button>
            ))}
          </div>

          {error ? (
            <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          ) : null}
        </header>

        <section className="grid min-h-[620px] grid-cols-[1.4fr_0.8fr] gap-6">
          <div className="rounded-[30px] border border-white/10 bg-white/[0.025] p-5">
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-white/35">
                Loading live POS...
              </div>
            ) : visibleTables.length ? (
              <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
                {visibleTables.map((table) => (
                  <button
                    key={table.id}
                    onClick={() => openTable(table)}
                    className={`min-h-40 rounded-[26px] border p-5 text-left transition hover:-translate-y-1 ${statusClass(table.status)} ${
                      selectedTable?.id === table.id ? "ring-2 ring-[#D6A66A]/60" : ""
                    }`}
                  >
                    <div className="text-xl font-semibold">{tableName(table)}</div>
                    <div className="mt-2 text-xs uppercase tracking-[0.18em] opacity-60">
                      {table.status || "AVAILABLE"}
                    </div>
                    <div className="mt-8 text-sm opacity-70">
                      {Number(table.current_guests || 0)} guests
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center rounded-3xl border border-dashed border-white/10 text-sm text-white/35">
                No live tables configured for this organization.
              </div>
            )}
          </div>

          <aside className="rounded-[30px] border border-white/10 bg-white/[0.03] p-6">
            <p className="text-xs uppercase tracking-[0.25em] text-[#D6A66A]/80">
              Active table
            </p>
            <h2 className="mt-3 text-3xl font-light">
              {selectedTable ? tableName(selectedTable) : "Select a table"}
            </h2>

            <div className="mt-6 max-h-72 space-y-2 overflow-y-auto">
              {orders.flatMap((order) => order.order_items || []).map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm"
                >
                  <span>{item.item_name || item.name || "Item"}</span>
                  <span className="text-white/50">
                    {Number(item.quantity || 1)} × {formatMoney(item.price, currencyCode)}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-6 space-y-3 border-t border-white/10 pt-5 text-sm">
              <div className="flex justify-between text-white/55">
                <span>Subtotal</span>
                <span>{formatMoney(summary.subtotal, currencyCode)}</span>
              </div>
              <div className="flex justify-between text-white/55">
                <span>Service charge</span>
                <span>{formatMoney(summary.service, currencyCode)}</span>
              </div>
              <div className="flex justify-between text-white/55">
                <span>Tax</span>
                <span>{formatMoney(summary.vat, currencyCode)}</span>
              </div>
              <div className="flex justify-between text-xl font-semibold">
                <span>Total</span>
                <span>{formatMoney(summary.total, currencyCode)}</span>
              </div>
            </div>

            <button
              onClick={openPayment}
              disabled={!selectedTable || summary.total <= 0}
              className="mt-6 w-full rounded-2xl bg-[#D6A66A] py-4 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-35"
            >
              Open Payment
            </button>

            <button
              onClick={loadRuntime}
              className="mt-3 w-full rounded-2xl border border-white/10 py-3 text-sm text-white/65"
            >
              Refresh Live Data
            </button>
          </aside>
        </section>
      </div>
    </main>
  );
}
