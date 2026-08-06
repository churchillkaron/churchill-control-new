"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { CreditCard, RefreshCw, Search } from "lucide-react";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

function formatMoney(value, currencyCode) {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat(
      undefined,
      currencyCode
        ? { style: "currency", currency: currencyCode }
        : { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    ).format(amount);
  } catch {
    return amount.toFixed(2);
  }
}

function statusClass(status) {
  const value = String(status || "").toUpperCase();
  if (["PAID", "CLOSED", "COMPLETED"].includes(value)) return "text-emerald-300";
  if (["READY", "SERVED"].includes(value)) return "text-orange-200";
  if (["CANCELLED", "VOID"].includes(value)) return "text-red-300";
  return "text-[#D6A66A]";
}

function contextSearchValue(context) {
  return [context?.label, context?.reference, context?.id]
    .filter(Boolean)
    .join(" ");
}

export default function POSOrdersPage({ posConfiguration }) {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const contextQueryKey = posConfiguration?.context?.queryKey || "service_context";
  const contextLabel = posConfiguration?.context?.singularLabel || "Context";
  const orderEyebrow =
    posConfiguration?.presentation?.orderEyebrow || "Commerce Operations";

  const [orders, setOrders] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ACTIVE");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadOrders = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/pos/orders?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: "no-store", credentials: "include" }
      );
      const result = await response.json();
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Unable to load orders");
      }

      const loadedOrders = result.orders || [];
      setOrders(loadedOrders);
      const requestedContext =
        searchParams.get(contextQueryKey) || searchParams.get("table");
      const requested = requestedContext
        ? loadedOrders.find((order) =>
            [order.context?.id, order.context?.reference].some(
              (value) => String(value || "") === String(requestedContext)
            )
          )
        : null;
      setSelectedOrderId((current) =>
        current || requested?.id || loadedOrders[0]?.id || null
      );
    } catch (loadError) {
      setOrders([]);
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [organizationId, searchParams, contextQueryKey]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const filteredOrders = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return orders.filter((order) => {
      const active = Boolean(order.active);
      if (filter === "ACTIVE" && !active) return false;
      if (filter === "COMPLETED" && active) return false;
      if (!normalized) return true;
      return [
        order.id,
        order.order_number,
        contextSearchValue(order.context),
        order.status,
        order.staff_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    });
  }, [filter, orders, query]);

  const selectedOrder =
    orders.find((order) => order.id === selectedOrderId) || null;
  const selectedItems = selectedOrder?.items || selectedOrder?.order_items || [];

  function openPayment(order) {
    const context = order?.context;
    if (!context?.id && !context?.reference) return;
    const next = new URLSearchParams({ view: "checkout" });
    next.set(contextQueryKey, context.id || context.reference);
    router.push(
      `/workspace/${organizationId}/operations/pos?${next.toString()}`
    );
  }

  return (
    <main className="min-h-screen bg-black px-6 py-8 text-white">
      <div className="mx-auto max-w-[1600px]">
        <header className="rounded-[34px] border border-white/10 bg-white/[0.035] p-7">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[#D6A66A]">
                {orderEyebrow}
              </p>
              <h1 className="mt-3 text-4xl font-semibold">Order Control</h1>
              <p className="mt-2 text-sm text-white/45">
                Active, completed and cancelled orders with item and payment state.
              </p>
            </div>
            <button
              onClick={loadOrders}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-white/60"
            >
              <RefreshCw size={15} /> Refresh
            </button>
          </div>
          {error ? (
            <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
              {error}
            </div>
          ) : null}
        </header>

        <section className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[30px] border border-white/10 bg-white/[0.025] p-5">
            <div className="flex flex-wrap gap-2">
              {["ACTIVE", "COMPLETED", "ALL"].map((value) => (
                <button
                  key={value}
                  onClick={() => setFilter(value)}
                  className={
                    filter === value
                      ? "rounded-xl bg-[#D6A66A] px-4 py-2 text-xs font-semibold text-black"
                      : "rounded-xl border border-white/10 px-4 py-2 text-xs text-white/50"
                  }
                >
                  {value}
                </button>
              ))}
            </div>
            <div className="mt-4 flex items-center rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-white/35">
              <Search size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`Search ${contextLabel.toLowerCase()}, order or status...`}
                className="ml-3 w-full bg-transparent text-sm text-white outline-none"
              />
            </div>

            <div className="mt-4 max-h-[650px] space-y-2 overflow-y-auto">
              {loading ? (
                <div className="p-8 text-center text-sm text-white/35">
                  Loading orders...
                </div>
              ) : filteredOrders.length ? (
                filteredOrders.map((order) => (
                  <button
                    key={order.id}
                    onClick={() => setSelectedOrderId(order.id)}
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      selectedOrderId === order.id
                        ? "border-[#D6A66A]/45 bg-[#D6A66A]/10"
                        : "border-white/10 bg-black/20"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-semibold">
                          {order.context?.label ||
                            order.context?.reference ||
                            `Unassigned ${contextLabel.toLowerCase()}`}
                        </div>
                        <div className="mt-1 text-xs text-white/35">
                          {order.order_number || order.id}
                        </div>
                      </div>
                      <div className={`text-xs font-semibold ${statusClass(order.status)}`}>
                        {order.status || "OPEN"}
                      </div>
                    </div>
                    <div className="mt-4 flex justify-between text-sm text-white/50">
                      <span>{(order.items || order.order_items || []).length} item(s)</span>
                      <span>{formatMoney(order.total_amount ?? order.total, currencyCode)}</span>
                    </div>
                  </button>
                ))
              ) : (
                <div className="p-8 text-center text-sm text-white/35">
                  No matching orders.
                </div>
              )}
            </div>
          </div>

          <aside className="rounded-[30px] border border-white/10 bg-white/[0.03] p-6">
            {selectedOrder ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-[#D6A66A]">
                      Order Detail
                    </p>
                    <h2 className="mt-2 text-3xl font-light">
                      {selectedOrder.context?.label ||
                        selectedOrder.context?.reference ||
                        `Unassigned ${contextLabel.toLowerCase()}`}
                    </h2>
                    <p className="mt-1 text-xs text-white/35">
                      {selectedOrder.order_number || selectedOrder.id}
                    </p>
                  </div>
                  <div className={`text-sm font-semibold ${statusClass(selectedOrder.status)}`}>
                    {selectedOrder.status}
                  </div>
                </div>

                <div className="mt-6 space-y-2">
                  {selectedItems.length ? (
                    selectedItems.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 p-4"
                      >
                        <div>
                          <div className="font-medium">
                            {item.item_name || item.name || "Item"}
                          </div>
                          <div className="mt-1 text-xs text-white/35">
                            {item.status || "ORDERED"}
                          </div>
                        </div>
                        <div className="text-sm text-white/55">
                          {Number(item.quantity || 1)} × {formatMoney(item.price, currencyCode)}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-white/10 p-4 text-sm text-white/35">
                      No items found.
                    </div>
                  )}
                </div>

                <div className="mt-6 space-y-3 border-t border-white/10 pt-5">
                  <div className="flex justify-between text-sm text-white/50">
                    <span>Total</span>
                    <span>{formatMoney(selectedOrder.total_amount ?? selectedOrder.total, currencyCode)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-white/50">
                    <span>Paid</span>
                    <span>{formatMoney(selectedOrder.paid_amount, currencyCode)}</span>
                  </div>
                  <div className="flex justify-between text-xl font-semibold">
                    <span>Remaining</span>
                    <span>{formatMoney(selectedOrder.remaining_balance, currencyCode)}</span>
                  </div>
                </div>

                <button
                  onClick={() => openPayment(selectedOrder)}
                  disabled={
                    (!selectedOrder.context?.id && !selectedOrder.context?.reference) ||
                    selectedOrder.remaining_balance <= 0
                  }
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#D6A66A] py-4 text-sm font-semibold text-black disabled:opacity-35"
                >
                  <CreditCard size={17} /> Open Payment
                </button>
              </>
            ) : (
              <div className="text-sm text-white/35">
                Select an order to inspect it.
              </div>
            )}
          </aside>
        </section>
      </div>
    </main>
  );
}
