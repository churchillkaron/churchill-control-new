"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { RefreshCw, Search, ShieldCheck, PackageCheck } from "lucide-react";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

function money(value, currency) {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat(
      undefined,
      currency
        ? { style: "currency", currency }
        : { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    ).format(amount);
  } catch {
    return amount.toFixed(2);
  }
}

function statusClass(status) {
  const value = String(status || "").toUpperCase();
  if (["CONFIRMED", "FULFILLED", "CLOSED"].includes(value)) {
    return "text-emerald-300";
  }
  if (["CANCELLED"].includes(value)) return "text-red-300";
  return "text-[#D6A66A]";
}

function customerLabel(order = {}) {
  const {
    customer,
    customer_display_name: customerDisplayName,
    customer_name: customerName,
    party_name: partyName,
  } = order;

  return (
    customer?.name ||
    customer?.display_name ||
    customerDisplayName ||
    customerName ||
    partyName ||
    null
  );
}

function normalized(value) {
  return String(value || "").trim().toUpperCase();
}

export default function RetailOrdersWorkspace() {
  const params = useParams();
  const businessContext = useBusinessContext() || {};
  const organizationId =
    params?.organizationId ||
    businessContext.organization_id ||
    businessContext.organization?.id ||
    null;
  const entityId = businessContext.entity_id || businessContext.entity?.id || null;
  const currency =
    businessContext.entity?.currency ||
    businessContext.organization?.currency_code ||
    businessContext.currency ||
    null;

  const [orders, setOrders] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const loadOrders = useCallback(async () => {
    if (!organizationId || !entityId) {
      setOrders([]);
      setLoading(false);
      setError("Select an active legal entity before loading retail sales orders");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const search = new URLSearchParams({
        organizationId,
        entityId,
        applicationId: "retail",
      });
      const response = await fetch(`/api/pos/orders?${search.toString()}`, {
        cache: "no-store",
        credentials: "include",
      });
      const result = await response.json();
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Unable to load retail sales orders");
      }
      const rows = result.orders || [];
      setOrders(rows);
      setSelectedId((current) =>
        rows.some((row) => row.id === current) ? current : rows[0]?.id || null
      );
    } catch (loadError) {
      setOrders([]);
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [entityId, organizationId]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const visibleOrders = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return orders;
    return orders.filter((order) =>
      [
        order.id,
        order.order_number,
        order.status,
        order.payment_status,
        order.fulfillment_status,
        customerLabel(order),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [orders, query]);

  const selected = orders.find((order) => order.id === selectedId) || null;
  const lines = selected?.items || selected?.order_items || [];
  const orderStatus = normalized(selected?.status);
  const paymentStatus = normalized(selected?.payment_status);
  const fulfillmentStatus = normalized(selected?.fulfillment_status);
  const isDraft = orderStatus === "DRAFT";
  const isConfirmedUnpaid =
    orderStatus === "CONFIRMED" &&
    paymentStatus === "UNPAID" &&
    fulfillmentStatus === "RESERVED";
  const isPaidReserved =
    orderStatus === "CONFIRMED" &&
    paymentStatus === "PAID" &&
    fulfillmentStatus === "RESERVED";
  const isFulfilled =
    orderStatus === "FULFILLED" && fulfillmentStatus === "FULFILLED";

  async function confirmSelected() {
    if (!selected || !organizationId || !entityId || actionLoading) return;

    setActionLoading(true);
    setError(null);
    setNotice(null);
    const idempotencyKey = `sales-order-confirm:${selected.id}`;

    try {
      const response = await fetch("/api/commercial/sales/orders", {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          action: "CONFIRM",
          organizationId,
          entityId,
          salesOrderId: selected.id,
          idempotencyKey,
        }),
      });
      const result = await response.json();
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Unable to confirm sales order");
      }

      setNotice(
        `${result.order_number || "Sales order"} confirmed and inventory reserved.`
      );
      await loadOrders();
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function fulfillSelected() {
    if (!selected || !organizationId || !entityId || actionLoading) return;

    setActionLoading(true);
    setError(null);
    setNotice(null);
    const idempotencyKey = `sales-order-fulfill:${selected.id}`;

    try {
      const response = await fetch("/api/inventory/fulfillment/sales-orders", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          organizationId,
          entityId,
          salesOrderId: selected.id,
          idempotencyKey,
        }),
      });
      const result = await response.json();

      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Unable to fulfill sales order");
      }

      setNotice(
        `${result.order_number || selected.order_number || "Sales order"} fulfilled and reserved inventory consumed.`
      );
      await loadOrders();
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-black px-6 py-8 text-white">
      <div className="mx-auto max-w-[1500px]">
        <header className="rounded-[32px] border border-white/10 bg-white/[0.035] p-7">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-[#D6A66A]">
                Commercial Sales Orders
              </p>
              <h1 className="mt-3 text-4xl font-semibold">Retail sales orders</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-white/45">
                Confirmed orders reserve entity-scoped inventory. Paid reserved orders
                can then be fulfilled, consuming the reservation into canonical SALE
                inventory movements.
              </p>
            </div>
            <button
              type="button"
              onClick={loadOrders}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-white/60"
            >
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
          {error ? (
            <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
              {error}
            </div>
          ) : null}
          {notice ? (
            <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
              {notice}
            </div>
          ) : null}
        </header>

        <section className="mt-6 grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
          <div className="rounded-[28px] border border-white/10 bg-white/[0.025] p-5">
            <div className="flex items-center rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-white/35">
              <Search size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search order, status or customer"
                className="ml-3 w-full bg-transparent text-sm text-white outline-none"
              />
            </div>

            <div className="mt-4 max-h-[650px] space-y-2 overflow-y-auto">
              {loading ? (
                <div className="p-10 text-center text-sm text-white/35">
                  Loading sales orders...
                </div>
              ) : visibleOrders.length ? (
                visibleOrders.map((order) => (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(order.id);
                      setNotice(null);
                    }}
                    className={`w-full rounded-2xl border p-4 text-left ${
                      selectedId === order.id
                        ? "border-[#D6A66A]/45 bg-[#D6A66A]/10"
                        : "border-white/10 bg-black/20"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="font-semibold">
                          {order.order_number || `Draft ${String(order.id).slice(0, 8)}`}
                        </div>
                        <div className="mt-1 text-xs text-white/35">
                          {new Date(order.created_at).toLocaleString()}
                        </div>
                      </div>
                      <div className={`text-xs ${statusClass(order.status)}`}>
                        {order.status}
                      </div>
                    </div>
                    <div className="mt-4 flex justify-between text-sm text-white/50">
                      <span>{(order.items || []).length} line(s)</span>
                      <span>{money(order.total_amount, order.currency_code || currency)}</span>
                    </div>
                  </button>
                ))
              ) : (
                <div className="p-10 text-center text-sm text-white/35">
                  No retail sales orders found.
                </div>
              )}
            </div>
          </div>

          <aside className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
            {selected ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-[#D6A66A]">
                      Sales Order
                    </p>
                    <h2 className="mt-2 text-3xl font-light">
                      {selected.order_number || `Draft ${String(selected.id).slice(0, 8)}`}
                    </h2>
                    <p className="mt-1 text-xs text-white/35">{selected.id}</p>
                  </div>
                  <div className="text-right text-xs">
                    <div className={statusClass(selected.status)}>{selected.status}</div>
                    <div className="mt-1 text-white/35">{selected.payment_status}</div>
                    <div className="mt-1 text-white/35">{selected.fulfillment_status}</div>
                  </div>
                </div>

                <div className="mt-6 space-y-2">
                  {lines.map((line) => (
                    <div
                      key={line.id}
                      className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/20 p-4"
                    >
                      <div>
                        <div className="font-medium">{line.item_name || line.name}</div>
                        <div className="mt-1 text-xs text-white/35">
                          {[line.sku, line.barcode].filter(Boolean).join(" · ") || "Catalog item"}
                        </div>
                      </div>
                      <div className="text-right text-sm text-white/55">
                        <div>
                          {Number(line.quantity)} × {money(line.unit_price, selected.currency_code || currency)}
                        </div>
                        <div className="mt-1 text-xs text-white/30">
                          {money(line.line_total, selected.currency_code || currency)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 space-y-3 border-t border-white/10 pt-5">
                  <div className="flex justify-between text-sm text-white/50">
                    <span>Subtotal</span>
                    <span>{money(selected.subtotal, selected.currency_code || currency)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-white/50">
                    <span>Tax</span>
                    <span>{money(selected.tax_amount, selected.currency_code || currency)}</span>
                  </div>
                  <div className="flex justify-between text-xl font-semibold">
                    <span>Total</span>
                    <span>{money(selected.total_amount, selected.currency_code || currency)}</span>
                  </div>
                </div>

                {isDraft ? (
                  <button
                    type="button"
                    onClick={confirmSelected}
                    disabled={actionLoading}
                    className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#D6A66A] px-4 py-4 text-sm font-semibold text-black disabled:opacity-35"
                  >
                    <ShieldCheck size={17} />
                    {actionLoading ? "Confirming..." : "Confirm and reserve stock"}
                  </button>
                ) : null}

                {isPaidReserved ? (
                  <button
                    type="button"
                    onClick={fulfillSelected}
                    disabled={actionLoading}
                    className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#D6A66A] px-4 py-4 text-sm font-semibold text-black disabled:opacity-35"
                  >
                    <PackageCheck size={17} />
                    {actionLoading ? "Fulfilling..." : "Fulfill sale"}
                  </button>
                ) : null}

                {isConfirmedUnpaid ? (
                  <div className="mt-6 rounded-2xl border border-[#D6A66A]/20 bg-[#D6A66A]/[0.06] p-4 text-xs leading-5 text-[#E8C89D]/75">
                    Inventory is reserved. This order can proceed to Retail cash checkout
                    when an active cash session is open for the selected legal entity.
                  </div>
                ) : null}

                {isPaidReserved ? (
                  <div className="mt-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] p-4 text-xs leading-5 text-emerald-100/70">
                    Payment is complete and inventory remains reserved. Fulfillment will
                    consume the reservation into canonical SALE stock movements.
                  </div>
                ) : null}

                {isFulfilled ? (
                  <div className="mt-6 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] p-4 text-xs leading-5 text-emerald-100/70">
                    Fulfillment is complete. Reserved inventory has been consumed and the
                    sales order is closed from the stock-fulfillment perspective.
                  </div>
                ) : null}

                {!isDraft && !isConfirmedUnpaid && !isPaidReserved && !isFulfilled ? (
                  <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-xs leading-5 text-white/45">
                    This sales order is not currently eligible for a Retail lifecycle action.
                  </div>
                ) : null}

                {isDraft ? (
                  <p className="mt-3 text-xs leading-5 text-white/35">
                    Confirmation fails safely when stock is insufficient or no active
                    SALES_ORDER number sequence is configured.
                  </p>
                ) : null}
              </>
            ) : (
              <div className="text-sm text-white/35">Select a sales order.</div>
            )}
          </aside>
        </section>
      </div>
    </main>
  );
}
