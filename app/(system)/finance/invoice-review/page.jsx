"use client";

import { useEffect, useMemo, useState } from "react";

import {
  runtimeTheme as theme,
} from "@/lib/design/runtimeTheme";

import {
  useOrganizationRuntime,
} from "@/lib/hooks/useOrganizationRuntime";

const ACCOUNT_TYPES = [
  "COGS",
  "Operating Expense",
  "Owner / Non-Operating",
  "Asset",
];

const DEPARTMENTS = [
  "Kitchen",
  "Bar",
  "Breakfast",
  "Entertainment",
  "Operations",
  "Admin",
  "Utilities",
  "Staff Welfare",
  "Marketing",
  "Owner",
];

const NATURAL_ACCOUNTS = [
  "Food Main Kitchen",
  "Food Thai Kitchen",
  "Pizza Kitchen",
  "Alcohol",
  "Soft Drinks",
  "Breakfast Food",
  "Cleaning Supplies",
  "Maintenance",
  "Restaurant Supplies",
  "Kitchen Supplies",
  "Bar Supplies",
  "Accounting Fees",
  "Software",
  "Electricity",
  "Gas",
  "Ads",
  "Social Media",
  "Miscellaneous",
];

function money(value) {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];

  return items.map((item) => ({
    name_thai: item.name_thai || "",
    name_english: item.name_english || item.name || item.description || "",
    qty: Number(item.qty || item.quantity || 1),
    unit_price: Number(item.unit_price || 0),
    total_price: Number(item.total_price || item.line_total || item.amount || 0),

    suggested_department:
      item.suggested_department ||
      item.department ||
      "Operations",

    suggested_category:
      item.suggested_category ||
      item.natural_account ||
      "Miscellaneous",

    department:
      item.department ||
      item.suggested_department ||
      "Operations",

    account_type:
      item.account_type ||
      "Operating Expense",

    natural_account:
      item.natural_account ||
      item.suggested_category ||
      "Miscellaneous",
  }));
}

