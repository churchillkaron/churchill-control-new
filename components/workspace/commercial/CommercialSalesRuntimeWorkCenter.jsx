"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(date);
}

function money(value, currency = "THB") {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency || "THB",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function statusStyle(status) {
  const normalized = String(status || "DRAFT").toUpperCase();
  if (["ACCEPTED", "CONFIRMED", "FULFILLED", "CONVERTED"].includes(normalized)) {
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
  }
  if (["REJECTED", "CANCELLED", "EXPIRED"].includes(normalized)) {
    return "border-rose-400/30 bg-rose-400/10 text-rose-200";
  }
  if (["SENT", "RESERVED"].includes(normalized)) {
    return "border-sky-400/30 bg-sky-400/10 text-sky-200";
  }
  return "border-amber-300/30 bg-amber-300/10 text-amber-100";
}

function emptyLine(type = "service") {
  return {
    key: crypto.randomUUID(),
    item_type: type,
    item_id: "",
    item_name: "",
    description: "",
    quantity: 1,
    unit_price: 0,
    discount_amount: 0,
  };
}

function allowedQuotationActions(status) {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "DRAFT") return ["SEND", "CANCEL"];
  if (normalized === "SENT") return ["ACCEPT", "REJECT", "CANCEL"];
  if (normalized === "ACCEPTED") return ["CONVERT", "CLOSE"];
  if (["REJECTED", "EXPIRED", "CONVERTED", "CANCELLED"].includes(normalized)) {
    return ["CLOSE"];
  }
  return [];
}

function actionLabel(action) {
  return {
    SEND: "Send",
    ACCEPT: "Accept",
    REJECT: "Reject",
    CANCEL: "Cancel",
    EXPIRE: "Expire",
    CLOSE: "Close",
    CONVERT: "Convert to order",
    CONFIRM: "Confirm order",
  }[action] || action;
}

