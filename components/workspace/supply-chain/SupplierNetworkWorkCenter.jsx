"use client";

import { useEffect, useMemo, useState } from "react";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

function money(value, currency = "THB") {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return currency + " " + amount.toFixed(2);
  }
}

export default function SupplierNetworkWorkCenter({ organizationId }) {
  const businessContext = useBusinessContext() || {};
  const entityId = businessContext.entity_id || businessContext.entity?.id || null;
  const [query, setQuery] = useState("");
  const [state, setState] = useState({ loading: true, suppliers: [], error: "" });
  const [connectionState, setConnectionState] = useState({});
  const [cart, setCart] = useState({});
  const [orderState, setOrderState] = useState({});

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setState((current) => ({ ...current, loading: true, error: "" }));
      try {
        const url = new URL("/api/supplier-network", window.location.origin);
        url.searchParams.set("organizationId", organizationId);
        if (query.trim()) url.searchParams.set("query", query.trim());
        const response = await fetch(url.toString(), { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to search Supplier Network");
        if (!cancelled) setState({ loading: false, suppliers: payload.suppliers || [], error: "" });
      } catch (error) {
        if (!cancelled) setState({ loading: false, suppliers: [], error: error?.message || "Unable to search Supplier Network" });
      }
    }, query ? 220 : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [organizationId, query]);

  const productCount = useMemo(() => state.suppliers.reduce((sum, supplier) => sum + (supplier.products?.length || 0), 0), [state.suppliers]);

  function setQuantity(supplierId, productId, value) {
    setCart((current) => ({
      ...current,
      [supplierId]: {
        ...(current[supplierId] || {}),
        [productId]: value,
      },
    }));
  }

  async function createOrder(supplier) {
    const selections = Object.entries(cart[supplier.id] || {})
      .map(([productId, quantity]) => ({ productId, quantity: Number(quantity || 0) }))
      .filter((row) => Number.isFinite(row.quantity) && row.quantity > 0);
    if (!entityId) {
      setOrderState((current) => ({ ...current, [supplier.id]: { loading: false, message: "", error: "Select a legal entity before ordering." } }));
      return;
    }
    if (!selections.length) {
      setOrderState((current) => ({ ...current, [supplier.id]: { loading: false, message: "", error: "Enter a quantity for at least one product." } }));
      return;
    }

    setOrderState((current) => ({ ...current, [supplier.id]: { loading: true, message: "", error: "" } }));
    try {
      const response = await fetch("/api/supplier-network/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          entityId,
          supplierAccountId: supplier.supplier_account_id,
          selections,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to create purchase order");
      setCart((current) => ({ ...current, [supplier.id]: {} }));
      setOrderState((current) => ({
        ...current,
        [supplier.id]: {
          loading: false,
          message: "Purchase order created · " + (payload.purchase_order?.po_number || payload.purchase_order?.id || "pending approval"),
          error: "",
        },
      }));
    } catch (error) {
      setOrderState((current) => ({ ...current, [supplier.id]: { loading: false, message: "", error: error?.message || "Unable to create purchase order" } }));
    }
  }

  async function requestConnection(supplier) {
    setConnectionState((current) => ({ ...current, [supplier.id]: { loading: true, message: "", error: "" } }));
    try {
      const response = await fetch("/api/supplier-network", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          storefrontId: supplier.id,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to request supplier connection");
      setConnectionState((current) => ({
        ...current,
        [supplier.id]: {
          loading: false,
          message: payload.connected ? "Supplier already connected." : "Connection request sent to supplier.",
          error: "",
        },
      }));
    } catch (error) {
      setConnectionState((current) => ({
        ...current,
        [supplier.id]: { loading: false, message: "", error: error?.message || "Unable to request supplier connection" },
      }));
    }
  }

  return <div className="p-5 lg:p-8">
    <div className="mx-auto max-w-7xl">
      <div className="rounded-[28px] border border-black/[0.07] bg-white p-6 shadow-[0_16px_48px_rgba(50,41,31,.05)] lg:p-8">
        <div className="text-[9px] font-black uppercase tracking-[0.22em] text-[#B7793B]">Supply Chain · Supplier Network</div>
        <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-[34px] font-semibold tracking-[-.045em] text-[#1D1A17] lg:text-[44px]">Discover suppliers already on Avantiqo.</h1>
            <p className="mt-3 max-w-3xl text-[11px] leading-6 text-[#777067]">Search published supplier shops and product catalogs. Discovery never exposes another customer&apos;s negotiated terms, orders, invoices or payments.</p>
          </div>
          <div className="rounded-2xl border border-black/[0.06] bg-[#FBFAF8] px-4 py-3 text-[9px] text-[#756E66]">{state.suppliers.length} suppliers · {productCount} visible products</div>
        </div>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search supplier, product, SKU or category…" className="mt-6 h-12 w-full rounded-2xl border border-black/[0.08] bg-[#FBFAF8] px-4 text-[11px] outline-none focus:border-[#B7793B]/45" />
      </div>

      {state.error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-[10px] text-red-800">{state.error}</div> : null}
      {state.loading ? <div className="mt-4 rounded-2xl border border-black/[0.06] bg-white p-5 text-[10px] text-[#81786F]">Searching Supplier Network…</div> : null}

      {!state.loading ? <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {state.suppliers.map((supplier) => <article key={supplier.id} className="rounded-[24px] border border-black/[0.07] bg-white p-5 shadow-[0_12px_34px_rgba(50,41,31,.035)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[8px] font-black uppercase tracking-[0.16em] text-[#B7793B]">{supplier.supplier?.verified ? "Verified supplier" : "Supplier shop"}</div>
              <h2 className="mt-2 text-[22px] font-semibold tracking-[-.03em]">{supplier.supplier?.business_name || supplier.name}</h2>
              <p className="mt-2 text-[9px] leading-5 text-[#756E66]">{supplier.headline || supplier.description || "Supplier catalog on Avantiqo."}</p>
            </div>
            {supplier.supplier?.business_linked ? <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[7px] font-bold uppercase tracking-[.12em] text-emerald-700">Avantiqo Business</span> : null}
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {(supplier.products || []).slice(0,6).map((product) => <div key={product.id} className="rounded-[15px] border border-black/[0.055] bg-[#FBFAF8] p-3">
              <div className="flex items-start justify-between gap-2"><div className="text-[9px] font-semibold">{product.name}</div>{product.pricing_source === "CUSTOM" ? <span className="rounded-full border border-[#B7793B]/20 bg-[#FBF6EF] px-2 py-0.5 text-[6px] font-bold uppercase tracking-[.1em] text-[#76502E]">Your price</span> : null}</div>
              <div className="mt-1 text-[8px] text-[#81786F]">{product.category || "Uncategorized"} · MOQ {product.effective_minimum_order_quantity ?? product.minimum_order_quantity} {product.uom || ""}</div>
              <div className="mt-2 text-[9px] font-semibold text-[#76502E]">{money(product.effective_price ?? product.base_price, product.effective_currency_code || product.currency_code)}</div>
              {supplier.relationship?.status === "CONNECTED" && supplier.allow_customer_orders ? <label className="mt-3 grid gap-1 text-[7px] font-semibold text-[#81786F]">Order quantity<input type="number" min={product.effective_minimum_order_quantity ?? product.minimum_order_quantity ?? 1} step="0.01" value={cart[supplier.id]?.[product.id] || ""} onChange={(event)=>setQuantity(supplier.id,product.id,event.target.value)} className="h-9 rounded-lg border border-black/[.08] bg-white px-2 text-[9px] outline-none focus:border-[#B7793B]/40" /></label> : null}
            </div>)}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <a href={`/suppliers/${supplier.slug}`} target="_blank" rel="noreferrer" className="rounded-xl border border-black/[0.07] px-3 py-2 text-[8px] font-semibold">View shop ↗</a>
            <span className="rounded-xl border border-black/[0.07] px-3 py-2 text-[8px] font-semibold">{supplier.allow_customer_orders ? "Ordering available" : "Catalog only"}</span>
            <span className="rounded-xl border border-black/[0.07] px-3 py-2 text-[8px] font-semibold">{(supplier.products || []).length} products</span>
            {supplier.relationship?.status === "CONNECTED"
              ? <span className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[8px] font-semibold text-emerald-800">Connected</span>
              : supplier.relationship?.status === "PENDING"
                ? <span className="rounded-xl border border-[#B7793B]/20 bg-[#FBF6EF] px-3 py-2 text-[8px] font-semibold text-[#76502E]">Request pending</span>
                : <button onClick={() => requestConnection(supplier)} disabled={connectionState[supplier.id]?.loading} className="rounded-xl bg-[#1D1A17] px-3 py-2 text-[8px] font-semibold text-white disabled:opacity-50">{connectionState[supplier.id]?.loading ? "Sending…" : "Request connection"}</button>}
          </div>
          {supplier.relationship?.status === "CONNECTED" && supplier.allow_customer_orders ? <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={()=>createOrder(supplier)} disabled={orderState[supplier.id]?.loading} className="rounded-xl bg-[#1D1A17] px-4 py-2.5 text-[8px] font-semibold text-white disabled:opacity-50">{orderState[supplier.id]?.loading ? "Creating PO…" : "Create purchase order"}</button>
            {!entityId ? <span className="text-[8px] font-semibold text-[#9A744B]">Select a legal entity to order.</span> : <span className="text-[8px] text-[#81786F]">Orders enter the normal approval workflow.</span>}
          </div> : null}
          {orderState[supplier.id]?.message ? <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[8px] font-semibold text-emerald-800">{orderState[supplier.id].message}</div> : null}
          {orderState[supplier.id]?.error ? <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[8px] font-semibold text-red-800">{orderState[supplier.id].error}</div> : null}
          {connectionState[supplier.id]?.message ? <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[8px] font-semibold text-emerald-800">{connectionState[supplier.id].message}</div> : null}
          {connectionState[supplier.id]?.error ? <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[8px] font-semibold text-red-800">{connectionState[supplier.id].error}</div> : null}
        </article>)}
      </div> : null}

      {!state.loading && !state.suppliers.length ? <div className="mt-4 rounded-[24px] border border-black/[0.07] bg-white p-8 text-center text-[10px] text-[#81786F]">No published supplier shops match this search yet.</div> : null}
    </div>
  </div>;
}