export default function InvoiceReviewPage() {
  const { organization } = useOrganizationRuntime();

  const [status, setStatus] = useState("pending_manager");
  const [invoices, setInvoices] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [edited, setEdited] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedInvoice =
    invoices.find((invoice) => invoice.id === selectedId) || invoices[0];

  const current =
    selectedInvoice ? edited[selectedInvoice.id] || {} : {};

  const items =
    current.items || [];

  const invoiceTotal =
    Number(current.total_amount || selectedInvoice?.total_amount || 0);

  const lineTotal =
    items.reduce(
      (sum, item) => sum + Number(item.total_price || 0),
      0
    );

  const difference =
    invoiceTotal - lineTotal;

  const grouped = useMemo(() => {
    return items.reduce((acc, item) => {
      const key = item.natural_account || "Uncoded";

      acc[key] =
        (acc[key] || 0) + Number(item.total_price || 0);

      return acc;
    }, {});
  }, [items]);

  async function loadInvoices() {
    if (!organization?.id) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch(
        `/api/invoices/list?organizationId=${organization.id}`
      );

      const json = await res.json();

      if (!json.success) {
        throw new Error(json.error || "Invoice load failed");
      }

      const rows =
        (json.data || []).filter((invoice) => {
          if (status === "all") return true;
          return invoice.status === status;
        });

      setInvoices(rows);

      if (!selectedId && rows[0]) {
        setSelectedId(rows[0].id);
      }

      const nextEdited = {};

      rows.forEach((invoice) => {
        nextEdited[invoice.id] = {
          vendor: invoice.vendor || "",
          date: invoice.date ? String(invoice.date).slice(0, 10) : "",
          total_amount: Number(invoice.total_amount || 0),
          items: normalizeItems(invoice.items),
        };
      });

      setEdited(nextEdited);
    } catch (err) {
      setError(err.message || "Invoice load failed");
      setInvoices([]);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadInvoices();
  }, [organization?.id, status]);

  function updateInvoice(field, value) {
    if (!selectedInvoice) return;

    setEdited((prev) => ({
      ...prev,
      [selectedInvoice.id]: {
        ...prev[selectedInvoice.id],
        [field]:
          field === "total_amount"
            ? Number(value || 0)
            : value,
      },
    }));
  }

  function updateItem(index, field, value) {
    if (!selectedInvoice) return;

    setEdited((prev) => {
      const currentInvoice =
        prev[selectedInvoice.id] || {};

      const nextItems =
        [...(currentInvoice.items || [])];

      nextItems[index] = {
        ...nextItems[index],
        [field]:
          ["qty", "unit_price", "total_price"].includes(field)
            ? Number(value || 0)
            : value,
      };

      return {
        ...prev,
        [selectedInvoice.id]: {
          ...currentInvoice,
          items: nextItems,
        },
      };
    });
  }

  async function saveCoding(nextStatus = null) {
    if (!selectedInvoice || !organization?.id) return;

    setSaving(true);
    setError("");

    try {
      const payload = {
        organizationId: organization.id,
        invoiceId: selectedInvoice.id,
        vendor: current.vendor,
        date: current.date,
        total_amount: current.total_amount,
        items: current.items,
      };

      const res = await fetch("/api/invoices/review/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!json.success) {
        throw new Error(json.error || "Save failed");
      }

      if (nextStatus) {
        await fetch("/api/approvals/process", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            entityType: "invoice",
            entityId: selectedInvoice.id,
            currentStatus: selectedInvoice.status,
            targetStatus: nextStatus,
            organizationId: organization.id,
          }),
        });
      }

      await loadInvoices();
    } catch (err) {
      setError(err.message || "Save failed");
    }

    setSaving(false);
  }

  return (
    <div className={theme.page}>
      <div className={theme.container}>
        <div className={`${theme.glassStrong} p-8 mb-8 relative overflow-hidden`}>
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-transparent to-cyan-500/10" />

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
            <div>
              <p className={theme.kicker}>
                Finance Runtime
              </p>

              <h1 className={theme.h1}>
                Invoice Coding Workspace
              </h1>

              <p className="text-white/50 mt-4 max-w-3xl">
                Managers suggest department and cost direction. Accounting codes every line correctly before posting.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className={theme.metricCard}>
                <p className={theme.metricLabel}>Invoices</p>
                <p className={theme.metricValue}>{invoices.length}</p>
              </div>

              <div className={theme.metricCard}>
                <p className={theme.metricLabel}>Value</p>
                <p className={theme.metricValue}>฿{money(
                  invoices.reduce((s, i) => s + Number(i.total_amount || 0), 0)
                )}</p>
              </div>

              <div className={theme.metricCard}>
                <p className={theme.metricLabel}>Variance</p>
                <p className={theme.metricValue}>฿{money(difference)}</p>
              </div>
            </div>
          </div>
        </div>

        {error ? (
          <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">
            {error}
          </div>
        ) : null}

        <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-6">
          <aside className={`${theme.glass} p-5 h-fit`}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-light">
                Invoice Queue
              </h2>

              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm"
              >
                <option value="pending_manager">Manager Review</option>
                <option value="approved_manager">Accounting Coding</option>
                <option value="posted">Posted</option>
                <option value="all">All</option>
              </select>
            </div>

            {loading ? (
              <p className="text-white/40">Loading invoices...</p>
            ) : null}

            <div className="space-y-3">
              {invoices.map((invoice) => (
                <button
                  key={invoice.id}
                  onClick={() => setSelectedId(invoice.id)}
                  className={`w-full text-left rounded-2xl border p-4 transition ${
                    selectedInvoice?.id === invoice.id
                      ? "border-cyan-400/40 bg-cyan-400/10 shadow-[0_0_35px_rgba(34,211,238,0.12)]"
                      : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">
                      {invoice.vendor || "Unknown Vendor"}
                    </p>

                    <span className="text-xs rounded-full border border-white/10 px-2 py-1 text-white/50">
                      {invoice.status}
                    </span>
                  </div>

                  <p className="text-white/40 text-sm mt-2">
                    {invoice.date ? String(invoice.date).slice(0, 10) : "No date"}
                  </p>

                  <p className="text-2xl font-light mt-3">
                    ฿{money(invoice.total_amount)}
                  </p>
                </button>
              ))}
            </div>
          </aside>

          <section className={`${theme.glass} p-6`}>
            {!selectedInvoice ? (
              <div className="text-white/40">
                No invoice selected.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 mb-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="text-xs text-white/40">
                        Vendor
                      </label>
                      <input
                        value={current.vendor || ""}
                        onChange={(e) => updateInvoice("vendor", e.target.value)}
                        className="mt-2 w-full rounded-2xl bg-black/40 border border-white/10 px-4 py-3"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-white/40">
                        Date
                      </label>
                      <input
                        type="date"
                        value={current.date || ""}
                        onChange={(e) => updateInvoice("date", e.target.value)}
                        className="mt-2 w-full rounded-2xl bg-black/40 border border-white/10 px-4 py-3"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-white/40">
                        Invoice Total
                      </label>
                      <input
                        type="number"
                        value={current.total_amount || 0}
                        onChange={(e) => updateInvoice("total_amount", e.target.value)}
                        className="mt-2 w-full rounded-2xl bg-black/40 border border-white/10 px-4 py-3"
                      />
                    </div>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-black/30 p-4">
                    <p className="text-white/40 text-sm mb-3">
                      Coding Summary
                    </p>

                    <div className="space-y-2">
                      {Object.entries(grouped).map(([account, value]) => (
                        <div
                          key={account}
                          className="flex justify-between text-sm"
                        >
                          <span className="text-white/60">{account}</span>
                          <span>฿{money(value)}</span>
                        </div>
                      ))}
                    </div>

                    <div className="border-t border-white/10 mt-4 pt-4 flex justify-between">
                      <span className="text-white/40">Line total</span>
                      <span>฿{money(lineTotal)}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  {items.map((item, index) => (
                    <div
                      key={index}
                      className="rounded-3xl border border-white/10 bg-white/[0.035] hover:bg-white/[0.06] transition p-4"
                    >
                      <div className="grid grid-cols-1 xl:grid-cols-[1.5fr_0.5fr_0.5fr_0.6fr_1fr_1fr_1.2fr] gap-3 items-end">
                        <div>
                          <p className="text-white font-medium">
                            {item.name_english || "Unnamed item"}
                          </p>
                          <p className="text-white/40 text-sm mt-1">
                            {item.name_thai || "No Thai name"}
                          </p>
                          <p className="text-cyan-200/70 text-xs mt-2">
                            Manager suggestion: {item.suggested_department} / {item.suggested_category}
                          </p>
                        </div>

                        <Field
                          label="Qty"
                          type="number"
                          value={item.qty}
                          onChange={(value) => updateItem(index, "qty", value)}
                        />

                        <Field
                          label="Unit"
                          type="number"
                          value={item.unit_price}
                          onChange={(value) => updateItem(index, "unit_price", value)}
                        />

                        <Field
                          label="Total"
                          type="number"
                          value={item.total_price}
                          onChange={(value) => updateItem(index, "total_price", value)}
                        />

                        <SelectField
                          label="Department"
                          value={item.department}
                          options={DEPARTMENTS}
                          onChange={(value) => updateItem(index, "department", value)}
                        />

                        <SelectField
                          label="Account Type"
                          value={item.account_type}
                          options={ACCOUNT_TYPES}
                          onChange={(value) => updateItem(index, "account_type", value)}
                        />

                        <SelectField
                          label="Natural Account"
                          value={item.natural_account}
                          options={NATURAL_ACCOUNTS}
                          onChange={(value) => updateItem(index, "natural_account", value)}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-3 justify-end mt-8">
                  <button
                    onClick={() => saveCoding()}
                    disabled={saving}
                    className="rounded-2xl border border-white/10 px-5 py-3 bg-white/[0.06] hover:bg-white/[0.1] disabled:opacity-40"
                  >
                    Save Coding
                  </button>

                  <button
                    onClick={() => saveCoding("approved_manager")}
                    disabled={saving}
                    className="rounded-2xl px-6 py-3 bg-cyan-300 text-black font-medium disabled:opacity-40"
                  >
                    Send To Accounting
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, type = "text", onChange }) {
  return (
    <div>
      <label className="text-xs text-white/35">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-2xl bg-black/40 border border-white/10 px-3 py-2"
      />
    </div>
  );
}

function SelectField({ label, value, options, onChange }) {
  return (
    <div>
      <label className="text-xs text-white/35">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-2xl bg-black/70 border border-white/10 px-3 py-2"
      >
        {options.map((option) => (
          <option
            key={option}
            value={option}
          >
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}
