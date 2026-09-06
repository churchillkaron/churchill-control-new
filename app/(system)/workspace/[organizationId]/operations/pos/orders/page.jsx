"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { CreditCard, Monitor, RefreshCw, Search, ShieldAlert, X } from "lucide-react";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import usePOSRealtime from "@/lib/operations/commerce/realtime/usePOSRealtime";

const FALLBACK_REFRESH_MS = 10000;
const PRE_PRODUCTION_STATUSES = new Set(["NEW", "PENDING"]);

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
  if (["CANCELLED", "CANCELED", "VOID", "VOIDED"].includes(value)) return "text-red-300";
  return "text-[#D6A66A]";
}

function contextSearchValue(context) {
  return [context?.label, context?.reference, context?.id]
    .filter(Boolean)
    .join(" ");
}

function realtimeLabel(status, refreshing) {
  if (refreshing) return "Refreshing";
  if (status === "live") return "Live";
  if (status === "connecting") return "Connecting";
  if (status === "polling") return "Polling fallback";
  return "Offline";
}

function itemStatus(item) {
  return String(item?.status || "NEW").trim().toUpperCase();
}

export default function POSOrdersPage({ posConfiguration, posRuntime }) {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const businessContext = useBusinessContext() || {};
  const organizationId =
    params?.organizationId ||
    businessContext.organization_id ||
    businessContext.organization?.id ||
    null;
  const entityId =
    posRuntime?.terminal?.entity_id ||
    posRuntime?.entity_id ||
    businessContext.entity_id ||
    businessContext.entity?.id ||
    null;
  const applicationId = String(
    posRuntime?.application?.id || posConfiguration?.applicationId || ""
  ).trim().toLowerCase();
  const isRestaurant = applicationId === "restaurant";
  const currencyCode =
    businessContext.entity?.currency ||
    businessContext.entity?.currency_code ||
    businessContext.organization?.currency_code ||
    businessContext.organization?.currency ||
    businessContext.currency ||
    null;
  const contextQueryKey = posConfiguration?.context?.queryKey || "service_context";
  const contextLabel = posConfiguration?.context?.singularLabel || "Context";
  const orderEyebrow =
    posConfiguration?.presentation?.orderEyebrow || "Commerce Operations";
  const requestedContext =
    searchParams.get(contextQueryKey) || searchParams.get("table") || "";
  const orderRefreshRef = useRef(false);

  const [orders, setOrders] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ACTIVE");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [voidingItemId, setVoidingItemId] = useState(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidBusy, setVoidBusy] = useState(false);

  const canVoidItems = Boolean(
    isRestaurant &&
      entityId &&
      posRuntime?.capabilities?.actions?.void_order_item === true &&
      posRuntime?.capabilities?.item_corrections_ready === true
  );

  const loadOrders = useCallback(async ({ silent = false } = {}) => {
    if (!organizationId || !entityId || orderRefreshRef.current) return;

    orderRefreshRef.current = true;
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const orderQuery = new URLSearchParams({
        organizationId: String(organizationId),
        entityId: String(entityId),
      });
      if (applicationId) orderQuery.set("applicationId", applicationId);
      const response = await fetch(
        `/api/pos/orders?${orderQuery.toString()}`,
        { cache: "no-store", credentials: "include" }
      );
      const result = await response.json();
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Unable to load orders");
      }

      const loadedOrders = result.orders || [];
      const requested = requestedContext
        ? loadedOrders.find((order) =>
            [order.context?.id, order.context?.reference].some(
              (value) => String(value || "") === String(requestedContext)
            )
          )
        : null;

      setOrders(loadedOrders);
      setSelectedOrderId((current) => {
        if (current && loadedOrders.some((order) => order.id === current)) {
          return current;
        }
        return requested?.id || loadedOrders[0]?.id || null;
      });
    } catch (loadError) {
      if (!silent) {
        setOrders([]);
        setSelectedOrderId(null);
      }
      setError(loadError.message);
    } finally {
      orderRefreshRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, [applicationId, entityId, organizationId, requestedContext]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const refreshOrders = useCallback(() => {
    loadOrders({ silent: true });
  }, [loadOrders]);

  const realtimeStatus = usePOSRealtime({
    organizationId,
    applicationSubscriptions:
      posConfiguration?.realtimeSubscriptions || [],
    enabled: Boolean(organizationId && entityId),
    onChange: refreshOrders,
  });

  useEffect(() => {
    if (!organizationId || !entityId) return undefined;

    window.addEventListener("focus", refreshOrders);

    if (realtimeStatus === "live") {
      return () => {
        window.removeEventListener("focus", refreshOrders);
      };
    }

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        refreshOrders();
      }
    }, FALLBACK_REFRESH_MS);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshOrders);
    };
  }, [entityId, organizationId, realtimeStatus, refreshOrders]);

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
  const syncStatus = realtimeLabel(realtimeStatus, refreshing);

  function openPOS(order) {
    const context = order?.context;
    if (!context?.id && !context?.reference) return;
    const next = new URLSearchParams({ view: isRestaurant ? "sell" : "checkout" });
    if (isRestaurant) {
      next.set("table", context.reference || context.id);
    } else {
      next.set(contextQueryKey, context.id || context.reference);
    }
    router.push(
      `/workspace/${organizationId}/operations/pos?${next.toString()}`
    );
  }

  function beginVoid(item) {
    if (!canVoidItems || !PRE_PRODUCTION_STATUSES.has(itemStatus(item))) return;
    setVoidingItemId(item.id);
    setVoidReason("");
    setMessage(null);
    setError(null);
  }

  function cancelVoid() {
    setVoidingItemId(null);
    setVoidReason("");
  }

  async function confirmVoid(item) {
    if (!selectedOrder || !item?.id || !canVoidItems || !voidReason.trim()) return;
    const idempotencyKey = `restaurant-item-void:${selectedOrder.id}:${item.id}:${crypto.randomUUID()}`;
    setVoidBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/pos/item-corrections", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          organizationId,
          entityId,
          applicationId: "restaurant",
          orderId: selectedOrder.id,
          orderItemId: item.id,
          correctionType: "VOID",
          reason: voidReason.trim(),
          idempotencyKey,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Unable to void restaurant item");
      }
      cancelVoid();
      setMessage(
        result.dispatch_pending
          ? "Item voided · downstream event dispatch pending"
          : "Item voided before production"
      );
      await loadOrders({ silent: true });
    } catch (voidError) {
      setError(voidError?.message || "Unable to void restaurant item");
    } finally {
      setVoidBusy(false);
    }
  }

  if (!entityId) {
    return (
      <main className="min-h-screen bg-black px-6 py-8 text-white">
        <div className="mx-auto max-w-[1600px] rounded-[30px] border border-white/10 bg-white/[0.03] p-6 text-sm text-white/50">
          Select an active legal entity before loading Order Control.
        </div>
      </main>
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
            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
                {syncStatus}
              </div>
              <button
                type="button"
                onClick={refreshOrders}
                disabled={refreshing}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-white/60 disabled:opacity-35"
              >
                <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
                Refresh
              </button>
            </div>
          </div>
          {message ? (
            <div className="mt-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4 text-sm text-emerald-700">
              {message}
            </div>
          ) : null}
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
                  type="button"
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
                    type="button"
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
                    selectedItems.map((item) => {
                      const status = itemStatus(item);
                      const voidEligible = canVoidItems && PRE_PRODUCTION_STATUSES.has(status);
                      const voidOpen = voidingItemId === item.id;

                      return (
                        <div
                          key={item.id}
                          className="rounded-xl border border-white/10 bg-black/20 p-4"
                          data-restaurant-order-item={item.id}
                        >
                          <div className="flex items-center justify-between gap-4">
                            <div className="min-w-0">
                              <div className="font-medium">
                                {item.item_name || item.name || "Item"}
                              </div>
                              <div className={`mt-1 text-xs ${statusClass(status)}`}>
                                {status}
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-3">
                              <div className="text-sm text-white/55">
                                {Number(item.quantity || 1)} × {formatMoney(item.price, currencyCode)}
                              </div>
                              {voidEligible && !voidOpen ? (
                                <button
                                  type="button"
                                  onClick={() => beginVoid(item)}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/[0.05] px-2.5 py-1.5 text-[10px] font-semibold text-red-700"
                                  data-restaurant-item-void-action="true"
                                >
                                  <ShieldAlert size={12} /> Void
                                </button>
                              ) : null}
                            </div>
                          </div>

                          {voidOpen ? (
                            <div className="mt-3 rounded-xl border border-red-500/15 bg-red-500/[0.04] p-3" data-restaurant-item-void-editor="true">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-red-700">Pre-production void</div>
                                  <div className="mt-1 text-[11px] leading-4 text-white/45">Reason is required. The original item remains in the audit trail. Once production starts, VOID is no longer allowed.</div>
                                </div>
                                <button type="button" onClick={cancelVoid} className="rounded-lg p-1 text-white/35" aria-label="Cancel item void">
                                  <X size={14} />
                                </button>
                              </div>
                              <textarea
                                value={voidReason}
                                onChange={(event) => setVoidReason(event.target.value)}
                                rows={2}
                                placeholder="Why is this item being voided?"
                                className="mt-3 w-full resize-none rounded-xl border border-white/10 bg-white px-3 py-2 text-xs text-[#191919] outline-none"
                              />
                              <button
                                type="button"
                                disabled={!voidReason.trim() || voidBusy}
                                onClick={() => confirmVoid(item)}
                                className="mt-2 w-full rounded-xl bg-[#25231F] px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-30"
                              >
                                {voidBusy ? "Voiding..." : "Confirm void"}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      );
                    })
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
                  type="button"
                  onClick={() => openPOS(selectedOrder)}
                  disabled={
                    (!selectedOrder.context?.id && !selectedOrder.context?.reference) ||
                    (!isRestaurant && selectedOrder.remaining_balance <= 0)
                  }
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#D6A66A] py-4 text-sm font-semibold text-black disabled:opacity-35"
                  data-restaurant-open-stationary-pos={isRestaurant ? "true" : undefined}
                >
                  {isRestaurant ? <Monitor size={17} /> : <CreditCard size={17} />}
                  {isRestaurant ? "Open stationary POS" : "Open Payment"}
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
