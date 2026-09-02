"use client";

import { useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  PackageSearch,
  RefreshCw,
  Search,
  ShoppingBasket,
} from "lucide-react";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

function money(value, currency) {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat(
      undefined,
      currency
        ? { style: "currency", currency, maximumFractionDigits: 2 }
        : { maximumFractionDigits: 2 },
    ).format(amount);
  } catch {
    return amount.toFixed(2);
  }
}

function availabilityLabel(item) {
  const onHand = item?.availability?.on_hand;
  if (onHand === null || onHand === undefined) return "Stock unknown";
  if (Number(onHand) <= 0) return "Out of stock";
  return `${Number(onHand)} available`;
}

export default function RetailCatalogWorkspace({
  posRuntime,
  onSaleReady,
}) {
  const params = useParams();
  const businessContext = useBusinessContext() || {};
  const organizationId =
    params?.organizationId ||
    businessContext.organization_id ||
    businessContext.organization?.id ||
    null;
  const entityId = businessContext.entity_id || businessContext.entity?.id || null;
  const runtime = posRuntime || null;

  const [query, setQuery] = useState("");
  const [basket, setBasket] = useState({});
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);
  const [readySale, setReadySale] = useState(null);
  const idempotencyKeyRef = useRef(null);

  const items = runtime?.catalog?.items || [];
  const currency =
    runtime?.organization?.currency_code ||
    runtime?.terminal?.currency_code ||
    businessContext.entity?.currency ||
    businessContext.entity?.currency_code ||
    null;

  const visibleItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) =>
      [item.name, item.sku, item.barcode, item.category]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [items, query]);

  const basketLines = Object.values(basket);
  const basketQuantity = basketLines.reduce(
    (sum, line) => sum + Number(line.quantity || 0),
    0,
  );
  const basketTotal = basketLines.reduce(
    (sum, line) => sum + Number(line.item.price || 0) * Number(line.quantity || 0),
    0,
  );
  const canCreate = Boolean(
    organizationId &&
      entityId &&
      runtime?.catalog_ready &&
      runtime?.availability_ready &&
      basketLines.length &&
      !creating,
  );

  function invalidateDraftIdentity() {
    idempotencyKeyRef.current = null;
    setReadySale(null);
  }

  function addItem(item) {
    if (!item.available) return;
    invalidateDraftIdentity();
    setBasket((current) => ({
      ...current,
      [item.id]: {
        item,
        quantity: Number(current[item.id]?.quantity || 0) + 1,
      },
    }));
  }

  function setQuantity(itemId, quantity) {
    invalidateDraftIdentity();
    setBasket((current) => {
      const next = { ...current };
      if (!next[itemId]) return current;
      if (quantity <= 0) delete next[itemId];
      else next[itemId] = { ...next[itemId], quantity };
      return next;
    });
  }

  async function confirmAndReserve(salesOrderId) {
    const idempotencyKey = `sales-order-confirm:${salesOrderId}`;
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
        salesOrderId,
        idempotencyKey,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.success === false) {
      const error = new Error(result.error || "Unable to confirm sale and reserve stock");
      error.salesOrderId = salesOrderId;
      throw error;
    }
    return result;
  }

  async function completeSale() {
    if (!canCreate) return;
    setCreating(true);
    setError(null);
    setReadySale(null);

    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = `retail-pos:${organizationId}:${entityId}:${crypto.randomUUID()}`;
    }

    try {
      const response = await fetch("/api/pos/create", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKeyRef.current,
        },
        body: JSON.stringify({
          organizationId,
          entityId,
          applicationId: "retail",
          channel: "POS",
          sourceType: "point_of_sale",
          idempotencyKey: idempotencyKeyRef.current,
          items: basketLines.map(({ item, quantity }) => ({
            item_id: item.id,
            quantity,
          })),
        }),
      });
      const draft = await response.json().catch(() => ({}));
      if (!response.ok || draft.success === false) {
        throw new Error(draft.error || "Unable to create retail sale");
      }

      const salesOrderId = draft.sales_order_id || draft.order_id || draft.order?.id;
      if (!salesOrderId) {
        throw new Error("Retail sale was created without a sales order id");
      }

      const confirmed = await confirmAndReserve(salesOrderId);
      const sale = {
        sales_order_id: salesOrderId,
        order_number: confirmed.order_number || draft.order_number || null,
        status: "CONFIRMED",
        fulfillment_status: "RESERVED",
        payment_status: "UNPAID",
      };

      setReadySale(sale);
      setBasket({});
      idempotencyKeyRef.current = null;
      await onSaleReady?.(sale);
    } catch (createError) {
      setError(
        createError?.salesOrderId
          ? `${createError.message}. The draft sale was preserved and can be reviewed in Orders.`
          : createError?.message || "Unable to prepare sale for checkout",
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#070707] px-4 py-5 text-white lg:px-6">
      <div className="mx-auto max-w-[1700px]">
        <header className="rounded-[26px] border border-white/10 bg-white/[0.035] p-5">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#D6A66A]">Retail Selling</p>
              <h1 className="mt-2 text-2xl font-semibold">Catalog, basket and checkout</h1>
              <p className="mt-2 max-w-3xl text-xs leading-5 text-white/45">
                Add products, validate live availability, confirm the sale and reserve stock. The checkout panel becomes payable immediately after the governed confirmation succeeds.
              </p>
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-white/60"
            >
              <RefreshCw size={14} /> Refresh
            </button>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="text-[10px] uppercase tracking-[0.16em] text-white/35">Catalog</div>
              <div className="mt-2 text-2xl">{runtime?.catalog?.item_count || 0}</div>
              <div className="mt-1 text-[10px] text-white/35">Canonical sellable items</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="text-[10px] uppercase tracking-[0.16em] text-white/35">Available</div>
              <div className="mt-2 text-2xl">{runtime?.catalog?.available_item_count || 0}</div>
              <div className="mt-1 text-[10px] text-white/35">Available in selected entity</div>
            </div>
            <div className="rounded-2xl border border-[#D6A66A]/25 bg-[#D6A66A]/[0.06] p-4">
              <div className="text-[10px] uppercase tracking-[0.16em] text-[#D6A66A]">Sale lifecycle</div>
              <div className="mt-2 text-base">Basket → Reserve → Pay</div>
              <div className="mt-1 text-[10px] text-white/40">No separate confirm screen required</div>
            </div>
          </div>

          {error ? (
            <div className="mt-4 flex gap-3 rounded-2xl border border-red-400/20 bg-red-500/10 p-3 text-xs text-red-100">
              <AlertCircle size={15} className="shrink-0" /> {error}
            </div>
          ) : null}

          {readySale ? (
            <div className="mt-4 flex items-center gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-xs text-emerald-100">
              <CheckCircle2 size={16} />
              {readySale.order_number || `Sale ${String(readySale.sales_order_id).slice(0, 8)}`} is confirmed, stock reserved and ready for payment.
            </div>
          ) : null}
        </header>

        <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_360px]">
          <section>
            <div className="relative mb-4">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search item, SKU, barcode or category"
                className="w-full rounded-2xl border border-white/10 bg-white/[0.035] py-3 pl-11 pr-4 text-sm outline-none placeholder:text-white/25 focus:border-[#D6A66A]/50"
              />
            </div>

            {visibleItems.length ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {visibleItems.map((item) => (
                  <article key={item.id} className="flex min-h-[190px] flex-col rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.14em] text-[#D6A66A]">{item.category || "Item"}</div>
                        <h2 className="mt-2 text-sm font-semibold">{item.name}</h2>
                        <div className="mt-1 text-[10px] text-white/35">{[item.sku, item.barcode].filter(Boolean).join(" · ") || "No SKU or barcode"}</div>
                      </div>
                      <PackageSearch size={16} className="text-white/25" />
                    </div>
                    <div className="mt-auto flex items-end justify-between gap-3 pt-4">
                      <div>
                        <div className="text-lg font-semibold">{money(item.price, currency)}</div>
                        <div className={item.available ? "mt-1 text-[10px] text-emerald-300/70" : "mt-1 text-[10px] text-red-300/70"}>{availabilityLabel(item)}</div>
                      </div>
                      <button
                        type="button"
                        disabled={!item.available}
                        onClick={() => addItem(item)}
                        className="rounded-xl bg-[#D6A66A] px-3 py-2 text-[10px] font-semibold text-black disabled:opacity-30"
                      >
                        Add
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-white/10 p-10 text-center text-sm text-white/35">No catalog items match this search.</div>
            )}
          </section>

          <aside className="h-fit rounded-[24px] border border-white/10 bg-white/[0.035] p-4 xl:sticky xl:top-24">
            <div className="flex items-center gap-3">
              <ShoppingBasket size={17} className="text-[#D6A66A]" />
              <div>
                <div className="text-sm font-semibold">Current basket</div>
                <div className="text-[10px] text-white/35">{basketQuantity} item(s)</div>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {basketLines.length ? basketLines.map(({ item, quantity }) => (
                <div key={item.id} className="rounded-2xl border border-white/10 bg-black/25 p-3">
                  <div className="flex justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium">{item.name}</div>
                      <div className="mt-1 text-[10px] text-white/35">{money(item.price, currency)} each</div>
                    </div>
                    <div className="text-xs">{money(item.price * quantity, currency)}</div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <button type="button" onClick={() => setQuantity(item.id, quantity - 1)} className="h-7 w-7 rounded-lg border border-white/10">−</button>
                    <div className="min-w-7 text-center text-xs">{quantity}</div>
                    <button type="button" onClick={() => setQuantity(item.id, quantity + 1)} className="h-7 w-7 rounded-lg border border-white/10">+</button>
                  </div>
                </div>
              )) : (
                <div className="rounded-2xl border border-dashed border-white/10 p-5 text-center text-xs text-white/30">Add products to start a sale.</div>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
              <span className="text-xs text-white/45">Total</span>
              <span className="text-lg font-semibold">{money(basketTotal, currency)}</span>
            </div>

            <button
              type="button"
              disabled={!canCreate}
              onClick={completeSale}
              className="mt-4 w-full rounded-2xl bg-[#D6A66A] px-4 py-3 text-sm font-semibold text-black disabled:opacity-35"
            >
              {creating ? "Preparing checkout..." : "Confirm sale & continue to pay"}
            </button>
            <p className="mt-3 text-[10px] leading-4 text-white/35">
              Prices and tax are revalidated server-side. Inventory reservation uses the existing governed Commercial confirmation contract before checkout is enabled.
            </p>
          </aside>
        </div>
      </div>
    </main>
  );
}
