"use client";

import { useCallback, useEffect, useState } from "react";

function money(value, currency = "THB") {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return currency + " " + amount.toFixed(2);
  }
}

function when(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
}

function Panel({ title, eyebrow, children, action }) {
  return <section className="rounded-[24px] border border-black/[.07] bg-white p-5 shadow-[0_12px_36px_rgba(48,35,22,.035)] sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        {eyebrow ? <div className="text-[8px] font-semibold uppercase tracking-[.16em] text-[#9A744B]">{eyebrow}</div> : null}
        <h2 className="mt-1 text-[20px] font-semibold tracking-[-.025em]">{title}</h2>
      </div>
      {action}
    </div>
    <div className="mt-4">{children}</div>
  </section>;
}

export default function SupplierPortalWorkspace({ section = "home" }) {
  const [store, setStore] = useState(null);
  const [operations, setOperations] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [authStatus, setAuthStatus] = useState(null);
  const [product, setProduct] = useState({ name: "", sku: "", category: "", uom: "", basePrice: "", minimumOrderQuantity: "1", leadTimeDays: "0" });
  const [editingProductId, setEditingProductId] = useState("");
  const [storeDraft, setStoreDraft] = useState({});
  const [profileDraft, setProfileDraft] = useState({ businessName: "", displayName: "", phone: "", website: "" });
  const [businessCandidates, setBusinessCandidates] = useState([]);
  const [businessCatalog, setBusinessCatalog] = useState({ products: [], business_items: [] });
  const [connectionRequests, setConnectionRequests] = useState([]);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const storeResponse = await fetch("/api/supplier-portal/storefront", { cache: "no-store" });
      const storePayload = await storeResponse.json().catch(() => ({}));
      if (storeResponse.status === 401 || storeResponse.status === 403) {
        setAuthStatus(storeResponse.status);
        setStore(null);
        return;
      }
      if (!storeResponse.ok || !storePayload?.success) throw new Error(storePayload?.error || "Unable to load supplier storefront");
      setAuthStatus(200);
      setStore(storePayload);
      setStoreDraft({
        name: storePayload.storefront?.name || "",
        headline: storePayload.storefront?.headline || "",
        description: storePayload.storefront?.description || "",
        currency_code: storePayload.storefront?.currency_code || "THB",
        allow_public_browse: storePayload.storefront?.allow_public_browse === true,
        allow_customer_orders: storePayload.storefront?.allow_customer_orders !== false,
      });
      setProfileDraft({
        businessName: storePayload.account?.business_name || "",
        displayName: storePayload.account?.display_name || "",
        phone: storePayload.account?.phone || "",
        website: storePayload.account?.website || "",
      });

      if (["home","orders","documents","payments"].includes(section)) {
        const response = await fetch("/api/supplier-portal/operations", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to load supplier operations");
        setOperations(payload);
      }

      if (["home","customers","settings"].includes(section)) {
        const response = await fetch("/api/supplier-portal/connections", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to load supplier connection requests");
        setConnectionRequests(payload.requests || []);
      }

      if (section === "settings") {
        const response = await fetch("/api/supplier-portal/business", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to load Avantiqo Business connections");
        setBusinessCandidates(payload.organizations || []);
        setBusinessCatalog(payload.catalog || { products: [], business_items: [] });
      }
    } catch (loadError) {
      setError(loadError?.message || "Unable to load supplier workspace");
    } finally {
      setLoading(false);
    }
  }, [section]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!loading && authStatus === 200 && section === "home" && store && !store.account) {
      window.location.replace("/supplier-portal/onboarding");
    }
  }, [authStatus, loading, section, store]);

  const customers = store?.relationships || [];
  const products = store?.products || [];
  const orders = operations?.orders || [];
  const invoices = operations?.invoices || [];
  const payments = operations?.payments || [];
  const capabilities = store?.capabilities || {};
  const networkProfiles = store?.network_profiles || [];
  const unassignedRelationships = store?.unassigned_relationships || [];
  const activeMembership = networkProfiles.find((membership) => String(membership.supplier_account_id) === String(store?.account?.id || "")) || null;
  const canManageSupplier = !store?.account || ["OWNER","ADMIN"].includes(String(activeMembership?.role || "").toUpperCase());
  const openOrders = orders.filter((row) => !["CANCELLED","CLOSED","RECEIVED"].includes(String(row.status || "").toUpperCase())).length;
  const businessCatalogProducts = businessCatalog?.products || [];
  const businessItems = businessCatalog?.business_items || [];
  const mappedBusinessProducts = businessCatalogProducts.filter((row) => row.business_inventory_item_id);
  const unmatchedBusinessProducts = businessCatalogProducts.filter((row) => !row.business_inventory_item_id);

  async function persistSupplierProfile() {
    const response = await fetch("/api/supplier-portal/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profileDraft),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to save supplier profile");
    return payload;
  }

  async function saveSupplierProfile() {
    setSaving(true);
    setError("");
    try {
      if (!profileDraft.businessName.trim()) throw new Error("Business name is required");
      await persistSupplierProfile();
      await load();
    } catch (profileError) {
      setError(profileError?.message || "Unable to save supplier profile");
    } finally {
      setSaving(false);
    }
  }

  async function createFreeShop() {
    setSaving(true);
    setError("");
    try {
      if (!store?.account && !capabilities.invited_relationships && !profileDraft.businessName.trim()) {
        throw new Error("Business name is required to create a free supplier shop");
      }
      if (profileDraft.businessName.trim() || profileDraft.displayName.trim() || profileDraft.phone.trim() || profileDraft.website.trim()) {
        await persistSupplierProfile();
      }
      const response = await fetch("/api/supplier-portal/storefront", { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to create free supplier shop");
      await load();
    } catch (shopError) {
      setError(shopError?.message || "Unable to create free supplier shop");
    } finally {
      setSaving(false);
    }
  }
  async function createProduct(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/supplier-portal/products", {
        method: editingProductId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingProductId ? { ...product, productId: editingProductId } : product),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) throw new Error(payload?.error || (editingProductId ? "Unable to update product" : "Unable to create product"));
      setProduct({ name: "", sku: "", category: "", uom: "", basePrice: "", minimumOrderQuantity: "1", leadTimeDays: "0" });
      setEditingProductId("");
      await load();
    } catch (saveError) {
      setError(saveError?.message || (editingProductId ? "Unable to update product" : "Unable to create product"));
    } finally {
      setSaving(false);
    }
  }

  function editProduct(row) {
    setEditingProductId(row.id);
    setProduct({
      name: row.name || "",
      sku: row.sku || "",
      category: row.category || "",
      uom: row.uom || "",
      basePrice: String(row.base_price ?? ""),
      minimumOrderQuantity: String(row.minimum_order_quantity ?? "1"),
      leadTimeDays: String(row.lead_time_days ?? "0"),
    });
  }

  async function setProductActive(row, isActive) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/supplier-portal/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: row.id, isActive }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to update product");
      await load();
    } catch (productError) {
      setError(productError?.message || "Unable to update product");
    } finally {
      setSaving(false);
    }
  }

  async function saveStorefront(status) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/supplier-portal/storefront", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.assign({}, storeDraft, status ? { status } : {})),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to save storefront");
      await load();
    } catch (saveError) {
      setError(saveError?.message || "Unable to save storefront");
    } finally {
      setSaving(false);
    }
  }

  async function setNetworkDiscovery(enabled) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/supplier-portal/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shop_discoverable: enabled }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to update network visibility");
      await load();
    } catch (visibilityError) {
      setError(visibilityError?.message || "Unable to update network visibility");
    } finally {
      setSaving(false);
    }
  }

  async function connectBusiness(organizationId) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/supplier-portal/business", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to connect Avantiqo Business");
      await load();
    } catch (businessError) {
      setError(businessError?.message || "Unable to connect Avantiqo Business");
    } finally {
      setSaving(false);
    }
  }

  async function syncBusinessCatalog() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/supplier-portal/business", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync_catalog" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to sync Business catalog");
      await load();
    } catch (syncError) {
      setError(syncError?.message || "Unable to sync Business catalog");
    } finally {
      setSaving(false);
    }
  }

  async function mapBusinessProduct(productId, inventoryItemId) {
    if (!inventoryItemId) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/supplier-portal/business", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "map_product", productId, inventoryItemId, syncEnabled: true }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to link Business catalog item");
      await load();
    } catch (mapError) {
      setError(mapError?.message || "Unable to link Business catalog item");
    } finally {
      setSaving(false);
    }
  }

  async function switchSupplierProfile(supplierAccountId) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/supplier-portal/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplierAccountId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to switch supplier profile");
      await load();
    } catch (switchError) {
      setError(switchError?.message || "Unable to switch supplier profile");
    } finally {
      setSaving(false);
    }
  }

  async function attachRelationship(supplierPortalAccessId) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/supplier-portal/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplierPortalAccessId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to attach customer relationship");
      await load();
    } catch (attachError) {
      setError(attachError?.message || "Unable to attach customer relationship");
    } finally {
      setSaving(false);
    }
  }

  async function respondToConnection(requestId, action) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/supplier-portal/connections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, action }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to respond to connection request");
      await load();
    } catch (connectionError) {
      setError(connectionError?.message || "Unable to respond to connection request");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="mx-auto max-w-[1320px] px-5 py-10 sm:px-7 lg:px-10"><div className="rounded-[22px] border border-black/[.07] bg-white p-6 text-[10px] text-[#746D65]">Loading supplier workspace…</div></div>;

  if (authStatus === 401) {
    return <section className="mx-auto max-w-[1180px] px-5 py-14 sm:px-7 lg:px-10 lg:py-20">
      <p className="text-[9px] font-semibold uppercase tracking-[.22em] text-[#9A744B]">SUPPLIER NETWORK</p>
      <h1 className="mt-4 max-w-4xl text-[46px] font-medium leading-[.96] tracking-[-.055em] sm:text-[62px]">Sell through Avantiqo your way.</h1>
      <p className="mt-5 max-w-3xl text-[13px] leading-7 text-[#6B645C]">Join from a customer invitation, create a free supplier shop and become discoverable, or connect the same supplier identity to your full Avantiqo Business. One account can use all three capabilities.</p>
      <div className="mt-8 grid gap-3 md:grid-cols-3">
        <div className="rounded-[22px] border border-black/[.07] bg-white p-5"><div className="text-[8px] font-semibold uppercase tracking-[.16em] text-[#9A744B]">01 · Invited</div><div className="mt-3 text-[16px] font-semibold">Work with a customer</div><p className="mt-2 text-[9px] leading-5 text-[#756E66]">Accept an invitation and manage that customer&apos;s orders, documents and payments.</p></div>
        <div className="rounded-[22px] border border-black/[.07] bg-white p-5"><div className="text-[8px] font-semibold uppercase tracking-[.16em] text-[#9A744B]">02 · Free Shop</div><div className="mt-3 text-[16px] font-semibold">Create your supplier shop</div><p className="mt-2 text-[9px] leading-5 text-[#756E66]">Publish products and become visible to businesses in the Avantiqo Supplier Network.</p></div>
        <div className="rounded-[22px] border border-black/[.07] bg-white p-5"><div className="text-[8px] font-semibold uppercase tracking-[.16em] text-[#9A744B]">03 · Business</div><div className="mt-3 text-[16px] font-semibold">Run the whole company</div><p className="mt-2 text-[9px] leading-5 text-[#756E66]">Connect the same supplier profile to a full Avantiqo Business workspace when you need ERP operations.</p></div>
      </div>
      <a href="/login?portal=supplier" className="mt-6 inline-flex h-11 items-center rounded-xl bg-[#211C17] px-5 text-[10px] font-semibold text-white">Sign in or create account →</a>
    </section>;
  }

  const storefront = store?.storefront || {};
  const account = store?.account || {};
  const heading =
    section === "home" ? "Your customers, orders and storefront." :
    section === "customers" ? "Customer relationships." :
    section === "orders" ? "Customer purchase orders." :
    section === "catalog" ? "Catalog." :
    section === "storefront" ? "Storefront." :
    section === "documents" ? "Documents and invoices." :
    section === "payments" ? "Payments." :
    "Supplier account settings.";

  return <div className="mx-auto max-w-[1320px] px-5 py-8 sm:px-7 lg:px-10 lg:py-10">
    <div className="mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-[9px] font-semibold uppercase tracking-[.2em] text-[#9A744B]">Supplier workspace</div>
        {networkProfiles.length > 1 ? <select
          aria-label="Active supplier profile"
          value={account.id || ""}
          disabled={saving}
          onChange={(event)=>switchSupplierProfile(event.target.value)}
          className="h-10 max-w-[280px] rounded-xl border border-black/[.08] bg-white px-3 text-[9px] font-semibold text-[#5F574F] outline-none"
        >
          {networkProfiles.map((membership)=><option key={membership.supplier_account_id} value={membership.supplier_account_id}>{membership.account?.business_name || membership.account?.display_name || membership.account?.email || "Supplier"} · {membership.role}</option>)}
        </select> : null}
      </div>
      <h1 className="mt-2 text-[34px] font-medium tracking-[-.04em] sm:text-[44px]">{heading}</h1>
      <p className="mt-2 max-w-3xl text-[10px] leading-5 text-[#756E66]">
        {section === "storefront"
          ? "Build the customer-facing shop once, then expose it only to the customer relationships you choose."
          : section === "catalog"
            ? "Products belong to your supplier storefront, not to any one customer's internal inventory."
            : "Every customer relationship stays separately scoped even though you use one Supplier identity."}
      </p>
    </div>

    {error ? <div className="mb-5 rounded-xl border border-red-700/15 bg-red-50 px-4 py-3 text-[10px] text-red-800">{error}</div> : null}

    {section === "home" ? <div className="space-y-4">
      <div className="grid gap-3 xl:grid-cols-3">
        <div className={`rounded-[22px] border p-5 ${capabilities.invited_relationships ? "border-emerald-200 bg-emerald-50/40" : "border-black/[.07] bg-white"}`}>
          <div className="text-[8px] font-semibold uppercase tracking-[.16em] text-[#9A744B]">01 · Invited relationships</div>
          <div className="mt-3 flex items-center justify-between gap-3"><div className="text-[17px] font-semibold">Work with customers</div><div className="text-[8px] font-semibold">{capabilities.invited_relationships ? "ACTIVE" : "OPTIONAL"}</div></div>
          <p className="mt-2 text-[9px] leading-5 text-[#756E66]">{capabilities.invited_relationships ? String(customers.length) + " customer relationship(s) connected." : "No invitation is required to use the free shop. Customer relationships appear here when a business invites you."}</p>
        </div>
        <div className={`rounded-[22px] border p-5 ${capabilities.storefront ? "border-emerald-200 bg-emerald-50/40" : "border-[#B7793B]/20 bg-[#FBF6EF]"}`}>
          <div className="text-[8px] font-semibold uppercase tracking-[.16em] text-[#9A744B]">02 · Free Supplier Shop</div>
          <div className="mt-3 flex items-center justify-between gap-3"><div className="text-[17px] font-semibold">Publish your catalog</div><div className="text-[8px] font-semibold">{capabilities.storefront ? "ACTIVE" : "FREE"}</div></div>
          <p className="mt-2 text-[9px] leading-5 text-[#756E66]">{capabilities.storefront ? "Your shop exists. Publish it and enable network discovery when ready." : "Create a free shop, add products and become discoverable to Avantiqo businesses."}</p>
          {!capabilities.storefront && !store?.account && canManageSupplier ? <input value={profileDraft.businessName} onChange={(event)=>setProfileDraft((current)=>({...current,businessName:event.target.value}))} placeholder="Business name" className="mt-4 h-10 w-full rounded-xl border border-black/[.08] bg-white px-3 text-[9px] outline-none focus:border-[#B7793B]/40" /> : null}
          {!capabilities.storefront && canManageSupplier ? <button onClick={createFreeShop} disabled={saving} className="mt-3 rounded-xl bg-[#1D1A17] px-4 py-2 text-[9px] font-semibold text-white disabled:opacity-50">Create free shop →</button> : capabilities.storefront ? <a href="/supplier-portal/storefront" className="mt-4 inline-flex rounded-xl border border-black/[.08] px-4 py-2 text-[9px] font-semibold">Manage shop →</a> : <div className="mt-3 text-[8px] text-[#81786F]">Owner or admin access is required to create the shop.</div>}
        </div>
        <div className={`rounded-[22px] border p-5 ${capabilities.business ? "border-emerald-200 bg-emerald-50/40" : "border-black/[.07] bg-white"}`}>
          <div className="text-[8px] font-semibold uppercase tracking-[.16em] text-[#9A744B]">03 · Avantiqo Business</div>
          <div className="mt-3 flex items-center justify-between gap-3"><div className="text-[17px] font-semibold">Run the whole company</div><div className="text-[8px] font-semibold">{capabilities.business ? "CONNECTED" : "OPTIONAL"}</div></div>
          <p className="mt-2 text-[9px] leading-5 text-[#756E66]">{capabilities.business ? "This supplier identity is linked to a full Avantiqo Business organization." : "Connect an existing owner-managed Avantiqo organization when you want the full ERP."}</p>
          <a href="/supplier-portal/settings" className="mt-4 inline-flex rounded-xl border border-black/[.08] px-4 py-2 text-[9px] font-semibold">{capabilities.business ? "Business connection →" : "Connect Business →"}</a>
        </div>
      </div>
      {unassignedRelationships.length ? <Panel eyebrow="Unassigned invitations" title="Choose which supplier business owns these customer relationships">
        <div className="space-y-2">
          {unassignedRelationships.map((row)=><div key={row.id} className="flex flex-col gap-3 rounded-[16px] border border-[#B7793B]/20 bg-[#FBF6EF] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div><div className="text-[10px] font-semibold">{row.organization?.name || row.organization?.legal_name || "Customer"}</div><div className="mt-1 text-[8px] text-[#81786F]">This invitation belongs to your login but is not attached to the active supplier business yet.</div></div>
            <button onClick={()=>attachRelationship(row.id)} disabled={saving} className="rounded-xl bg-[#1D1A17] px-3 py-2 text-[8px] font-semibold text-white disabled:opacity-50">Attach to this supplier</button>
          </div>)}
        </div>
      </Panel> : null}
      {connectionRequests.some((row) => row.status === "PENDING") ? <Panel eyebrow="Connection requests" title="Businesses want to buy from you">
        <div className="space-y-2">
          {connectionRequests.filter((row) => row.status === "PENDING").map((row) => <div key={row.id} className="flex flex-col gap-3 rounded-[16px] border border-black/[.06] bg-[#FBFAF8] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[10px] font-semibold">{row.organization?.name || row.organization?.legal_name || "Avantiqo business"}</div>
              <div className="mt-1 text-[8px] text-[#81786F]">{row.buyer_note || "Requested a supplier relationship through Supplier Network."}</div>
            </div>
            <div className="flex gap-2">
              <button onClick={()=>respondToConnection(row.id,"DECLINE")} disabled={saving} className="rounded-xl border border-black/[.08] px-3 py-2 text-[8px] font-semibold disabled:opacity-50">Decline</button>
              <button onClick={()=>respondToConnection(row.id,"ACCEPT")} disabled={saving} className="rounded-xl bg-[#1D1A17] px-3 py-2 text-[8px] font-semibold text-white disabled:opacity-50">Accept</button>
            </div>
          </div>)}
        </div>
      </Panel> : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[20px] border border-black/[.07] bg-white p-5"><div className="text-[8px] uppercase tracking-[.15em] text-[#9A744B]">Customers</div><div className="mt-2 text-[28px] font-semibold">{customers.length}</div><div className="mt-1 text-[8px] text-[#81786F]">Accepted customer relationships</div></div>
        <div className="rounded-[20px] border border-black/[.07] bg-white p-5"><div className="text-[8px] uppercase tracking-[.15em] text-[#9A744B]">Products</div><div className="mt-2 text-[28px] font-semibold">{products.length}</div><div className="mt-1 text-[8px] text-[#81786F]">Storefront catalog items</div></div>
        <div className="rounded-[20px] border border-black/[.07] bg-white p-5"><div className="text-[8px] uppercase tracking-[.15em] text-[#9A744B]">Open orders</div><div className="mt-2 text-[28px] font-semibold">{openOrders}</div><div className="mt-1 text-[8px] text-[#81786F]">Customer purchase orders</div></div>
        <div className="rounded-[20px] border border-black/[.07] bg-white p-5"><div className="text-[8px] uppercase tracking-[.15em] text-[#9A744B]">Store status</div><div className="mt-2 text-[20px] font-semibold">{storefront.status || "DRAFT"}</div><div className="mt-1 text-[8px] text-[#81786F]">{storefront.allow_customer_orders ? "Ordering enabled" : "Ordering disabled"}</div></div>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel eyebrow="Storefront" title={storefront.name || "Supplier Store"}>
          <div className="text-[9px] leading-5 text-[#756E66]">{storefront.headline || "Add a headline and publish when your catalog is ready."}</div>
          <div className="mt-4 flex flex-wrap gap-2"><a href="/supplier-portal/storefront" className="rounded-xl bg-[#1D1A17] px-4 py-2 text-[9px] font-semibold text-white">Manage storefront</a><a href="/supplier-portal/catalog" className="rounded-xl border border-black/[.08] px-4 py-2 text-[9px] font-semibold">Manage catalog</a></div>
        </Panel>
        <Panel eyebrow="Latest orders" title={orders.length ? String(orders.length) + " purchase orders" : "No purchase orders yet"}>
          {orders.slice(0,4).map((row) => <div key={row.id} className="flex items-center justify-between gap-4 border-t border-black/[.06] py-3 first:border-0 first:pt-0"><div><div className="text-[9px] font-semibold">{row.po_number || "Purchase order"}</div><div className="mt-1 text-[8px] text-[#81786F]">{row.customer?.name || row.customer?.legal_name || "Customer"} · {row.status}</div></div><div className="text-[9px] font-semibold">{money(row.total_amount,row.currency || "THB")}</div></div>)}
        </Panel>
      </div>
    </div> : null}
    {section === "customers" ? <Panel eyebrow="Authority boundaries" title="Customers connected to this supplier identity">
      <div className="grid gap-3 md:grid-cols-2">
        {customers.map((row) => <article key={row.id} className="rounded-[18px] border border-black/[.06] bg-[#FBFAF8] p-4">
          <div className="text-[11px] font-semibold">{row.organization?.name || row.organization?.legal_name || "Customer"}</div>
          <div className="mt-3 grid gap-1 text-[8px] text-[#756E66]"><div>Relationship: {row.status}</div><div>Store visible: {row.customer_visible ? "Yes" : "No"}</div><div>Ordering: {row.order_enabled ? "Enabled" : "Disabled"}</div><div>Pricing: {row.pricing_mode}</div></div>
        </article>)}
      </div>
      {!customers.length ? <div className="text-[9px] text-[#81786F]">No accepted customer relationship yet.</div> : null}
    </Panel> : null}

    {section === "catalog" ? <div className="grid gap-4 xl:grid-cols-[.72fr_1.28fr]">
      {canManageSupplier ? <Panel eyebrow={editingProductId ? "Edit product" : "Add product"} title={editingProductId ? "Update catalog item" : "New catalog item"}>
        <form onSubmit={createProduct} className="grid gap-3">
          {[
            ["name","Product name","text"],["sku","SKU","text"],["category","Category","text"],["uom","Unit of measure","text"],["basePrice","Base price","number"],["minimumOrderQuantity","Minimum order","number"],["leadTimeDays","Lead time days","number"]
          ].map(([key,label,type]) => <label key={key} className="grid gap-1 text-[8px] font-semibold text-[#6F665D]">{label}<input type={type} step={type === "number" ? "0.01" : undefined} value={product[key]} onChange={(event)=>setProduct((current)=>Object.assign({},current,{[key]:event.target.value}))} className="h-10 rounded-xl border border-black/[.08] bg-[#FBFAF8] px-3 text-[10px] font-normal outline-none focus:border-[#B7793B]/40" /></label>)}
          <div className="mt-2 flex gap-2"><button disabled={saving || !product.name.trim()} className="h-11 flex-1 rounded-xl bg-[#1D1A17] text-[9px] font-semibold text-white disabled:opacity-40">{editingProductId ? "Save changes" : "Add product"}</button>{editingProductId ? <button type="button" onClick={()=>{setEditingProductId("");setProduct({ name:"",sku:"",category:"",uom:"",basePrice:"",minimumOrderQuantity:"1",leadTimeDays:"0" });}} className="h-11 rounded-xl border border-black/[.08] px-4 text-[9px] font-semibold">Cancel</button> : null}</div>
        </form>
      </Panel> : <Panel eyebrow="Catalog access" title="View only"><div className="text-[9px] leading-5 text-[#756E66]">Owner or admin access is required to change the supplier catalog.</div></Panel>}
      <Panel eyebrow="Catalog" title={String(products.length) + " products"}>
        <div className="space-y-2">{products.map((row) => <div key={row.id} className="grid gap-3 rounded-[16px] border border-black/[.06] bg-[#FBFAF8] p-4 sm:grid-cols-[1fr_auto] sm:items-center"><div><div className="flex items-center gap-2"><div className="text-[10px] font-semibold">{row.name}</div>{row.is_active === false ? <span className="rounded-full border border-black/[.08] px-2 py-0.5 text-[7px] font-semibold text-[#81786F]">Inactive</span> : null}</div><div className="mt-1 text-[8px] text-[#81786F]">{row.sku || "No SKU"} · {row.category || "Uncategorized"} · MOQ {row.minimum_order_quantity} {row.uom || ""} · {row.lead_time_days || 0}d lead</div></div><div className="text-right"><div className="text-[10px] font-semibold">{money(row.base_price,row.currency_code)}</div>{canManageSupplier ? <div className="mt-2 flex gap-1"><button onClick={()=>editProduct(row)} className="rounded-lg border border-black/[.08] px-2 py-1 text-[7px] font-semibold">Edit</button><button onClick={()=>setProductActive(row,row.is_active === false)} disabled={saving} className="rounded-lg border border-black/[.08] px-2 py-1 text-[7px] font-semibold disabled:opacity-40">{row.is_active === false ? "Activate" : "Deactivate"}</button></div> : null}</div></div>)}</div>
        {!products.length ? <div className="text-[9px] text-[#81786F]">Add the first product to start building the storefront.</div> : null}
      </Panel>
    </div> : null}
    {section === "storefront" ? <div className="grid gap-4 xl:grid-cols-[.9fr_1.1fr]">
      <Panel eyebrow="Storefront settings" title="Customer-facing shop">
        <div className="grid gap-3">
          {[
            ["name","Store name"],["headline","Headline"],["description","Description"],["currency_code","Default currency"]
          ].map(([key,label]) => <label key={key} className="grid gap-1 text-[8px] font-semibold text-[#6F665D]">{label}<input value={storeDraft[key] || ""} onChange={(event)=>setStoreDraft((current)=>Object.assign({},current,{[key]:event.target.value}))} className="h-10 rounded-xl border border-black/[.08] bg-[#FBFAF8] px-3 text-[10px] font-normal outline-none focus:border-[#B7793B]/40" /></label>)}
          <label className="flex items-center gap-2 text-[9px]"><input type="checkbox" checked={storeDraft.allow_customer_orders === true} onChange={(event)=>setStoreDraft((current)=>Object.assign({},current,{allow_customer_orders:event.target.checked}))}/>Allow customer orders</label>
          <label className="flex items-center gap-2 text-[9px]"><input type="checkbox" checked={storeDraft.allow_public_browse === true} onChange={(event)=>setStoreDraft((current)=>Object.assign({},current,{allow_public_browse:event.target.checked}))}/>Allow public browsing</label>
          {canManageSupplier ? <div className="flex flex-wrap gap-2 pt-2"><button onClick={()=>saveStorefront()} disabled={saving} className="rounded-xl border border-black/[.08] px-4 py-2 text-[9px] font-semibold">Save draft</button><button onClick={()=>saveStorefront("PUBLISHED")} disabled={saving || !products.length} className="rounded-xl bg-[#1D1A17] px-4 py-2 text-[9px] font-semibold text-white disabled:opacity-40">Publish storefront</button>{storefront.status === "PUBLISHED" ? <button onClick={()=>saveStorefront("PAUSED")} disabled={saving} className="rounded-xl border border-[#B7793B]/25 bg-[#FBF6EF] px-4 py-2 text-[9px] font-semibold text-[#76502E]">Pause</button> : null}</div> : <div className="pt-2 text-[8px] text-[#81786F]">View only · owner or admin required to change the storefront.</div>}
        </div>
      </Panel>
      <Panel eyebrow="Preview" title={storeDraft.name || "Supplier Store"}>
        <div className="rounded-[20px] border border-black/[.07] bg-[#F3E7D7]/55 p-6"><div className="text-[8px] uppercase tracking-[.18em] text-[#9A744B]">{storefront.status || "DRAFT"} STOREFRONT</div><div className="mt-3 text-[28px] font-medium tracking-[-.04em]">{storeDraft.headline || "A clear supplier storefront for your customers."}</div><p className="mt-3 max-w-xl text-[9px] leading-5 text-[#756E66]">{storeDraft.description || "Your product catalog, customer-specific terms and ordering access will appear here."}</p><div className="mt-6 grid gap-2 sm:grid-cols-2">{products.slice(0,4).map((row)=><div key={row.id} className="rounded-[14px] bg-white/70 p-3"><div className="text-[9px] font-semibold">{row.name}</div><div className="mt-1 text-[8px] text-[#81786F]">{money(row.base_price,row.currency_code)}</div></div>)}</div></div>
      </Panel>
    </div> : null}
    {section === "orders" ? <Panel eyebrow="ERP purchase orders" title="Orders from connected customers">
      <div className="overflow-x-auto"><table className="min-w-full text-left text-[9px]"><thead className="text-[#91877C]"><tr><th className="pb-2 pr-4">PO</th><th className="pb-2 pr-4">Customer</th><th className="pb-2 pr-4">Status</th><th className="pb-2 pr-4">Delivery</th><th className="pb-2 text-right">Total</th></tr></thead><tbody className="divide-y divide-black/[.06]">{orders.map((row)=><tr key={row.id}><td className="py-3 pr-4 font-semibold">{row.po_number || "—"}</td><td className="py-3 pr-4">{row.customer?.name || row.customer?.legal_name || "—"}</td><td className="py-3 pr-4">{row.status}</td><td className="py-3 pr-4">{when(row.expected_delivery_date)}</td><td className="py-3 text-right font-semibold">{money(row.total_amount,row.currency || "THB")}</td></tr>)}</tbody></table></div>
      {!orders.length ? <div className="py-5 text-[9px] text-[#81786F]">No customer purchase orders are assigned to this supplier yet.</div> : null}
    </Panel> : null}

    {section === "documents" ? <Panel eyebrow="ERP documents" title="Vendor invoices and documents">
      <div className="space-y-2">{invoices.map((row)=><div key={row.id} className="grid gap-3 rounded-[16px] border border-black/[.06] p-4 sm:grid-cols-[1fr_auto]"><div><div className="text-[10px] font-semibold">{row.invoice_number || "Vendor invoice"}</div><div className="mt-1 text-[8px] text-[#81786F]">{row.customer?.name || row.customer?.legal_name || "Customer"} · {row.status} · due {when(row.due_date)}</div></div><div className="text-[10px] font-semibold">{money(row.total_amount,row.currency_code || "THB")}</div></div>)}</div>
      {!invoices.length ? <div className="text-[9px] text-[#81786F]">No supplier invoices are visible for connected customers yet.</div> : null}
    </Panel> : null}

    {section === "payments" ? <Panel eyebrow="ERP payments" title="Payments from connected customers">
      <div className="space-y-2">{payments.map((row)=><div key={row.id} className="flex items-center justify-between gap-4 rounded-[16px] border border-black/[.06] p-4"><div><div className="text-[10px] font-semibold">{row.customer?.name || row.customer?.legal_name || "Customer"}</div><div className="mt-1 text-[8px] text-[#81786F]">{when(row.paid_at)} · {row.payment_method || "Payment"} · {row.reference_number || "No reference"}</div></div><div className="text-[10px] font-semibold">{money(row.amount,row.currency_code || "THB")}</div></div>)}</div>
      {!payments.length ? <div className="text-[9px] text-[#81786F]">No customer payments are visible yet.</div> : null}
    </Panel> : null}

    {section === "settings" ? <div className="grid gap-4 xl:grid-cols-3">
      <Panel eyebrow="Supplier identity" title={account.business_name || account.display_name || "Supplier"}>
        <div className="grid gap-3 text-[9px] text-[#756E66]">
          <div>Email: {account.email || "—"}</div>
          {canManageSupplier ? <>
            {[
              ["businessName","Business name"],["displayName","Display name"],["phone","Phone"],["website","Website"]
            ].map(([key,label])=><label key={key} className="grid gap-1 text-[8px] font-semibold text-[#6F665D]">{label}<input value={profileDraft[key]} onChange={(event)=>setProfileDraft((current)=>({...current,[key]:event.target.value}))} className="h-10 rounded-xl border border-black/[.08] bg-[#FBFAF8] px-3 text-[9px] font-normal outline-none focus:border-[#B7793B]/40" /></label>)}
            <button onClick={saveSupplierProfile} disabled={saving || !profileDraft.businessName.trim()} className="rounded-xl bg-[#1D1A17] px-4 py-2.5 text-[9px] font-semibold text-white disabled:opacity-40">Save supplier profile</button>
          </> : <><div>Phone: {account.phone || "—"}</div><div>Website: {account.website || "—"}</div></>}
          <div>Invited customer relationships: {customers.length}</div>
          <div className="pt-2 text-[8px] leading-4 text-[#9A744B]">One Supplier Network profile can use invited relationships, a free shop and a linked Business at the same time.</div>
        </div>
      </Panel>
      <Panel eyebrow="Free Supplier Shop" title={storefront.name || "No shop yet"}>
        {capabilities.storefront ? <div className="grid gap-3 text-[9px] text-[#756E66]">
          <div>Store slug: {storefront.slug || "—"}</div>
          <div>Status: {storefront.status || "DRAFT"}</div>
          <div>Network discovery: {account.shop_discoverable ? "Visible" : "Hidden"}</div>
          <div>Public shop: {storefront.allow_public_browse ? "Shareable" : "Private"}</div>
          <div className="flex flex-wrap gap-2">
            <button onClick={()=>setNetworkDiscovery(!account.shop_discoverable)} disabled={saving || storefront.status !== "PUBLISHED"} className="rounded-xl border border-black/[.08] px-4 py-2 text-[9px] font-semibold text-[#2B2621] disabled:opacity-40">{account.shop_discoverable ? "Hide from Supplier Network" : "Show in Supplier Network"}</button>
            {storefront.status === "PUBLISHED" && storefront.allow_public_browse ? <a href={`/suppliers/${storefront.slug}`} target="_blank" rel="noreferrer" className="rounded-xl border border-black/[.08] px-4 py-2 text-[9px] font-semibold text-[#2B2621]">Open public shop ↗</a> : null}
          </div>
          {storefront.status !== "PUBLISHED" ? <div className="text-[8px] leading-4 text-[#9A744B]">Publish the shop before enabling discovery.</div> : null}
          {storefront.status === "PUBLISHED" && !storefront.allow_public_browse ? <div className="text-[8px] leading-4 text-[#81786F]">Enable public browsing in Storefront if you want a shareable public shop URL.</div> : null}
        </div> : <div><p className="text-[9px] leading-5 text-[#756E66]">Create a free shop without purchasing the full Business system.</p><button onClick={createFreeShop} disabled={saving} className="mt-4 rounded-xl bg-[#1D1A17] px-4 py-2 text-[9px] font-semibold text-white disabled:opacity-50">Create free shop →</button></div>}
      </Panel>
      <Panel eyebrow="Avantiqo Business" title={capabilities.business ? "Business connected" : "Connect full Business"}>
        {capabilities.business ? <div className="grid gap-3 text-[9px] text-[#756E66]">
          <div>Organization ID: {account.business_organization_id}</div>
          <div className="text-[8px] leading-4 text-[#9A744B]">The supplier profile, shop, customer relationships and history stay the same. Business adds the full ERP and becomes the canonical catalog source for mapped products.</div>
          <div className="rounded-[14px] border border-black/[.06] bg-[#FBFAF8] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><div className="text-[9px] font-semibold text-[#332F2A]">Business catalog bridge</div><div className="mt-1 text-[8px] text-[#81786F]">{mappedBusinessProducts.length} linked · {unmatchedBusinessProducts.length} unmatched</div></div><button onClick={syncBusinessCatalog} disabled={saving || !mappedBusinessProducts.length} className="rounded-lg border border-black/[.08] bg-white px-3 py-2 text-[8px] font-semibold disabled:opacity-40">Sync linked products</button></div>
            {unmatchedBusinessProducts.length ? <div className="mt-3 space-y-2">{unmatchedBusinessProducts.map((row)=><div key={row.id} className="grid gap-2 rounded-[12px] border border-black/[.055] bg-white p-3 sm:grid-cols-[1fr_1.2fr] sm:items-center"><div><div className="text-[8px] font-semibold text-[#332F2A]">{row.name}</div><div className="mt-1 text-[7px] text-[#81786F]">{row.sku || "No SKU"} · not linked</div></div><select defaultValue="" onChange={(event)=>mapBusinessProduct(row.id,event.target.value)} disabled={saving} className="h-9 rounded-lg border border-black/[.08] bg-[#FBFAF8] px-2 text-[8px] outline-none"><option value="">Link to Business item…</option>{businessItems.map((item)=><option key={item.id} value={item.id}>{item.code ? item.code + " · " : ""}{item.name}</option>)}</select></div>)}</div> : <div className="mt-3 text-[8px] text-emerald-700">All shop products with a Business mapping are linked.</div>}
          </div>
        </div> : <div className="space-y-2">
          {businessCandidates.map((organization)=><button key={organization.id} onClick={()=>connectBusiness(organization.id)} disabled={saving} className="flex w-full items-center justify-between gap-3 rounded-[14px] border border-black/[.07] bg-[#FBFAF8] px-3 py-3 text-left"><span><span className="block text-[9px] font-semibold">{organization.name || organization.legal_name || "Organization"}</span><span className="mt-1 block text-[8px] text-[#81786F]">{organization.role}</span></span><span className="text-[8px] font-semibold text-[#9A744B]">Connect →</span></button>)}
          {!businessCandidates.length ? <div className="text-[9px] leading-5 text-[#756E66]">No owner-managed Avantiqo Business was found for this login. You can continue using invitations and the free shop without one.</div> : null}
        </div>}
      </Panel>
    </div> : null}
  </div>;
}
