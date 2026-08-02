"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { AlertCircle, PackageSearch, RefreshCw, Search, ShoppingBasket } from "lucide-react";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

function money(value, currency) {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat(undefined, currency
      ? { style: "currency", currency, maximumFractionDigits: 2 }
      : { maximumFractionDigits: 2 }).format(amount);
  } catch {
    return amount.toFixed(2);
  }
}

function availabilityLabel(item) {
  const status = item?.availability?.status;
  const onHand = item?.availability?.on_hand;
  if (status === "unknown" || onHand === null || onHand === undefined) {
    return "Stock unknown";
  }
  if (status === "out_of_stock") return "Out of stock";
  return `${Number(onHand || 0)} available`;
}

export default function RetailCatalogWorkspace() {
  const params = useParams();
  const businessContext = useBusinessContext() || {};
  const organizationId =
    params?.organizationId ||
    businessContext.organization_id ||
    businessContext.organization?.id ||
    null;
  const entityId =
    businessContext.entity_id ||
    businessContext.entity?.id ||
    null;

  const [runtime, setRuntime] = useState(null);
  const [query, setQuery] = useState("");
  const [basket, setBasket] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadRuntime = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams({
        organizationId,
        applicationId: "retail",
      });
      if (entityId) queryParams.set("entityId", entityId);

      const response = await fetch(
        `/api/pos/runtime?${queryParams.toString()}`,
        { cache: "no-store", credentials: "include" }
      );
      const result = await response.json();
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Unable to load retail catalog");
      }
      setRuntime(result);
    } catch (loadError) {
      setError(loadError.message);
      setRuntime(null);
    } finally {
      setLoading(false);
    }
  }, [entityId, organizationId]);

  useEffect(() => {
    loadRuntime();
  }, [loadRuntime]);

  const items = runtime?.catalog?.items || [];
  const currency =
    runtime?.organization?.currency_code ||
    runtime?.terminal?.currency_code ||
    null;
  const visibleItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) =>
      [item.name, item.sku, item.barcode, item.category]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    );
  }, [items, query]);

  const basketLines = Object.values(basket);
  const basketQuantity = basketLines.reduce(
    (sum, line) => sum + Number(line.quantity || 0),
    0
  );
  const basketTotal = basketLines.reduce(
    (sum, line) => sum + Number(line.item.price || 0) * Number(line.quantity || 0),
    0
  );

  function addItem(item) {
    if (!item.available) return;
    setBasket((current) => {
      const existing = current[item.id];
      return {
        ...current,
        [item.id]: {
          item,
          quantity: Number(existing?.quantity || 0) + 1,
        },
      };
    });
  }

  function setQuantity(itemId, quantity) {
    setBasket((current) => {
      const next = { ...current };
      if (!next[itemId]) return current;
      if (quantity <= 0) delete next[itemId];
      else next[itemId] = { ...next[itemId], quantity };
      return next;
    });
  }

  const transactionState = runtime?.availability_ready
    ? "Catalog ready · Checkout blocked"
    : "Select entity · Stock blocked";

  return (
    <main className="min-h-screen bg-[#070707] px-5 py-6 text-white lg:px-8">
      <div className="mx-auto max-w-[1700px]">
        <header className="rounded-[30px] border border-white/10 bg-white/[0.035] p-6">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-[#D6A66A]">
                Retail Selling
              </p>
              <h1 className="mt-3 text-3xl font-semibold">Catalog and availability</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-white/45">
                Browse canonical inventory items and entity-scoped stock. Basket creation is local until the Commercial sales-order contract is activated.
              </p>
            </div>
            <button
              type="button"
              onClick={loadRuntime}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-white/60"
            >
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-white/35">Catalog</div>
              <div className="mt-2 text-2xl">{runtime?.catalog?.item_count || 0}</div>
              <div className="mt-1 text-xs text-white/35">Canonical inventory items</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-white/35">Available</div>
              <div className="mt-2 text-2xl">{runtime?.catalog?.available_item_count || 0}</div>
              <div className="mt-1 text-xs text-white/35">Items available in selected entity</div>
            </div>
            <div className="rounded-2xl border border-[#D6A66A]/25 bg-[#D6A66A]/[0.06] p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-[#D6A66A]">Transaction state</div>
              <div className="mt-2 text-lg">{transactionState}</div>
              <div className="mt-1 text-xs text-white/40">Sales-order and settlement contracts remain required</div>
            </div>
          </div>

          {error ? (
            <div className="mt-5 flex gap-3 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
              <AlertCircle size={17} className="shrink-0" /> {error}
            </div>
          ) : null}

          {!loading && runtime?.readiness?.state === "blocked" ? (
            <div className="mt-5 flex gap-3 rounded-2xl border border-[#D6A66A]/20 bg-[#D6A66A]/10 p-4 text-sm text-[#F3D7A2]">
              <AlertCircle size={17} className="shrink-0" />
              {runtime.readiness.reason}
            </div>
          ) : null}
        </header>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_390px]">
          <section>
            <div className="relative mb-5">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search item, SKU, barcode or category"
                className="w-full rounded-2xl border border-white/10 bg-white/[0.035] py-3 pl-11 pr-4 text-sm outline-none placeholder:text-white/25 focus:border-[#D6A66A]/50"
              />
            </div>

            {loading ? (
              <div className="rounded-3xl border border-white/10 p-12 text-center text-white/35">
                Loading retail catalog...
              </div>
            ) : visibleItems.length ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {visibleItems.map((item) => (
                  <article
                    key={item.id}
                    className="flex min-h-[230px] flex-col rounded-[26px] border border-white/10 bg-white/[0.03] p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs uppercase tracking-[0.14em] text-[#D6A66A]">
                          {item.category || "Item"}
                        </div>
                        <h2 className="mt-2 text-lg font-semibold">{item.name}</h2>
                        <div className="mt-1 text-xs text-white/35">
                          {[item.sku, item.barcode].filter(Boolean).join(" · ") || "No SKU or barcode"}
                        </div>
                      </div>
                      <PackageSearch size={18} className="text-white/25" />
                    </div>

                    <p className="mt-3 line-clamp-2 text-xs leading-5 text-white/40">
                      {item.description || "No product description"}
                    </p>

                    <div className="mt-auto pt-5">
                      <div className="flex items-end justify-between gap-3">
                        <div>
                          <div className="text-xl font-semibold">{money(item.price, currency)}</div>
                          <div className={item.available ? "mt-1 text-xs text-emerald-300/70" : "mt-1 text-xs text-red-300/70"}>
                            {availabilityLabel(item)}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={!item.available}
                          onClick={() => addItem(item)}
                          className="rounded-xl bg-[#D6A66A] px-4 py-2 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-white/10 p-12 text-center text-white/35">
                No catalog items match this search.
              </div>
            )}
          </section>

          <aside className="h-fit rounded-[28px] border border-white/10 bg-white/[0.035] p-5 xl:sticky xl:top-24">
            <div className="flex items-center gap-3">
              <ShoppingBasket size={18} className="text-[#D6A66A]" />
              <div>
                <div className="font-semibold">Current basket</div>
                <div className="text-xs text-white/35">{basketQuantity} items</div>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {basketLines.length ? (
                basketLines.map(({ item, quantity }) => (
                  <div key={item.id} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                    <div className="flex justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium">{item.name}</div>
                        <div className="mt-1 text-xs text-white/35">{money(item.price, currency)} each</div>
                      </div>
                      <div className="text-sm">{money(item.price * quantity, currency)}</div>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <button type="button" onClick={() => setQuantity(item.id, quantity - 1)} className="h-8 w-8 rounded-lg border border-white/10">−</button>
                      <div className="min-w-8 text-center text-sm">{quantity}</div>
                      <button type="button" onClick={() => setQuantity(item.id, quantity + 1)} className="h-8 w-8 rounded-lg border border-white/10">+</button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-white/30">
                  Add available catalog items to prepare a sale.
                </div>
              )}
            </div>

            <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
              <span className="text-sm text-white/45">Total</span>
              <span className="text-xl font-semibold">{money(basketTotal, currency)}</span>
            </div>

            <button
              type="button"
              disabled
              className="mt-4 w-full rounded-2xl bg-[#D6A66A] px-4 py-3 text-sm font-semibold text-black opacity-35"
            >
              Create sale unavailable
            </button>
            <p className="mt-3 text-xs leading-5 text-white/35">
              The basket is not persisted or charged. Commercial sales-order creation and Finance settlement must be implemented before checkout can be activated.
            </p>
          </aside>
        </div>
      </div>
    </main>
  );
}
