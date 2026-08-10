"use client";

import { useEffect, useMemo, useState } from "react";

function money(value, currency = "") {
  const amount = Number(value || 0);
  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(amount)}${currency ? ` ${currency}` : ""}`;
}

function dateTime(value) {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function initials(name) {
  return String(name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function text(value) {
  return value === null || value === undefined || value === ""
    ? "-"
    : String(value);
}

function statusClass(status) {
  const normalized = String(status || "").toUpperCase();
  if (["ACTIVE", "PAID", "FULFILLED", "ACCEPTED", "POSTED", "AWARDED"].includes(normalized)) {
    return "text-emerald-300";
  }
  if (["OVERDUE", "FAILED", "CANCELLED", "REJECTED", "POSTING_FAILED"].includes(normalized)) {
    return "text-red-300";
  }
  return "text-amber-200";
}

function Section({ title, children }) {
  return (
    <section className="rounded-[24px] border border-white/[0.08] bg-black/25 p-4">
      <div className="text-[11px] uppercase tracking-[0.22em] text-white/34">
        {title}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.16em] text-white/28">
        {label}
      </div>
      <div className="mt-1 break-words text-[12px] text-white/75">{text(value)}</div>
    </div>
  );
}

function Empty({ children = "No records." }) {
  return <div className="text-[12px] text-white/34">{children}</div>;
}

function CompactRows({ rows, render }) {
  if (!rows?.length) return <Empty />;
  return <div className="space-y-2">{rows.map(render)}</div>;
}

function CustomerEditor({ open, customer, organizationId, onClose, onSaved }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({});

  useEffect(() => {
    if (!open) return;
    setError("");
    setForm({
      party_id: customer?.party_id || null,
      customer_name: customer?.customer_name || "",
      customer_type: customer?.customer_type || "PERSON",
      customer_email: customer?.customer_email || "",
      customer_phone: customer?.customer_phone || "",
      legal_name: customer?.legal_name || "",
      tax_id: customer?.tax_id || "",
      billing_address: customer?.billing_address || "",
      shipping_address: customer?.shipping_address || "",
      city: customer?.city || "",
      state: customer?.state || "",
      postal_code: customer?.postal_code || "",
      country: customer?.country || "",
      credit_limit: customer?.credit_limit ?? 0,
      payment_terms: customer?.payment_terms || "",
      preferred_language: customer?.preferred_language || "",
      preferred_currency: customer?.preferred_currency || "",
      notes: customer?.notes || "",
      marketing_opt_in: Boolean(customer?.marketing_opt_in),
    });
  }, [open, customer?.party_id]);

  if (!open) return null;

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    try {
      setSaving(true);
      setError("");
      const response = await fetch("/api/commercial/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          organization_id: organizationId,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.success === false) {
        throw new Error(result?.error || "Unable to save customer");
      }
      onSaved?.(result.customer || null);
      onClose?.();
    } catch (saveError) {
      setError(saveError?.message || "Unable to save customer");
    } finally {
      setSaving(false);
    }
  }

  const inputs = [
    ["customer_name", "Customer name"],
    ["customer_email", "Email"],
    ["customer_phone", "Phone"],
    ["legal_name", "Legal name"],
    ["tax_id", "Tax ID"],
    ["billing_address", "Billing address"],
    ["shipping_address", "Shipping address"],
    ["city", "City"],
    ["state", "State / Province"],
    ["postal_code", "Postal code"],
    ["country", "Country"],
    ["payment_terms", "Payment terms"],
    ["preferred_currency", "Preferred currency"],
    ["preferred_language", "Preferred language"],
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-xl">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[30px] border border-white/[0.1] bg-[#0b0b0b] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.28em] text-amber-300/60">
              Commercial · Customer
            </div>
            <h2 className="mt-3 text-[30px] font-light tracking-[-0.05em]">
              {customer ? "Edit Customer" : "New Customer"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-white/[0.08] px-3 py-2 text-[12px] text-white/50"
          >
            Close
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="text-[11px] text-white/48">
            Customer type
            <select
              value={form.customer_type || "PERSON"}
              onChange={(event) => update("customer_type", event.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-white/[0.08] bg-black/40 px-3 text-[13px] text-white outline-none"
            >
              <option value="PERSON">Person</option>
              <option value="COMPANY">Company</option>
            </select>
          </label>

          <label className="text-[11px] text-white/48">
            Credit limit
            <input
              type="number"
              value={form.credit_limit ?? 0}
              onChange={(event) => update("credit_limit", event.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-white/[0.08] bg-black/40 px-3 text-[13px] text-white outline-none"
            />
          </label>

          {inputs.map(([key, label]) => (
            <label key={key} className="text-[11px] text-white/48">
              {label}
              <input
                value={form[key] || ""}
                onChange={(event) => update(key, event.target.value)}
                className="mt-2 h-11 w-full rounded-xl border border-white/[0.08] bg-black/40 px-3 text-[13px] text-white outline-none"
              />
            </label>
          ))}

          <label className="md:col-span-2 text-[11px] text-white/48">
            Notes
            <textarea
              rows={4}
              value={form.notes || ""}
              onChange={(event) => update("notes", event.target.value)}
              className="mt-2 w-full rounded-xl border border-white/[0.08] bg-black/40 p-3 text-[13px] text-white outline-none"
            />
          </label>

          <label className="md:col-span-2 flex items-center gap-3 text-[12px] text-white/60">
            <input
              type="checkbox"
              checked={Boolean(form.marketing_opt_in)}
              onChange={(event) => update("marketing_opt_in", event.target.checked)}
            />
            Marketing opt-in
          </label>
        </div>

        {error ? <div className="mt-4 text-[12px] text-red-300">{error}</div> : null}

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="h-10 rounded-xl border border-white/[0.08] px-4 text-[12px] text-white/55"
          >
            Cancel
          </button>
          <button
            disabled={saving || !String(form.customer_name || "").trim()}
            onClick={save}
            className="h-10 rounded-xl border border-amber-300/35 bg-gradient-to-b from-amber-200 to-amber-500 px-5 text-[12px] font-semibold text-black disabled:opacity-40"
          >
            {saving ? "Saving..." : "Save Customer"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CustomerRuntimeWorkCenter(props) {
  const context = props.context || {};
  const organizationId =
    props.organizationId ||
    context.organization_id ||
    context.organizationId ||
    null;
  const entityId =
    props.entityId ||
    context.entity_id ||
    context.entityId ||
    null;

  const [rows, setRows] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadCustomers() {
      if (!organizationId) return;
      try {
        setLoading(true);
        setError("");
        const url = new URL("/api/commercial/customers", window.location.origin);
        url.searchParams.set("organizationId", organizationId);
        url.searchParams.set("limit", "500");
        const response = await fetch(url, { cache: "no-store" });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result?.success === false) {
          throw new Error(result?.error || "Unable to load customers");
        }
        if (!active) return;
        const loaded = result.rows || result.customers || [];
        setRows(loaded);
        setSelectedId((current) =>
          current && loaded.some((row) => row.id === current)
            ? current
            : loaded[0]?.id || null
        );
      } catch (loadError) {
        if (active) setError(loadError?.message || "Unable to load customers");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadCustomers();
    return () => {
      active = false;
    };
  }, [organizationId, refreshKey]);

  const filteredRows = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) =>
      [
        row.customer_name,
        row.customer_number,
        row.customer_email,
        row.customer_phone,
        row.tax_id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [rows, query]);

  const selected =
    rows.find((row) => row.id === selectedId) ||
    filteredRows[0] ||
    null;

  useEffect(() => {
    let active = true;

    async function loadDetail() {
      if (!selected?.party_id || !organizationId || !entityId) {
        setDetail(selected || null);
        return;
      }

      try {
        setDetailLoading(true);
        const url = new URL(
          `/api/commercial/customers/${selected.party_id}/detail`,
          window.location.origin
        );
        url.searchParams.set("organizationId", organizationId);
        url.searchParams.set("entityId", entityId);
        const response = await fetch(url, { cache: "no-store" });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result?.success === false) {
          throw new Error(result?.error || "Unable to load customer detail");
        }
        if (active) setDetail(result.row || result.customer || selected);
      } catch (detailError) {
        if (active) {
          setDetail({
            ...selected,
            detail_error: detailError?.message || "Unable to load customer detail",
          });
        }
      } finally {
        if (active) setDetailLoading(false);
      }
    }

    loadDetail();
    return () => {
      active = false;
    };
  }, [selected?.party_id, organizationId, entityId, refreshKey]);

  const balances = detail?.finance?.balances || [];
  const primaryBalance = balances[0] || null;
  const loyalty = detail?.loyalty || {};
  const salesOrders = detail?.commercial?.sales_orders || [];
  const quotations = detail?.commercial?.quotations || [];
  const payments = detail?.finance?.payments || [];
  const credits = detail?.finance?.credits || [];
  const statements = detail?.finance?.statements || [];
  const collectionCases = detail?.finance?.collection_cases || [];
  const collectionActivities = detail?.finance?.collection_activities || [];
  const ledger = loyalty.ledger || [];
  const redemptions = loyalty.redemptions || [];
  const timeline = detail?.timeline || [];

  const totalReceivable = balances.reduce(
    (sum, row) => sum + Number(row.receivable_outstanding || 0),
    0
  );
  const totalOverdue = balances.reduce(
    (sum, row) => sum + Number(row.overdue || 0),
    0
  );

  function openNew() {
    setEditingCustomer(null);
    setEditorOpen(true);
  }

  function openEdit() {
    if (!selected) return;
    setEditingCustomer(selected);
    setEditorOpen(true);
  }

  function saved(customer) {
    if (customer?.party_id) setSelectedId(customer.party_id);
    setRefreshKey((value) => value + 1);
  }

  return (
    <main className="min-h-screen bg-[#050505] px-5 py-6 text-white lg:px-7">
      <div className="mx-auto max-w-[1700px]">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.34em] text-amber-300/65">
              Commercial · Customer Management
            </div>
            <h1 className="mt-3 text-[44px] font-light tracking-[-0.06em]">Customers</h1>
            <p className="mt-2 max-w-3xl text-[13px] leading-6 text-white/42">
              One Party-centric customer record across Commercial, Loyalty and Finance.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={openEdit}
              disabled={!selected}
              className="h-10 rounded-xl border border-white/[0.08] bg-white/[0.035] px-4 text-[12px] text-white/60 disabled:opacity-35"
            >
              Edit Customer
            </button>
            <button
              onClick={openNew}
              className="h-10 rounded-xl border border-amber-300/35 bg-gradient-to-b from-amber-200 to-amber-500 px-4 text-[12px] font-semibold text-black"
            >
              + New Customer
            </button>
          </div>
        </header>

        <section className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-4">
          {[
            ["Customers", rows.length, "Active Party relationships"],
            ["Receivable", money(totalReceivable), "Selected customer"],
            ["Overdue", money(totalOverdue), "Selected customer"],
            ["Loyalty Points", Number(loyalty.account?.loyalty_points || detail?.loyalty_points || 0), loyalty.tier?.name || loyalty.account?.tier || "No tier"],
          ].map(([label, value, hint]) => (
            <div
              key={label}
              className="rounded-[26px] border border-white/[0.08] bg-gradient-to-b from-white/[0.045] to-white/[0.018] p-5 shadow-2xl shadow-black/60"
            >
              <div className="text-[10px] uppercase tracking-[0.22em] text-white/32">{label}</div>
              <div className="mt-3 text-[30px] font-light tracking-[-0.05em]">{value}</div>
              <div className="mt-2 text-[11px] text-white/32">{hint}</div>
            </div>
          ))}
        </section>

        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[520px_1fr]">
          <section className="overflow-hidden rounded-[30px] border border-white/[0.08] bg-white/[0.025] shadow-2xl shadow-black/70">
            <div className="border-b border-white/[0.07] p-4">
              <div className="flex items-center rounded-2xl border border-white/[0.07] bg-black/30 px-4">
                <span className="text-white/28">⌕</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search customers..."
                  className="h-11 flex-1 bg-transparent px-3 text-[13px] outline-none placeholder:text-white/25"
                />
              </div>
            </div>

            {loading ? (
              <div className="p-8 text-[13px] text-white/40">Loading customers...</div>
            ) : error ? (
              <div className="p-8 text-[13px] text-red-300">{error}</div>
            ) : filteredRows.length === 0 ? (
              <div className="p-8 text-[13px] text-white/40">No customers found.</div>
            ) : (
              <div className="max-h-[calc(100vh-320px)] overflow-y-auto divide-y divide-white/[0.055]">
                {filteredRows.map((row) => {
                  const active = row.id === selected?.id;
                  return (
                    <button
                      key={row.id}
                      onClick={() => setSelectedId(row.id)}
                      className={`flex w-full items-center gap-4 px-5 py-4 text-left transition ${
                        active
                          ? "bg-amber-300/[0.075] shadow-[inset_3px_0_0_rgba(245,158,11,0.65)]"
                          : "hover:bg-white/[0.035]"
                      }`}
                    >
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-amber-300/20 bg-amber-300/[0.08] text-[12px] text-amber-100">
                        {initials(row.customer_name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-medium">{row.customer_name || "Unnamed Customer"}</div>
                        <div className="mt-1 truncate text-[11px] text-white/36">
                          {[row.customer_number, row.customer_email, row.customer_phone].filter(Boolean).join(" · ") || "Party customer"}
                        </div>
                      </div>
                      <div className={`text-[10px] uppercase ${statusClass(row.status)}`}>{row.status || "ACTIVE"}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="min-w-0 rounded-[30px] border border-white/[0.08] bg-gradient-to-b from-white/[0.04] to-white/[0.015] p-5 shadow-2xl shadow-black/70">
            {!selected ? (
              <div className="text-[13px] text-white/40">Select a customer.</div>
            ) : (
              <>
                <div className="flex flex-col gap-4 border-b border-white/[0.07] pb-5 md:flex-row md:items-start md:justify-between">
                  <div className="flex items-start gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-amber-300/20 bg-amber-300/[0.08] text-[14px] text-amber-100">
                      {initials(selected.customer_name)}
                    </div>
                    <div>
                      <h2 className="text-[28px] font-light tracking-[-0.05em]">{selected.customer_name}</h2>
                      <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-white/38">
                        <span>Party {selected.party_id}</span>
                        <span className={statusClass(selected.status)}>{selected.status || "ACTIVE"}</span>
                        {entityId ? <span>Entity scoped finance</span> : <span className="text-amber-200">Select an entity for Finance</span>}
                      </div>
                    </div>
                  </div>
                  {detailLoading ? <div className="text-[11px] text-white/34">Refreshing detail...</div> : null}
                </div>

                {detail?.detail_error ? (
                  <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/[0.05] p-3 text-[12px] text-amber-100">
                    Commercial profile loaded. Finance detail unavailable: {detail.detail_error}
                  </div>
                ) : null}

                <div className="mt-5 grid grid-cols-1 gap-4 2xl:grid-cols-2">
                  <Section title="Customer Profile">
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="Customer #" value={detail?.customer_number} />
                      <Field label="Type" value={detail?.customer_type} />
                      <Field label="Email" value={detail?.customer_email || detail?.email} />
                      <Field label="Phone" value={detail?.customer_phone || detail?.phone} />
                      <Field label="Tax ID" value={detail?.tax_id} />
                      <Field label="Payment terms" value={detail?.payment_terms} />
                      <Field label="Credit limit" value={money(detail?.credit_limit)} />
                      <Field label="Currency" value={detail?.preferred_currency} />
                      <Field label="Billing" value={detail?.billing_address} />
                      <Field label="Shipping" value={detail?.shipping_address} />
                    </div>
                  </Section>

                  <Section title="Finance Position">
                    <CompactRows
                      rows={balances}
                      render={(row) => (
                        <div key={row.currency_code} className="rounded-xl border border-white/[0.07] bg-black/25 p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[12px] font-medium">{row.currency_code}</span>
                            <span className={Number(row.net_customer_position || 0) > 0 ? "text-red-200" : "text-emerald-200"}>
                              {money(row.net_customer_position, row.currency_code)}
                            </span>
                          </div>
                          <div className="mt-3 grid grid-cols-3 gap-3 text-[11px]">
                            <Field label="Receivable" value={money(row.receivable_outstanding)} />
                            <Field label="Overdue" value={money(row.overdue)} />
                            <Field label="Credit" value={money(row.available_credit)} />
                            <Field label="Unapplied cash" value={money(row.unapplied_cash)} />
                            <Field label="Current" value={money(row.aging?.current)} />
                            <Field label="1–30" value={money(row.aging?.["1_30"])} />
                            <Field label="31–60" value={money(row.aging?.["31_60"])} />
                            <Field label="61–90" value={money(row.aging?.["61_90"])} />
                            <Field label="91+" value={money(row.aging?.["91_plus"])} />
                          </div>
                        </div>
                      )}
                    />
                  </Section>

                  <Section title="Loyalty">
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="Program" value={loyalty.program?.name} />
                      <Field label="Tier" value={loyalty.tier?.name || loyalty.account?.tier} />
                      <Field label="Points" value={loyalty.account?.loyalty_points ?? detail?.loyalty_points} />
                      <Field label="Visits" value={loyalty.account?.visit_count ?? detail?.visit_count} />
                      <Field label="Total spent" value={money(loyalty.account?.total_spent ?? detail?.total_spent)} />
                      <Field label="Last visit" value={dateTime(loyalty.account?.last_visit_at)} />
                    </div>
                    <div className="mt-4 border-t border-white/[0.06] pt-3">
                      <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-white/28">Recent points activity</div>
                      <CompactRows
                        rows={ledger.slice(0, 5)}
                        render={(row) => (
                          <div key={row.id} className="flex items-center justify-between gap-3 text-[11px]">
                            <span>{row.entry_type} · {dateTime(row.created_at)}</span>
                            <span className={Number(row.points_delta) >= 0 ? "text-emerald-200" : "text-amber-200"}>
                              {Number(row.points_delta) >= 0 ? "+" : ""}{row.points_delta} pts
                            </span>
                          </div>
                        )}
                      />
                    </div>
                  </Section>

                  <Section title="Sales Orders">
                    <CompactRows
                      rows={salesOrders.slice(0, 8)}
                      render={(row) => (
                        <div key={row.id} className="rounded-xl border border-white/[0.07] p-3 text-[11px]">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-medium">{row.order_number}</span>
                            <span className={statusClass(row.status)}>{row.status}</span>
                          </div>
                          <div className="mt-2 flex flex-wrap justify-between gap-2 text-white/45">
                            <span>{row.fulfillment_status || "No fulfilment status"} · {row.payment_status || "No payment status"}</span>
                            <span>{money(row.total_amount, row.currency_code)}</span>
                          </div>
                        </div>
                      )}
                    />
                  </Section>

                  <Section title="Quotations">
                    <CompactRows
                      rows={quotations.slice(0, 8)}
                      render={(row) => (
                        <div key={row.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] p-3 text-[11px]">
                          <div>
                            <div className="font-medium">{row.quotation_number}</div>
                            <div className="mt-1 text-white/35">Valid until {row.valid_until || "-"}</div>
                          </div>
                          <div className="text-right">
                            <div className={statusClass(row.status)}>{row.status}</div>
                            <div className="mt-1 text-white/55">{money(row.total_amount, row.currency_code)}</div>
                          </div>
                        </div>
                      )}
                    />
                  </Section>

                  <Section title="Payments & Credits">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-white/28">Payments</div>
                    <div className="mt-2">
                      <CompactRows
                        rows={payments.slice(0, 6)}
                        render={(row) => (
                          <div key={row.id} className="flex items-center justify-between gap-3 py-1 text-[11px]">
                            <span>{row.payment_number || row.reference_number || row.id}</span>
                            <span>{money(row.amount, row.currency_code)} · <span className={statusClass(row.status)}>{row.status}</span></span>
                          </div>
                        )}
                      />
                    </div>
                    <div className="mt-4 text-[10px] uppercase tracking-[0.16em] text-white/28">Available credits</div>
                    <div className="mt-2">
                      <CompactRows
                        rows={credits.slice(0, 6)}
                        render={(row) => (
                          <div key={row.id} className="flex items-center justify-between gap-3 py-1 text-[11px]">
                            <span>{row.status}</span>
                            <span>{money(row.available_amount, row.currency_code)} available</span>
                          </div>
                        )}
                      />
                    </div>
                  </Section>

                  <Section title="Collections & Statements">
                    <div className="grid grid-cols-3 gap-3">
                      <Field label="Open cases" value={collectionCases.filter((row) => !["CLOSED", "RESOLVED"].includes(String(row.status || "").toUpperCase())).length} />
                      <Field label="Activities" value={collectionActivities.length} />
                      <Field label="Statements" value={statements.length} />
                    </div>
                    <div className="mt-4">
                      <CompactRows
                        rows={collectionCases.slice(0, 5)}
                        render={(row) => (
                          <div key={row.id} className="flex items-center justify-between gap-3 py-1 text-[11px]">
                            <span>{row.case_number || row.id}</span>
                            <span className={statusClass(row.status)}>{row.status}</span>
                          </div>
                        )}
                      />
                    </div>
                  </Section>

                  <Section title="Loyalty Redemptions">
                    <CompactRows
                      rows={redemptions.slice(0, 8)}
                      render={(row) => (
                        <div key={row.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] p-3 text-[11px]">
                          <div>
                            <div>{row.reward_name || row.reward_code || "Reward"}</div>
                            <div className="mt-1 text-white/35">{dateTime(row.redeemed_at)}</div>
                          </div>
                          <div className="text-right">
                            <div>{row.points_spent} pts</div>
                            <div className={`mt-1 ${statusClass(row.status)}`}>{row.status}</div>
                          </div>
                        </div>
                      )}
                    />
                  </Section>

                  <Section title="Customer Timeline">
                    <CompactRows
                      rows={timeline.slice(0, 15)}
                      render={(row) => (
                        <div key={row.id} className="grid grid-cols-[100px_1fr_auto] gap-3 border-b border-white/[0.055] py-2 text-[11px] last:border-0">
                          <div className="text-white/32">{row.domain}</div>
                          <div>
                            <div>{row.type}</div>
                            <div className="mt-1 text-white/32">{row.reference || dateTime(row.event_at)}</div>
                          </div>
                          <div className="text-right">
                            {row.points_delta !== undefined ? <div>{row.points_delta} pts</div> : null}
                            {row.amount !== null && row.amount !== undefined ? <div>{money(row.amount, row.currency_code)}</div> : null}
                            {row.status ? <div className={`mt-1 ${statusClass(row.status)}`}>{row.status}</div> : null}
                          </div>
                        </div>
                      )}
                    />
                  </Section>
                </div>
              </>
            )}
          </section>
        </div>
      </div>

      <CustomerEditor
        open={editorOpen}
        customer={editingCustomer}
        organizationId={organizationId}
        onClose={() => setEditorOpen(false)}
        onSaved={saved}
      />
    </main>
  );
}
