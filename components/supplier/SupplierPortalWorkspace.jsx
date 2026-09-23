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
  const [product, setProduct] = useState({ name: "", sku: "", category: "", uom: "", basePrice: "", minimumOrderQuantity: "1", leadTimeDays: "0", imageUrl: "" });
  const [editingProductId, setEditingProductId] = useState("");
  const [storeDraft, setStoreDraft] = useState({});
  const [profileDraft, setProfileDraft] = useState({ businessName: "", displayName: "", phone: "", website: "", supplierCategories: "", serviceAreas: "" });
  const [businessCandidates, setBusinessCandidates] = useState([]);
  const [businessCatalog, setBusinessCatalog] = useState({ products: [], business_items: [] });
  const [connectionRequests, setConnectionRequests] = useState([]);
  const [selectedCustomerRelationshipId, setSelectedCustomerRelationshipId] = useState("");
  const [customerTerms, setCustomerTerms] = useState(null);
  const [termDrafts, setTermDrafts] = useState({});
  const [termsLoading, setTermsLoading] = useState(false);
  const [orderResponseDrafts, setOrderResponseDrafts] = useState({});
  const [invoiceSubmissions, setInvoiceSubmissions] = useState([]);
  const [supplierTeam, setSupplierTeam] = useState([]);
  const [teamInvite, setTeamInvite] = useState({ email: "", role: "MEMBER" });
  const [invoiceDraft, setInvoiceDraft] = useState({
    supplierPortalAccessId: "",
    purchaseOrderId: "",
    invoiceNumber: "",
    invoiceDate: new Date().toISOString().slice(0, 10),
    dueDate: "",
    currencyCode: "THB",
    totalAmount: "",
    supplierNote: "",
    file: null,
  });
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
        supplierCategories: (storePayload.account?.supplier_categories || []).join(", "),
        serviceAreas: (storePayload.account?.service_areas || []).join(", "),
      });

      if (["home","orders","documents","payments"].includes(section)) {
        const response = await fetch("/api/supplier-portal/operations", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to load supplier operations");
        setOperations(payload);
        const drafts = {};
        for (const order of payload.orders || []) {
          drafts[order.id] = {
            promisedDeliveryDate: order.supplier_response?.promised_delivery_date || order.expected_delivery_date || "",
            supplierNote: order.supplier_response?.supplier_note || "",
            dispatchReference: order.supplier_response?.dispatch_reference || "",
          };
        }
        setOrderResponseDrafts(drafts);
      }

      if (section === "documents") {
        const response = await fetch("/api/supplier-portal/invoices", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to load supplier invoice submissions");
        setInvoiceSubmissions(payload.submissions || []);
      }

      if (["home","customers","settings"].includes(section)) {
        const response = await fetch("/api/supplier-portal/connections", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to load supplier connection requests");
        setConnectionRequests(payload.requests || []);
      }

      if (section === "settings") {
        const [businessResponse, teamResponse] = await Promise.all([
          fetch("/api/supplier-portal/business", { cache: "no-store" }),
          fetch("/api/supplier-portal/team", { cache: "no-store" }),
        ]);
        const businessPayload = await businessResponse.json().catch(() => ({}));
        const teamPayload = await teamResponse.json().catch(() => ({}));
        if (!businessResponse.ok || !businessPayload?.success) throw new Error(businessPayload?.error || "Unable to load Avantiqo Business connections");
        if (teamResponse.status !== 403 && (!teamResponse.ok || !teamPayload?.success)) throw new Error(teamPayload?.error || "Unable to load supplier team");
        setBusinessCandidates(businessPayload.organizations || []);
        setBusinessCatalog(businessPayload.catalog || { products: [], business_items: [] });
        setSupplierTeam(teamResponse.ok && teamPayload?.success ? (teamPayload.members || []) : []);
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
  const shopSetup = {
    profile: Boolean(store?.account?.business_name),
    product: products.some((row) => row.is_active !== false),
    presentation: Boolean(store?.storefront?.name && store?.storefront?.headline),
    published: store?.storefront?.status === "PUBLISHED",
    visibility: store?.account?.shop_discoverable === true || store?.storefront?.allow_public_browse === true,
  };
  const shopSetupComplete = Object.values(shopSetup).every(Boolean);
  const selectedInvoiceCustomer = customers.find((row) =>
    String(row.supplier_portal_access_id || row.id) === String(invoiceDraft.supplierPortalAccessId || "")
  ) || null;
  const eligibleInvoiceOrders = orders.filter((row) =>
    selectedInvoiceCustomer &&
    String(row.organization_id || "") === String(selectedInvoiceCustomer.organization_id || "") &&
    ["APPROVED","RECEIVED"].includes(String(row.status || "").toUpperCase())
  );

  async function inviteSupplierTeam(event) {
    event?.preventDefault?.();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/supplier-portal/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(teamInvite),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to invite supplier team member");
      setTeamInvite({ email: "", role: "MEMBER" });
      await load();
    } catch (teamError) {
      setError(teamError?.message || "Unable to invite supplier team member");
    } finally {
      setSaving(false);
    }
  }

  async function updateSupplierTeamAccess(membershipId, patch) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/supplier-portal/team", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipId, ...patch }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to update supplier team member");
      await load();
    } catch (teamError) {
      setError(teamError?.message || "Unable to update supplier team member");
    } finally {
      setSaving(false);
    }
  }

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
  async function uploadSupplierMedia(file, kind) {
    if (!file) return null;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("kind", kind);
    const response = await fetch("/api/supplier-portal/media", { method: "POST", body: formData });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to upload supplier image");
    return payload.url;
  }

  async function uploadSupplierLogo(file) {
    if (!file) return;
    setSaving(true);
    setError("");
    try {
      const logoUrl = await uploadSupplierMedia(file, "logo");
      const response = await fetch("/api/supplier-portal/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logoUrl }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to save supplier logo");
      await load();
    } catch (logoError) {
      setError(logoError?.message || "Unable to upload supplier logo");
    } finally {
      setSaving(false);
    }
  }

  async function uploadProductImage(file) {
    if (!file) return;
    setSaving(true);
    setError("");
    try {
      const imageUrl = await uploadSupplierMedia(file, "product");
      setProduct((current) => ({ ...current, imageUrl }));
    } catch (imageError) {
      setError(imageError?.message || "Unable to upload product image");
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
      setProduct({ name: "", sku: "", category: "", uom: "", basePrice: "", minimumOrderQuantity: "1", leadTimeDays: "0", imageUrl: "" });
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
      imageUrl: row.image_url || "",
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

  async function updateOrderResponse(orderId, status) {
    setSaving(true);
    setError("");
    try {
      const draft = orderResponseDrafts[orderId] || {};
      const response = await fetch("/api/supplier-portal/operations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchaseOrderId: orderId,
          status,
          promisedDeliveryDate: draft.promisedDeliveryDate || "",
          supplierNote: draft.supplierNote || "",
          dispatchReference: draft.dispatchReference || "",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to update purchase order response");
      await load();
    } catch (orderError) {
      setError(orderError?.message || "Unable to update purchase order response");
    } finally {
      setSaving(false);
    }
  }

  async function submitSupplierInvoice(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (!invoiceDraft.supplierPortalAccessId) throw new Error("Choose the customer for this invoice");
      if (!invoiceDraft.file) throw new Error("Choose the invoice PDF or image");
      const formData = new FormData();
      for (const [key, value] of Object.entries(invoiceDraft)) {
        if (key === "file") continue;
        formData.append(key, value ?? "");
      }
      formData.append("file", invoiceDraft.file);

      const response = await fetch("/api/supplier-portal/invoices", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to submit supplier invoice");

      setInvoiceDraft((current) => ({
        supplierPortalAccessId: current.supplierPortalAccessId,
        purchaseOrderId: "",
        invoiceNumber: "",
        invoiceDate: new Date().toISOString().slice(0, 10),
        dueDate: "",
        currencyCode: current.currencyCode || "THB",
        totalAmount: "",
        supplierNote: "",
        file: null,
      }));
      await load();
    } catch (invoiceError) {
      setError(invoiceError?.message || "Unable to submit supplier invoice");
    } finally {
      setSaving(false);
    }
  }

  async function openCustomerTerms(relationshipId) {
    setSelectedCustomerRelationshipId(relationshipId);
    setTermsLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/supplier-portal/terms?relationshipId=${encodeURIComponent(relationshipId)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to load customer pricing terms");
      setCustomerTerms(payload);
      const drafts = {};
      for (const row of payload.products || []) {
        drafts[row.id] = {
          customerPrice: row.customer_term?.customer_price ?? "",
          minimumOrderQuantity: row.customer_term?.minimum_order_quantity ?? "",
          currencyCode: row.customer_term?.currency_code || row.currency_code || "THB",
        };
      }
      setTermDrafts(drafts);
    } catch (termsError) {
      setCustomerTerms(null);
      setError(termsError?.message || "Unable to load customer pricing terms");
    } finally {
      setTermsLoading(false);
    }
  }

  async function saveCustomerTerm(productId, { useBase = false } = {}) {
    if (!selectedCustomerRelationshipId) return;
    setSaving(true);
    setError("");
    try {
      const draft = termDrafts[productId] || {};
      const response = await fetch("/api/supplier-portal/terms", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          relationshipId: selectedCustomerRelationshipId,
          productId,
          customerPrice: draft.customerPrice ?? "",
          minimumOrderQuantity: draft.minimumOrderQuantity ?? "",
          currencyCode: draft.currencyCode || "THB",
          useBase,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to update customer pricing terms");
      await openCustomerTerms(selectedCustomerRelationshipId);
      await load();
    } catch (termsError) {
      setError(termsError?.message || "Unable to update customer pricing terms");
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
      {capabilities.storefront && !shopSetupComplete ? <Panel eyebrow="Free shop setup" title="Finish your supplier shop">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ["Profile",shopSetup.profile,"/supplier-portal/settings"],
            ["Product",shopSetup.product,"/supplier-portal/catalog"],
            ["Storefront",shopSetup.presentation,"/supplier-portal/storefront"],
            ["Publish",shopSetup.published,"/supplier-portal/storefront"],
            ["Visibility",shopSetup.visibility,"/supplier-portal/settings"],
          ].map(([label,done,href])=><a key={label} href={href} className={`rounded-[14px] border px-3 py-3 ${done ? "border-emerald-200 bg-emerald-50/50" : "border-[#B7793B]/18 bg-[#FBF6EF]"}`}><div className="text-[7px] font-semibold uppercase tracking-[.14em] text-[#9A744B]">{done ? "DONE" : "NEXT"}</div><div className="mt-1 text-[9px] font-semibold">{label}</div></a>)}
        </div>
        <div className="mt-3 text-[8px] leading-4 text-[#81786F]">Your shop can remain private while you build it. Publish first, then choose Supplier Network discovery, a public shareable URL, or both.</div>
      </Panel> : null}
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
    {section === "customers" ? <div className="space-y-4">
      <Panel eyebrow="Authority boundaries" title="Customers connected to this supplier identity">
        <div className="grid gap-3 md:grid-cols-2">
          {customers.map((row) => <article key={row.id} className={`rounded-[18px] border p-4 ${String(selectedCustomerRelationshipId) === String(row.id) ? "border-[#B7793B]/30 bg-[#FBF6EF]" : "border-black/[.06] bg-[#FBFAF8]"}`}>
            <div className="text-[11px] font-semibold">{row.organization?.name || row.organization?.legal_name || "Customer"}</div>
            <div className="mt-3 grid gap-1 text-[8px] text-[#756E66]"><div>Relationship: {row.status}</div><div>Store visible: {row.customer_visible ? "Yes" : "No"}</div><div>Ordering: {row.order_enabled ? "Enabled" : "Disabled"}</div><div>Pricing: {row.pricing_mode}</div></div>
            {capabilities.storefront ? <button onClick={()=>openCustomerTerms(row.id)} disabled={termsLoading} className="mt-4 rounded-xl border border-black/[.08] bg-white px-3 py-2 text-[8px] font-semibold disabled:opacity-40">{String(selectedCustomerRelationshipId) === String(row.id) ? "Refresh pricing & terms" : "Pricing & terms →"}</button> : null}
          </article>)}
        </div>
        {!customers.length ? <div className="text-[9px] text-[#81786F]">No accepted customer relationship yet.</div> : null}
      </Panel>

      {selectedCustomerRelationshipId ? <Panel eyebrow="Private customer terms" title={customerTerms?.relationship?.organization?.name || customerTerms?.relationship?.organization?.legal_name || "Customer pricing"}>
        {termsLoading ? <div className="text-[9px] text-[#81786F]">Loading customer pricing…</div> : customerTerms ? <div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-black/[.06] bg-[#FBFAF8] p-3">
            <div className="text-[8px] leading-4 text-[#756E66]">These overrides apply only to this connected customer. Other customers continue using their own terms or the base catalog.</div>
            <button onClick={()=>{setSelectedCustomerRelationshipId("");setCustomerTerms(null);setTermDrafts({});}} className="rounded-lg border border-black/[.08] bg-white px-3 py-2 text-[7px] font-semibold">Close</button>
          </div>
          <div className="mt-3 space-y-2">
            {(customerTerms.products || []).map((row) => {
              const draft = termDrafts[row.id] || {};
              const custom = Boolean(row.customer_term);
              return <div key={row.id} className="rounded-[16px] border border-black/[.06] bg-white p-4">
                <div className="grid gap-3 lg:grid-cols-[1.1fr_.7fr_.7fr_auto] lg:items-end">
                  <div>
                    <div className="flex items-center gap-2"><div className="text-[9px] font-semibold">{row.name}</div><span className={`rounded-full px-2 py-0.5 text-[6px] font-semibold ${custom ? "bg-[#EFE0CC] text-[#76502E]" : "bg-[#F1EFEB] text-[#81786F]"}`}>{custom ? "CUSTOM" : "BASE"}</span></div>
                    <div className="mt-1 text-[7px] text-[#81786F]">{row.sku || "No SKU"} · Base {money(row.base_price,row.currency_code)} · MOQ {row.minimum_order_quantity} {row.uom || ""}</div>
                  </div>
                  <label className="grid gap-1 text-[7px] font-semibold text-[#6F665D]">Customer price<input type="number" min="0" step="0.01" value={draft.customerPrice ?? ""} onChange={(event)=>setTermDrafts((current)=>({...current,[row.id]:{...(current[row.id]||{}),customerPrice:event.target.value}}))} disabled={!canManageSupplier} placeholder={String(row.base_price ?? 0)} className="h-9 rounded-lg border border-black/[.08] bg-[#FBFAF8] px-2 text-[8px] font-normal outline-none disabled:opacity-50"/></label>
                  <label className="grid gap-1 text-[7px] font-semibold text-[#6F665D]">Customer MOQ<input type="number" min="0.0001" step="0.01" value={draft.minimumOrderQuantity ?? ""} onChange={(event)=>setTermDrafts((current)=>({...current,[row.id]:{...(current[row.id]||{}),minimumOrderQuantity:event.target.value}}))} disabled={!canManageSupplier} placeholder={String(row.minimum_order_quantity ?? 1)} className="h-9 rounded-lg border border-black/[.08] bg-[#FBFAF8] px-2 text-[8px] font-normal outline-none disabled:opacity-50"/></label>
                  {canManageSupplier ? <div className="flex gap-1"><button onClick={()=>saveCustomerTerm(row.id)} disabled={saving} className="h-9 rounded-lg bg-[#1D1A17] px-3 text-[7px] font-semibold text-white disabled:opacity-40">Save</button>{custom ? <button onClick={()=>saveCustomerTerm(row.id,{useBase:true})} disabled={saving} className="h-9 rounded-lg border border-black/[.08] px-3 text-[7px] font-semibold disabled:opacity-40">Use base</button> : null}</div> : <div className="text-[7px] text-[#81786F]">View only</div>}
                </div>
              </div>;
            })}
          </div>
          {!(customerTerms.products || []).length ? <div className="mt-3 text-[9px] text-[#81786F]">Add products to the supplier catalog before setting customer-specific terms.</div> : null}
        </div> : <div className="text-[9px] text-[#81786F]">Customer pricing could not be loaded.</div>}
      </Panel> : null}
    </div> : null}

    {section === "catalog" ? <div className="grid gap-4 xl:grid-cols-[.72fr_1.28fr]">
      {canManageSupplier ? <Panel eyebrow={editingProductId ? "Edit product" : "Add product"} title={editingProductId ? "Update catalog item" : "New catalog item"}>
        <form onSubmit={createProduct} className="grid gap-3">
          {[
            ["name","Product name","text"],["sku","SKU","text"],["category","Category","text"],["uom","Unit of measure","text"],["basePrice","Base price","number"],["minimumOrderQuantity","Minimum order","number"],["leadTimeDays","Lead time days","number"]
          ].map(([key,label,type]) => <label key={key} className="grid gap-1 text-[8px] font-semibold text-[#6F665D]">{label}<input type={type} step={type === "number" ? "0.01" : undefined} value={product[key]} onChange={(event)=>setProduct((current)=>Object.assign({},current,{[key]:event.target.value}))} className="h-10 rounded-xl border border-black/[.08] bg-[#FBFAF8] px-3 text-[10px] font-normal outline-none focus:border-[#B7793B]/40" /></label>)}
          <label className="grid gap-1 text-[8px] font-semibold text-[#6F665D]">Product image<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event)=>uploadProductImage(event.target.files?.[0] || null)} className="h-10 rounded-xl border border-black/[.08] bg-[#FBFAF8] px-2 py-2 text-[7px] font-normal" /><span className="text-[7px] font-normal text-[#91877C]">JPG, PNG or WEBP · max 8 MB</span></label>
          {product.imageUrl ? <div className="overflow-hidden rounded-[14px] border border-black/[.07] bg-[#F4F0E9]"><img src={product.imageUrl} alt="" className="h-36 w-full object-cover" /></div> : null}
          <div className="mt-2 flex gap-2"><button disabled={saving || !product.name.trim()} className="h-11 flex-1 rounded-xl bg-[#1D1A17] text-[9px] font-semibold text-white disabled:opacity-40">{editingProductId ? "Save changes" : "Add product"}</button>{editingProductId ? <button type="button" onClick={()=>{setEditingProductId("");setProduct({ name:"",sku:"",category:"",uom:"",basePrice:"",minimumOrderQuantity:"1",leadTimeDays:"0",imageUrl:"" });}} className="h-11 rounded-xl border border-black/[.08] px-4 text-[9px] font-semibold">Cancel</button> : null}</div>
        </form>
      </Panel> : <Panel eyebrow="Catalog access" title="View only"><div className="text-[9px] leading-5 text-[#756E66]">Owner or admin access is required to change the supplier catalog.</div></Panel>}
      <Panel eyebrow="Catalog" title={String(products.length) + " products"}>
        <div className="space-y-2">{products.map((row) => <div key={row.id} className="grid gap-3 rounded-[16px] border border-black/[.06] bg-[#FBFAF8] p-4 sm:grid-cols-[72px_1fr_auto] sm:items-center">{row.image_url ? <img src={row.image_url} alt="" className="h-[72px] w-[72px] rounded-[12px] object-cover" /> : <div className="hidden h-[72px] w-[72px] rounded-[12px] bg-[#EFE8DE] sm:block" />}<div><div className="flex items-center gap-2"><div className="text-[10px] font-semibold">{row.name}</div>{row.is_active === false ? <span className="rounded-full border border-black/[.08] px-2 py-0.5 text-[7px] font-semibold text-[#81786F]">Inactive</span> : null}</div><div className="mt-1 text-[8px] text-[#81786F]">{row.sku || "No SKU"} · {row.category || "Uncategorized"} · MOQ {row.minimum_order_quantity} {row.uom || ""} · {row.lead_time_days || 0}d lead</div></div><div className="text-right"><div className="text-[10px] font-semibold">{money(row.base_price,row.currency_code)}</div>{canManageSupplier ? <div className="mt-2 flex gap-1"><button onClick={()=>editProduct(row)} className="rounded-lg border border-black/[.08] px-2 py-1 text-[7px] font-semibold">Edit</button><button onClick={()=>setProductActive(row,row.is_active === false)} disabled={saving} className="rounded-lg border border-black/[.08] px-2 py-1 text-[7px] font-semibold disabled:opacity-40">{row.is_active === false ? "Activate" : "Deactivate"}</button></div> : null}</div></div>)}</div>
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
        <div className="rounded-[20px] border border-black/[.07] bg-[#F3E7D7]/55 p-6"><div className="text-[8px] uppercase tracking-[.18em] text-[#9A744B]">{storefront.status || "DRAFT"} STOREFRONT</div><div className="mt-3 text-[28px] font-medium tracking-[-.04em]">{storeDraft.headline || "A clear supplier storefront for your customers."}</div><p className="mt-3 max-w-xl text-[9px] leading-5 text-[#756E66]">{storeDraft.description || "Your product catalog, customer-specific terms and ordering access will appear here."}</p><div className="mt-6 grid gap-2 sm:grid-cols-2">{products.slice(0,4).map((row)=><div key={row.id} className="overflow-hidden rounded-[14px] bg-white/70">{row.image_url ? <img src={row.image_url} alt="" className="h-28 w-full object-cover" /> : null}<div className="p-3"><div className="text-[9px] font-semibold">{row.name}</div><div className="mt-1 text-[8px] text-[#81786F]">{money(row.base_price,row.currency_code)}</div></div></div>)}</div></div>
      </Panel>
    </div> : null}
    {section === "orders" ? <Panel eyebrow="ERP purchase orders" title="Orders from connected customers">
      <div className="space-y-3">
        {orders.map((row) => {
          const buyerStatus = String(row.status || "").toUpperCase();
          const response = row.supplier_response || null;
          const supplierStatus = String(response?.response_status || "PENDING").toUpperCase();
          const draft = orderResponseDrafts[row.id] || {};
          const buyerApproved = buyerStatus === "APPROVED";
          const terminal = ["DECLINED","DISPATCHED"].includes(supplierStatus);
          return <article key={row.id} className="rounded-[18px] border border-black/[.06] bg-[#FBFAF8] p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-semibold">{row.po_number || "Purchase order"}</div>
                <div className="mt-1 text-[8px] text-[#81786F]">{row.customer?.name || row.customer?.legal_name || "Customer"} · Customer delivery {when(row.expected_delivery_date)}</div>
              </div>
              <div className="text-right">
                <div className="text-[12px] font-semibold">{money(row.total_amount,row.currency || "THB")}</div>
                <div className="mt-2 flex flex-wrap justify-end gap-1">
                  <span className="rounded-full border border-black/[.07] bg-white px-2 py-1 text-[6px] font-semibold">CUSTOMER · {buyerStatus || "—"}</span>
                  <span className={`rounded-full border px-2 py-1 text-[6px] font-semibold ${supplierStatus === "DECLINED" ? "border-red-200 bg-red-50 text-red-700" : supplierStatus === "DISPATCHED" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-[#B7793B]/18 bg-[#FBF6EF] text-[#76502E]"}`}>SUPPLIER · {buyerApproved ? supplierStatus : "WAITING"}</span>
                </div>
              </div>
            </div>

            {!buyerApproved ? <div className="mt-4 rounded-[12px] border border-black/[.06] bg-white p-3 text-[8px] leading-4 text-[#756E66]">Awaiting customer approval. Supplier acknowledgement is intentionally locked until the customer approves the purchase order.</div> : <div className="mt-4 space-y-3">
              <div className="grid gap-3 md:grid-cols-3">
                <label className="grid gap-1 text-[7px] font-semibold text-[#6F665D]">Promised delivery<input type="date" value={draft.promisedDeliveryDate || ""} disabled={terminal} onChange={(event)=>setOrderResponseDrafts((current)=>({...current,[row.id]:{...(current[row.id]||{}),promisedDeliveryDate:event.target.value}}))} className="h-9 rounded-lg border border-black/[.08] bg-white px-2 text-[8px] font-normal outline-none disabled:opacity-50"/></label>
                <label className="grid gap-1 text-[7px] font-semibold text-[#6F665D]">Supplier note<input value={draft.supplierNote || ""} disabled={terminal} onChange={(event)=>setOrderResponseDrafts((current)=>({...current,[row.id]:{...(current[row.id]||{}),supplierNote:event.target.value}}))} placeholder="Optional message to customer" className="h-9 rounded-lg border border-black/[.08] bg-white px-2 text-[8px] font-normal outline-none disabled:opacity-50"/></label>
                <label className="grid gap-1 text-[7px] font-semibold text-[#6F665D]">Dispatch reference<input value={draft.dispatchReference || ""} disabled={supplierStatus !== "IN_FULFILLMENT"} onChange={(event)=>setOrderResponseDrafts((current)=>({...current,[row.id]:{...(current[row.id]||{}),dispatchReference:event.target.value}}))} placeholder="Tracking / delivery reference" className="h-9 rounded-lg border border-black/[.08] bg-white px-2 text-[8px] font-normal outline-none disabled:opacity-50"/></label>
              </div>

              <div className="flex flex-wrap gap-2">
                {supplierStatus === "PENDING" ? <>
                  <button onClick={()=>updateOrderResponse(row.id,"ACKNOWLEDGED")} disabled={saving} className="rounded-xl bg-[#1D1A17] px-4 py-2.5 text-[8px] font-semibold text-white disabled:opacity-40">Acknowledge order</button>
                  <button onClick={()=>updateOrderResponse(row.id,"DECLINED")} disabled={saving} className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[8px] font-semibold text-red-700 disabled:opacity-40">Decline</button>
                </> : null}
                {supplierStatus === "ACKNOWLEDGED" ? <>
                  <button onClick={()=>updateOrderResponse(row.id,"ACKNOWLEDGED")} disabled={saving} className="rounded-xl border border-black/[.08] bg-white px-4 py-2.5 text-[8px] font-semibold disabled:opacity-40">Save delivery details</button>
                  <button onClick={()=>updateOrderResponse(row.id,"IN_FULFILLMENT")} disabled={saving} className="rounded-xl bg-[#1D1A17] px-4 py-2.5 text-[8px] font-semibold text-white disabled:opacity-40">Start fulfillment</button>
                </> : null}
                {supplierStatus === "IN_FULFILLMENT" ? <>
                  <button onClick={()=>updateOrderResponse(row.id,"IN_FULFILLMENT")} disabled={saving} className="rounded-xl border border-black/[.08] bg-white px-4 py-2.5 text-[8px] font-semibold disabled:opacity-40">Save details</button>
                  <button onClick={()=>updateOrderResponse(row.id,"DISPATCHED")} disabled={saving} className="rounded-xl bg-[#1D1A17] px-4 py-2.5 text-[8px] font-semibold text-white disabled:opacity-40">Mark dispatched</button>
                </> : null}
                {supplierStatus === "DISPATCHED" ? <div className="text-[8px] text-emerald-700">Dispatched {response?.dispatched_at ? when(response.dispatched_at) : ""}{response?.dispatch_reference ? " · " + response.dispatch_reference : ""}</div> : null}
                {supplierStatus === "DECLINED" ? <div className="text-[8px] text-red-700">Declined {response?.declined_at ? when(response.declined_at) : ""}</div> : null}
              </div>
            </div>}
          </article>;
        })}
      </div>
      {!orders.length ? <div className="py-5 text-[9px] text-[#81786F]">No customer purchase orders are assigned to this supplier yet.</div> : null}
    </Panel> : null}

    {section === "documents" ? <div className="space-y-4">
      <Panel eyebrow="Supplier invoice intake" title="Submit invoice for customer Finance review">
        <div className="mb-4 rounded-[14px] border border-[#B7793B]/16 bg-[#FBF6EF] p-3 text-[8px] leading-4 text-[#756E66]">
          Submitting here does not post accounting. The invoice file and metadata enter the customer&apos;s Finance review queue. Customer Finance remains responsible for acceptance and conversion into the canonical vendor invoice.
        </div>
        <form onSubmit={submitSupplierInvoice} className="grid gap-3">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="grid gap-1 text-[7px] font-semibold text-[#6F665D]">Customer
              <select value={invoiceDraft.supplierPortalAccessId} onChange={(event)=>setInvoiceDraft((current)=>({...current,supplierPortalAccessId:event.target.value,purchaseOrderId:""}))} className="h-10 rounded-xl border border-black/[.08] bg-[#FBFAF8] px-3 text-[8px] font-normal outline-none">
                <option value="">Choose customer…</option>
                {customers.map((row)=><option key={row.supplier_portal_access_id || row.id} value={row.supplier_portal_access_id || row.id}>{row.organization?.name || row.organization?.legal_name || "Customer"}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-[7px] font-semibold text-[#6F665D]">Purchase order <span className="font-normal text-[#91877C]">(optional)</span>
              <select value={invoiceDraft.purchaseOrderId} onChange={(event)=>setInvoiceDraft((current)=>({...current,purchaseOrderId:event.target.value}))} disabled={!invoiceDraft.supplierPortalAccessId} className="h-10 rounded-xl border border-black/[.08] bg-[#FBFAF8] px-3 text-[8px] font-normal outline-none disabled:opacity-50">
                <option value="">No PO / general invoice</option>
                {eligibleInvoiceOrders.map((row)=><option key={row.id} value={row.id}>{row.po_number || "PO"} · {row.status} · {money(row.total_amount,row.currency || "THB")}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-[7px] font-semibold text-[#6F665D]">Invoice number
              <input value={invoiceDraft.invoiceNumber} onChange={(event)=>setInvoiceDraft((current)=>({...current,invoiceNumber:event.target.value}))} required className="h-10 rounded-xl border border-black/[.08] bg-[#FBFAF8] px-3 text-[8px] font-normal outline-none"/>
            </label>
            <label className="grid gap-1 text-[7px] font-semibold text-[#6F665D]">Total amount
              <input type="number" min="0.01" step="0.01" value={invoiceDraft.totalAmount} onChange={(event)=>setInvoiceDraft((current)=>({...current,totalAmount:event.target.value}))} required className="h-10 rounded-xl border border-black/[.08] bg-[#FBFAF8] px-3 text-[8px] font-normal outline-none"/>
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="grid gap-1 text-[7px] font-semibold text-[#6F665D]">Invoice date
              <input type="date" value={invoiceDraft.invoiceDate} onChange={(event)=>setInvoiceDraft((current)=>({...current,invoiceDate:event.target.value}))} required className="h-10 rounded-xl border border-black/[.08] bg-[#FBFAF8] px-3 text-[8px] font-normal outline-none"/>
            </label>
            <label className="grid gap-1 text-[7px] font-semibold text-[#6F665D]">Due date
              <input type="date" value={invoiceDraft.dueDate} onChange={(event)=>setInvoiceDraft((current)=>({...current,dueDate:event.target.value}))} className="h-10 rounded-xl border border-black/[.08] bg-[#FBFAF8] px-3 text-[8px] font-normal outline-none"/>
            </label>
            <label className="grid gap-1 text-[7px] font-semibold text-[#6F665D]">Currency
              <input value={invoiceDraft.currencyCode} maxLength={8} onChange={(event)=>setInvoiceDraft((current)=>({...current,currencyCode:event.target.value.toUpperCase()}))} className="h-10 rounded-xl border border-black/[.08] bg-[#FBFAF8] px-3 text-[8px] font-normal uppercase outline-none"/>
            </label>
            <label className="grid gap-1 text-[7px] font-semibold text-[#6F665D]">Invoice PDF / image
              <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event)=>setInvoiceDraft((current)=>({...current,file:event.target.files?.[0] || null}))} required className="h-10 rounded-xl border border-black/[.08] bg-[#FBFAF8] px-2 py-2 text-[7px] font-normal"/>
            </label>
          </div>
          <label className="grid gap-1 text-[7px] font-semibold text-[#6F665D]">Note to customer Finance
            <input value={invoiceDraft.supplierNote} onChange={(event)=>setInvoiceDraft((current)=>({...current,supplierNote:event.target.value}))} placeholder="Optional reference or explanation" className="h-10 rounded-xl border border-black/[.08] bg-[#FBFAF8] px-3 text-[8px] font-normal outline-none"/>
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button disabled={saving || !invoiceDraft.supplierPortalAccessId || !invoiceDraft.invoiceNumber.trim() || !invoiceDraft.totalAmount || !invoiceDraft.file} className="rounded-xl bg-[#1D1A17] px-5 py-3 text-[8px] font-semibold text-white disabled:opacity-40">Submit to customer Finance →</button>
            <div className="text-[7px] text-[#91877C]">PDF/JPG/PNG/WEBP · max 20 MB · approval required · financial impact flagged</div>
          </div>
        </form>
      </Panel>

      <Panel eyebrow="Submitted evidence" title="Supplier invoice submissions">
        <div className="space-y-2">
          {invoiceSubmissions.map((row)=><article key={row.id} className="grid gap-3 rounded-[16px] border border-black/[.06] bg-[#FBFAF8] p-4 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2"><div className="text-[10px] font-semibold">{row.invoice_number}</div><span className="rounded-full border border-black/[.07] bg-white px-2 py-1 text-[6px] font-semibold">{row.status}</span></div>
              <div className="mt-1 text-[8px] text-[#81786F]">{row.customer?.name || row.customer?.legal_name || "Customer"} · invoice {when(row.invoice_date)}{row.due_date ? " · due " + when(row.due_date) : ""}{row.purchase_order_id ? " · PO linked" : ""}</div>
              {row.review_note ? <div className="mt-2 text-[8px] text-[#76502E]">Finance review · {row.review_note}</div> : null}
              {row.document?.file_url ? <a href={row.document.file_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-[8px] font-semibold text-[#815B36]">{row.document.file_name || "Open invoice evidence"} ↗</a> : null}
            </div>
            <div className="text-right"><div className="text-[10px] font-semibold">{money(row.total_amount,row.currency_code || "THB")}</div>{row.canonical_vendor_invoice_id ? <div className="mt-1 text-[7px] text-emerald-700">Converted to canonical AP invoice</div> : <div className="mt-1 text-[7px] text-[#81786F]">Customer Finance review</div>}</div>
          </article>)}
        </div>
        {!invoiceSubmissions.length ? <div className="text-[9px] text-[#81786F]">No supplier invoice submissions yet.</div> : null}
      </Panel>

      <Panel eyebrow="Canonical ERP invoices" title="Invoices recorded by connected customers">
        <div className="space-y-2">{invoices.map((row)=><div key={row.id} className="grid gap-3 rounded-[16px] border border-black/[.06] p-4 sm:grid-cols-[1fr_auto]"><div><div className="text-[10px] font-semibold">{row.invoice_number || "Vendor invoice"}</div><div className="mt-1 text-[8px] text-[#81786F]">{row.customer?.name || row.customer?.legal_name || "Customer"} · {row.status} · due {when(row.due_date)}</div></div><div className="text-[10px] font-semibold">{money(row.total_amount,row.currency_code || "THB")}</div></div>)}</div>
        {!invoices.length ? <div className="text-[9px] text-[#81786F]">No canonical customer vendor invoices are visible yet.</div> : null}
      </Panel>
    </div> : null}

    {section === "payments" ? <Panel eyebrow="ERP payments" title="Payments from connected customers">
      <div className="space-y-2">{payments.map((row)=><div key={row.id} className="flex items-center justify-between gap-4 rounded-[16px] border border-black/[.06] p-4"><div><div className="text-[10px] font-semibold">{row.customer?.name || row.customer?.legal_name || "Customer"}</div><div className="mt-1 text-[8px] text-[#81786F]">{when(row.paid_at)} · {row.payment_method || "Payment"} · {row.reference_number || "No reference"}</div></div><div className="text-[10px] font-semibold">{money(row.amount,row.currency_code || "THB")}</div></div>)}</div>
      {!payments.length ? <div className="text-[9px] text-[#81786F]">No customer payments are visible yet.</div> : null}
    </Panel> : null}

    {section === "settings" ? <div className="grid gap-4 xl:grid-cols-2">
      <Panel eyebrow="Supplier identity" title={account.business_name || account.display_name || "Supplier"}>
        <div className="grid gap-3 text-[9px] text-[#756E66]">
          <div className="flex items-center gap-3">{account.logo_url ? <img src={account.logo_url} alt="" className="h-14 w-14 rounded-[14px] object-cover" /> : <div className="h-14 w-14 rounded-[14px] bg-[#EFE8DE]" />}<div>Email: {account.email || "—"}</div></div>
          {canManageSupplier ? <>
            <label className="grid gap-1 text-[8px] font-semibold text-[#6F665D]">Supplier logo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event)=>uploadSupplierLogo(event.target.files?.[0] || null)} className="h-10 rounded-xl border border-black/[.08] bg-[#FBFAF8] px-2 py-2 text-[7px] font-normal" /><span className="text-[7px] font-normal text-[#91877C]">JPG, PNG or WEBP · max 8 MB</span></label>
            {[
              ["businessName","Business name"],["displayName","Display name"],["phone","Phone"],["website","Website"]
            ].map(([key,label])=><label key={key} className="grid gap-1 text-[8px] font-semibold text-[#6F665D]">{label}<input value={profileDraft[key]} onChange={(event)=>setProfileDraft((current)=>({...current,[key]:event.target.value}))} className="h-10 rounded-xl border border-black/[.08] bg-[#FBFAF8] px-3 text-[9px] font-normal outline-none focus:border-[#B7793B]/40" /></label>)}
            <label className="grid gap-1 text-[8px] font-semibold text-[#6F665D]">Supplier categories<input value={profileDraft.supplierCategories} onChange={(event)=>setProfileDraft((current)=>({...current,supplierCategories:event.target.value}))} placeholder="Seafood, Hotel amenities, Cleaning supplies" className="h-10 rounded-xl border border-black/[.08] bg-[#FBFAF8] px-3 text-[9px] font-normal outline-none focus:border-[#B7793B]/40" /><span className="text-[7px] font-normal text-[#91877C]">Comma-separated. Used for Supplier Network discovery.</span></label>
            <label className="grid gap-1 text-[8px] font-semibold text-[#6F665D]">Service / delivery areas<input value={profileDraft.serviceAreas} onChange={(event)=>setProfileDraft((current)=>({...current,serviceAreas:event.target.value}))} placeholder="Phuket, Karon, Patong, Phang Nga" className="h-10 rounded-xl border border-black/[.08] bg-[#FBFAF8] px-3 text-[9px] font-normal outline-none focus:border-[#B7793B]/40" /><span className="text-[7px] font-normal text-[#91877C]">Cities, regions or delivery areas customers can search.</span></label>
            <button onClick={saveSupplierProfile} disabled={saving || !profileDraft.businessName.trim()} className="rounded-xl bg-[#1D1A17] px-4 py-2.5 text-[9px] font-semibold text-white disabled:opacity-40">Save supplier profile</button>
          </> : <><div>Phone: {account.phone || "—"}</div><div>Website: {account.website || "—"}</div></>}
          <div>Invited customer relationships: {customers.length}</div>
          <div className="pt-2 text-[8px] leading-4 text-[#9A744B]">One Supplier Network profile can use invited relationships, a free shop and a linked Business at the same time.</div>
        </div>
      </Panel>
      {canManageSupplier ? <Panel eyebrow="Supplier team" title={`${supplierTeam.filter((row)=>String(row.status || "").toUpperCase()==="ACTIVE").length} active member${supplierTeam.filter((row)=>String(row.status || "").toUpperCase()==="ACTIVE").length === 1 ? "" : "s"}`}>
        <div className="space-y-4">
          <div className="rounded-[14px] border border-[#B7793B]/15 bg-[#FBF6EF] p-3 text-[8px] leading-4 text-[#756E66]">Supplier team access is limited to this Supplier Network profile. It does not create Staff Portal access, organization membership, or internal Avantiqo Business workspace access.</div>
          <form onSubmit={inviteSupplierTeam} className="grid gap-2 sm:grid-cols-[1fr_130px_auto]">
            <input type="email" required value={teamInvite.email} onChange={(event)=>setTeamInvite((current)=>({...current,email:event.target.value}))} placeholder="teammate@example.com" className="h-10 rounded-xl border border-black/[.08] bg-[#FBFAF8] px-3 text-[9px] outline-none focus:border-[#B7793B]/40"/>
            <select value={teamInvite.role} onChange={(event)=>setTeamInvite((current)=>({...current,role:event.target.value}))} className="h-10 rounded-xl border border-black/[.08] bg-[#FBFAF8] px-3 text-[8px] outline-none">
              <option value="MEMBER">Member</option>
              <option value="ADMIN">Admin</option>
            </select>
            <button disabled={saving || !teamInvite.email.trim()} className="h-10 rounded-xl bg-[#1D1A17] px-4 text-[8px] font-semibold text-white disabled:opacity-40">Invite teammate</button>
          </form>
          <div className="space-y-2">
            {supplierTeam.map((row)=>{
              const role=String(row.role || "MEMBER").toUpperCase();
              const status=String(row.status || "").toUpperCase();
              const protectedMember=role==="OWNER" || row.is_current_user;
              return <div key={row.id} className="grid gap-3 rounded-[14px] border border-black/[.06] bg-[#FBFAF8] p-3 md:grid-cols-[1fr_auto] md:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2"><span className="text-[9px] font-semibold text-[#332F2A]">{row.display_name || row.email || "Supplier teammate"}</span>{row.is_current_user ? <span className="rounded-full border border-black/[.07] bg-white px-2 py-0.5 text-[6px] font-semibold">YOU</span> : null}</div>
                  <div className="mt-1 text-[7px] text-[#81786F]">{row.email || "No email"} · {role} · {status}{row.last_sign_in_at ? " · last sign-in " + when(row.last_sign_in_at) : ""}</div>
                </div>
                {protectedMember ? <div className="text-[7px] font-semibold text-[#9A744B]">{role==="OWNER" ? "Owner access protected" : "Current-user access protected"}</div> : <div className="flex flex-wrap gap-2">
                  <select value={role} disabled={saving} onChange={(event)=>updateSupplierTeamAccess(row.id,{role:event.target.value})} className="h-8 rounded-lg border border-black/[.08] bg-white px-2 text-[7px] outline-none">
                    <option value="MEMBER">Member</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                  <button type="button" disabled={saving} onClick={()=>updateSupplierTeamAccess(row.id,{active:status!=="ACTIVE"})} className={`h-8 rounded-lg border px-3 text-[7px] font-semibold disabled:opacity-40 ${status==="ACTIVE" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{status==="ACTIVE" ? "Deactivate" : "Reactivate"}</button>
                </div>}
              </div>;
            })}
            {!supplierTeam.length ? <div className="text-[8px] text-[#81786F]">No additional supplier teammates yet.</div> : null}
          </div>
        </div>
      </Panel> : null}
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