function Composer({
  mode,
  customers,
  catalog,
  saving,
  onClose,
  onSave,
}) {
  const isQuotation = mode === "quotations";
  const [form, setForm] = useState(() => {
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + 30);
    return {
      party_id: "",
      valid_until: validUntil.toISOString().slice(0, 10),
      notes: "",
      terms: "",
      items: [emptyLine("service")],
    };
  });

  const subtotal = useMemo(
    () =>
      form.items.reduce(
        (sum, line) =>
          sum +
          Math.max(
            0,
            Number(line.quantity || 0) * Number(line.unit_price || 0) -
              Number(line.discount_amount || 0)
          ),
        0
      ),
    [form.items]
  );

  function updateLine(key, field, value) {
    setForm((current) => ({
      ...current,
      items: current.items.map((line) => {
        if (line.key !== key) return line;
        if (field === "item_type") {
          return {
            ...emptyLine(value),
            key,
          };
        }
        if (field === "item_id") {
          const item = catalog.find((candidate) => candidate.id === value);
          return {
            ...line,
            item_id: value,
            item_name: item?.name || "",
            unit_price: Number(item?.sale_price || 0),
          };
        }
        return { ...line, [field]: value };
      }),
    }));
  }

  function removeLine(key) {
    setForm((current) => ({
      ...current,
      items:
        current.items.length === 1
          ? current.items
          : current.items.filter((line) => line.key !== key),
    }));
  }

  const selectedCustomer = customers.find(
    (customer) => customer.party_id === form.party_id
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <form
        className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-white/10 bg-[#101722] shadow-2xl"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({
            ...form,
            customer_name: selectedCustomer?.customer_name || null,
            customer_email: selectedCustomer?.customer_email || null,
            customer_phone: selectedCustomer?.customer_phone || null,
            items: form.items.map(({ key, ...line }) => line),
          });
        }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[#101722]/95 px-6 py-5 backdrop-blur">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#D6A66A]">
              Commercial
            </p>
            <h2 className="mt-1 text-2xl font-semibold text-white">
              New {isQuotation ? "quotation" : "sales order"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/70 hover:bg-white/5"
          >
            Close
          </button>
        </div>

        <div className="space-y-6 p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm text-white/60">
              <span>Customer Party {isQuotation ? "*" : "(optional)"}</span>
              <select
                required={isQuotation}
                value={form.party_id}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    party_id: event.target.value,
                  }))
                }
                className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-[#D6A66A]"
              >
                <option value="">Walk-in / select customer</option>
                {customers.map((customer) => (
                  <option key={customer.party_id} value={customer.party_id}>
                    {customer.customer_name}
                    {customer.customer_number ? ` · ${customer.customer_number}` : ""}
                  </option>
                ))}
              </select>
            </label>

            {isQuotation ? (
              <label className="space-y-2 text-sm text-white/60">
                <span>Valid until</span>
                <input
                  type="date"
                  required
                  value={form.valid_until}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      valid_until: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-[#D6A66A]"
                />
              </label>
            ) : null}
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
              <div>
                <h3 className="font-semibold text-white">Lines</h3>
                <p className="text-xs text-white/45">
                  Inventory lines reserve stock; service lines do not.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      items: [...current.items, emptyLine("inventory_item")],
                    }))
                  }
                  className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white/70 hover:border-[#D6A66A]/50"
                >
                  + Catalog item
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      items: [...current.items, emptyLine("service")],
                    }))
                  }
                  className="rounded-lg border border-[#D6A66A]/30 bg-[#D6A66A]/10 px-3 py-2 text-xs text-[#F1D6A4]"
                >
                  + Service
                </button>
              </div>
            </div>

            <div className="divide-y divide-white/10">
              {form.items.map((line, index) => (
                <div key={line.key} className="grid gap-3 p-5 lg:grid-cols-12">
                  <div className="lg:col-span-2">
                    <label className="text-xs text-white/40">Type</label>
                    <select
                      value={line.item_type}
                      onChange={(event) =>
                        updateLine(line.key, "item_type", event.target.value)
                      }
                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                    >
                      <option value="service">Service</option>
                      <option value="inventory_item">Catalog item</option>
                    </select>
                  </div>

                  <div className="lg:col-span-4">
                    <label className="text-xs text-white/40">
                      {line.item_type === "inventory_item" ? "Catalog item" : "Service name"}
                    </label>
                    {line.item_type === "inventory_item" ? (
                      <select
                        required
                        value={line.item_id}
                        onChange={(event) =>
                          updateLine(line.key, "item_id", event.target.value)
                        }
                        className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                      >
                        <option value="">Select item</option>
                        {catalog.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}{item.code ? ` · ${item.code}` : ""}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        required
                        value={line.item_name}
                        onChange={(event) =>
                          updateLine(line.key, "item_name", event.target.value)
                        }
                        placeholder="Consulting, performance, maintenance…"
                        className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                      />
                    )}
                  </div>

                  <div className="lg:col-span-2">
                    <label className="text-xs text-white/40">Quantity</label>
                    <input
                      type="number"
                      min="0.0001"
                      step="0.0001"
                      required
                      value={line.quantity}
                      onChange={(event) =>
                        updateLine(line.key, "quantity", event.target.value)
                      }
                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                    />
                  </div>

                  <div className="lg:col-span-2">
                    <label className="text-xs text-white/40">Unit price</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      value={line.unit_price}
                      onChange={(event) =>
                        updateLine(line.key, "unit_price", event.target.value)
                      }
                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                    />
                  </div>

                  <div className="flex items-end gap-2 lg:col-span-2">
                    <div className="flex-1">
                      <label className="text-xs text-white/40">Discount</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.discount_amount}
                        onChange={(event) =>
                          updateLine(line.key, "discount_amount", event.target.value)
                        }
                        className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLine(line.key)}
                      className="rounded-lg border border-rose-400/20 px-3 py-2 text-sm text-rose-200/70"
                      aria-label={`Remove line ${index + 1}`}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm text-white/60">
              <span>Notes</span>
              <textarea
                rows={3}
                value={form.notes}
                onChange={(event) =>
                  setForm((current) => ({ ...current, notes: event.target.value }))
                }
                className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white"
              />
            </label>
            {isQuotation ? (
              <label className="space-y-2 text-sm text-white/60">
                <span>Commercial terms</span>
                <textarea
                  rows={3}
                  value={form.terms}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, terms: event.target.value }))
                  }
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white"
                />
              </label>
            ) : null}
          </div>
        </div>

        <div className="sticky bottom-0 flex items-center justify-between border-t border-white/10 bg-[#101722]/95 px-6 py-4 backdrop-blur">
          <div>
            <p className="text-xs uppercase tracking-wider text-white/40">Subtotal before tax</p>
            <p className="text-xl font-semibold text-white">{money(subtotal)}</p>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-[#D6A66A] px-5 py-3 text-sm font-semibold text-black disabled:opacity-50"
          >
            {saving ? "Saving…" : `Create ${isQuotation ? "quotation" : "draft order"}`}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function CommercialSalesRuntimeWorkCenter({
  capability,
  organizationId,
  entityId,
}) {
  const businessContext = useBusinessContext() || {};
  const resolvedOrganizationId =
    organizationId ||
    businessContext.organization_id ||
    businessContext.organization?.id ||
    null;
  const resolvedEntityId =
    entityId || businessContext.entity_id || businessContext.entity?.id || null;
  const mode = capability?.id === "quotes" ? "quotations" : "orders";
  const isQuotation = mode === "quotations";
  const endpoint = isQuotation
    ? "/api/commercial/sales/quotations"
    : "/api/commercial/sales/orders";
  const [rows, setRows] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!resolvedOrganizationId || !resolvedEntityId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      organizationId: resolvedOrganizationId,
      entityId: resolvedEntityId,
    });

    try {
      const [recordsResponse, customersResponse, catalogResponse] = await Promise.all([
        fetch(`${endpoint}?${params}`, { cache: "no-store" }),
        fetch(
          `/api/commercial/customers?organizationId=${encodeURIComponent(
            resolvedOrganizationId
          )}&limit=500`,
          { cache: "no-store" }
        ),
        fetch(
          `/api/commercial/catalog?organizationId=${encodeURIComponent(
            resolvedOrganizationId
          )}&limit=500`,
          { cache: "no-store" }
        ),
      ]);
      const [recordsData, customersData, catalogData] = await Promise.all([
        recordsResponse.json(),
        customersResponse.json(),
        catalogResponse.json(),
      ]);

      if (!recordsResponse.ok) throw new Error(recordsData.error || "Unable to load records");
      setRows(isQuotation ? recordsData.quotations || [] : recordsData.orders || []);
      setCustomers(customersData.customers || customersData.rows || []);
      setCatalog(catalogData.items || catalogData.rows || []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [endpoint, isQuotation, resolvedEntityId, resolvedOrganizationId]);

  useEffect(() => {
    load();
  }, [load]);

  async function createDocument(payload) {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          organization_id: resolvedOrganizationId,
          entity_id: resolvedEntityId,
          idempotency_key: `${isQuotation ? "quotation" : "sales-order"}-ui:${crypto.randomUUID()}`,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to create document");
      setComposerOpen(false);
      setMessage(isQuotation ? "Quotation created" : "Sales order draft created");
      await load();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  async function runAction(row, action) {
    const label = actionLabel(action);
    if (!window.confirm(`${label} ${row.document_number || row.quotation_number || row.order_number || "this document"}?`)) {
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const body = {
        organization_id: resolvedOrganizationId,
        entity_id: resolvedEntityId,
        action,
        idempotency_key: `${mode}-${action.toLowerCase()}:${row.id}:${crypto.randomUUID()}`,
      };
      if (isQuotation) body.quotation_id = row.id;
      else body.sales_order_id = row.id;

      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Unable to ${label.toLowerCase()}`);
      setMessage(`${label} completed`);
      await load();
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setSaving(false);
    }
  }

  const customerById = useMemo(
    () => new Map(customers.map((customer) => [customer.party_id, customer])),
    [customers]
  );
  const selected = rows.find((row) => row.id === selectedId) || null;

  if (!resolvedOrganizationId || !resolvedEntityId) {
    return (
      <div className="p-8">
        <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-5 text-amber-100">
          Select or configure an active legal entity before using Commercial sales.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full p-5 text-white md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#D6A66A]">
              Commercial · Sales
            </p>
            <h1 className="mt-2 text-3xl font-semibold">
              {isQuotation ? "Quotations" : "Sales Orders"}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-white/50">
              {isQuotation
                ? "Prepare, send, accept and convert customer quotations into controlled sales orders."
                : "Create and confirm inventory, service or mixed customer orders."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/workspace/${resolvedOrganizationId}/commercial/sales/${
                isQuotation ? "orders" : "quotes"
              }`}
              className="rounded-xl border border-white/10 px-4 py-3 text-sm text-white/70 hover:border-[#D6A66A]/40"
            >
              {isQuotation ? "Sales Orders" : "Quotations"}
            </Link>
            <button
              type="button"
              onClick={() => setComposerOpen(true)}
              className="rounded-xl bg-[#D6A66A] px-5 py-3 text-sm font-semibold text-black"
            >
              + {isQuotation ? "Quotation" : "Sales Order"}
            </button>
          </div>
        </div>

        {error ? (
          <div className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        ) : null}
        {message ? (
          <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
            {message}
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
            <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(110px,.7fr)_minmax(110px,.7fr)_minmax(130px,.8fr)] gap-3 border-b border-white/10 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-white/35">
              <span>Document / customer</span>
              <span>Status</span>
              <span>Date</span>
              <span className="text-right">Total</span>
            </div>

            {loading ? (
              <div className="p-10 text-center text-white/45">Loading Commercial records…</div>
            ) : rows.length === 0 ? (
              <div className="p-10 text-center">
                <p className="text-white/60">No {isQuotation ? "quotations" : "sales orders"} yet.</p>
                <button
                  type="button"
                  onClick={() => setComposerOpen(true)}
                  className="mt-4 text-sm text-[#D6A66A]"
                >
                  Create the first one
                </button>
              </div>
            ) : (
              <div className="divide-y divide-white/10">
                {rows.map((row) => {
                  const customer = customerById.get(row.party_id);
                  const selectedRow = selectedId === row.id;
                  return (
                    <button
                      type="button"
                      key={row.id}
                      onClick={() => setSelectedId(row.id)}
                      className={`grid w-full grid-cols-[minmax(0,1.5fr)_minmax(110px,.7fr)_minmax(110px,.7fr)_minmax(130px,.8fr)] gap-3 px-5 py-4 text-left transition ${
                        selectedRow ? "bg-[#D6A66A]/10" : "hover:bg-white/[0.03]"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-white">
                          {row.document_number || row.quotation_number || row.order_number || "Draft"}
                        </span>
                        <span className="mt-1 block truncate text-xs text-white/45">
                          {row.customer_name || customer?.customer_name || "Walk-in customer"}
                        </span>
                      </span>
                      <span>
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusStyle(row.status)}`}>
                          {row.status || "DRAFT"}
                        </span>
                      </span>
                      <span className="pt-1 text-sm text-white/55">{formatDate(row.created_at)}</span>
                      <span className="pt-1 text-right text-sm font-medium text-white">
                        {money(row.total_amount, row.currency_code)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <aside className="rounded-2xl border border-white/10 bg-black/20 p-5">
            {!selected ? (
              <div className="flex min-h-64 items-center justify-center text-center text-sm text-white/35">
                Select a document to review its lines and lifecycle actions.
              </div>
            ) : (
              <div className="space-y-5">
                <div>
                  <p className="text-xs uppercase tracking-wider text-white/35">Document</p>
                  <h2 className="mt-1 text-xl font-semibold">
                    {selected.document_number || selected.quotation_number || selected.order_number || "Draft"}
                  </h2>
                  <p className="mt-1 text-sm text-white/45">
                    {selected.customer_name || customerById.get(selected.party_id)?.customer_name || "Walk-in customer"}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                    <p className="text-xs text-white/35">Status</p>
                    <p className="mt-1 font-medium">{selected.status}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                    <p className="text-xs text-white/35">Total</p>
                    <p className="mt-1 font-medium">
                      {money(selected.total_amount, selected.currency_code)}
                    </p>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/35">
                    Lines
                  </p>
                  <div className="space-y-2">
                    {(selected.items || []).map((line) => (
                      <div key={line.id} className="rounded-xl border border-white/10 p-3">
                        <div className="flex justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{line.item_name}</p>
                            <p className="mt-1 text-xs text-white/35">
                              {line.item_type === "service" ? "Service" : "Inventory"} · {Number(line.quantity)} × {money(line.unit_price, selected.currency_code)}
                            </p>
                          </div>
                          <p className="text-sm font-medium">
                            {money(line.line_total, selected.currency_code)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {isQuotation && selected.valid_until ? (
                  <p className="text-xs text-white/45">
                    Valid until {formatDate(selected.valid_until)}
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-2 border-t border-white/10 pt-4">
                  {(isQuotation
                    ? allowedQuotationActions(selected.status)
                    : String(selected.status).toUpperCase() === "DRAFT"
                      ? ["CONFIRM"]
                      : []
                  ).map((action) => (
                    <button
                      type="button"
                      key={action}
                      disabled={saving}
                      onClick={() => runAction(selected, action)}
                      className={`rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50 ${
                        ["REJECT", "CANCEL"].includes(action)
                          ? "border border-rose-400/30 text-rose-200"
                          : "bg-[#D6A66A] text-black"
                      }`}
                    >
                      {actionLabel(action)}
                    </button>
                  ))}
                  {selected.sales_order_id ? (
                    <Link
                      href={`/workspace/${resolvedOrganizationId}/commercial/sales/orders`}
                      className="rounded-lg border border-emerald-400/30 px-3 py-2 text-xs font-semibold text-emerald-200"
                    >
                      Open converted order
                    </Link>
                  ) : null}
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>

      {composerOpen ? (
        <Composer
          mode={mode}
          customers={customers}
          catalog={catalog}
          saving={saving}
          onClose={() => setComposerOpen(false)}
          onSave={createDocument}
        />
      ) : null}
    </div>
  );
}
