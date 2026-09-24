"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const DEFAULT_API = "/api/finance/customer-payments/prepayments";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function money(value, currency) {
  return `${String(currency || "").toUpperCase()} ${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`.trim();
}

function createIdempotencyKey() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
}

export default function FinanceCustomerPrepaymentManagementEngine({
  action,
  organizationId,
  entityId,
  onClose,
  onComplete,
}) {
  const api = action?.api || action?.endpoint || DEFAULT_API;
  const [prepayments, setPrepayments] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [prepaymentId, setPrepaymentId] = useState("");
  const [operation, setOperation] = useState("apply");
  const [invoiceId, setInvoiceId] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(today());
  const [referenceNumber, setReferenceNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selectedPrepayment = useMemo(
    () => prepayments.find((row) => row.id === prepaymentId) || null,
    [prepayments, prepaymentId]
  );

  const eligibleInvoices = useMemo(() => {
    if (!selectedPrepayment) return [];
    const currency = String(selectedPrepayment.currency_code || "").toUpperCase();
    return invoices.filter((invoice) => {
      if (invoice.party_id !== selectedPrepayment.party_id) return false;
      const invoiceCurrency = String(invoice.currency_code || "").toUpperCase();
      return !currency || !invoiceCurrency || invoiceCurrency === currency;
    });
  }, [invoices, selectedPrepayment]);

  const eligibleBanks = useMemo(() => {
    if (!selectedPrepayment) return [];
    const currency = String(selectedPrepayment.currency_code || "").toUpperCase();
    return bankAccounts.filter((bank) => {
      const bankCurrency = String(bank.currency_code || bank.currency || "").toUpperCase();
      return !currency || !bankCurrency || bankCurrency === currency;
    });
  }, [bankAccounts, selectedPrepayment]);

  const selectedInvoice = useMemo(
    () => eligibleInvoices.find((invoice) => invoice.id === invoiceId) || null,
    [eligibleInvoices, invoiceId]
  );

  const load = useCallback(async () => {
    if (!organizationId || !entityId) {
      setLoading(false);
      setError("Select a Legal Entity before managing customer prepayments.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      const url = new URL(api, window.location.origin);
      url.searchParams.set("organizationId", organizationId);
      url.searchParams.set("entityId", entityId);

      const response = await fetch(url.toString(), { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.success === false) {
        throw new Error(json?.error || "Customer prepayments could not be loaded");
      }

      const nextPrepayments = Array.isArray(json.prepayments) ? json.prepayments : [];
      const nextInvoices = Array.isArray(json.invoices) ? json.invoices : [];
      const nextBanks = Array.isArray(json.bank_accounts) ? json.bank_accounts : [];
      setPrepayments(nextPrepayments);
      setInvoices(nextInvoices);
      setBankAccounts(nextBanks);
      setPrepaymentId((current) =>
        nextPrepayments.some((row) => row.id === current)
          ? current
          : nextPrepayments[0]?.id || ""
      );
    } catch (loadError) {
      setPrepayments([]);
      setInvoices([]);
      setBankAccounts([]);
      setPrepaymentId("");
      setError(loadError.message || "Customer prepayments could not be loaded");
    } finally {
      setLoading(false);
    }
  }, [api, entityId, organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setSuccess("");
    setError("");
    setInvoiceId(eligibleInvoices[0]?.id || "");
    setBankAccountId(
      eligibleBanks.find((bank) => bank.is_default)?.id || eligibleBanks[0]?.id || ""
    );
    if (selectedPrepayment) {
      const available = Number(selectedPrepayment.available_amount || 0);
      setAmount(available > 0 ? String(available) : "");
    } else {
      setAmount("");
    }
  }, [eligibleBanks, eligibleInvoices, operation, selectedPrepayment]);

  useEffect(() => {
    if (operation !== "apply" || !selectedPrepayment || !selectedInvoice) return;
    const maximum = Math.min(
      Number(selectedPrepayment.available_amount || 0),
      Number(selectedInvoice.outstanding_balance || 0)
    );
    if (maximum > 0) setAmount(String(maximum));
  }, [invoiceId, operation, selectedInvoice, selectedPrepayment]);

  async function submit() {
    try {
      if (!selectedPrepayment) throw new Error("Select an unapplied customer payment.");
      const numericAmount = Number(amount);
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        throw new Error("Enter an amount greater than zero.");
      }
      if (numericAmount > Number(selectedPrepayment.available_amount || 0)) {
        throw new Error("Amount exceeds the available prepayment balance.");
      }
      if (operation === "apply" && !invoiceId) {
        throw new Error("Select an open customer invoice.");
      }
      if (operation === "refund" && !bankAccountId) {
        throw new Error("Select a settlement bank account.");
      }

      setSaving(true);
      setError("");
      setSuccess("");
      const idempotencyKey = createIdempotencyKey();
      const payload = {
        organizationId,
        organization_id: organizationId,
        entityId,
        entity_id: entityId,
        operation,
        prepaymentId,
        prepayment_id: prepaymentId,
        amount: numericAmount,
        idempotencyKey,
        idempotency_key: idempotencyKey,
      };

      if (operation === "apply") {
        payload.customerInvoiceId = invoiceId;
        payload.customer_invoice_id = invoiceId;
        payload.applicationDate = effectiveDate;
        payload.application_date = effectiveDate;
      } else {
        payload.bankAccountId = bankAccountId;
        payload.bank_account_id = bankAccountId;
        payload.refundDate = effectiveDate;
        payload.refund_date = effectiveDate;
        payload.referenceNumber = referenceNumber || null;
        payload.reference_number = referenceNumber || null;
      }

      const response = await fetch(api, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(payload),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.success === false) {
        throw new Error(json?.error || "Customer prepayment operation failed");
      }

      setPrepayments(Array.isArray(json.prepayments) ? json.prepayments : []);
      setInvoices(Array.isArray(json.invoices) ? json.invoices : []);
      setBankAccounts(Array.isArray(json.bank_accounts) ? json.bank_accounts : []);
      setPrepaymentId(json.prepayments?.[0]?.id || "");
      setReferenceNumber("");
      setSuccess(
        operation === "apply"
          ? "Customer prepayment applied to the selected invoice."
          : "Customer prepayment refund posted successfully."
      );
      onComplete?.();
    } catch (submitError) {
      setError(submitError.message || "Customer prepayment operation failed");
    } finally {
      setSaving(false);
    }
  }

  const paymentLabel = (row) => {
    const payment = row.payment || {};
    return [
      payment.payment_number || payment.reference_number || "Customer prepayment",
      money(row.available_amount, row.currency_code),
    ].join(" · ");
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-[#191919]/20 px-5 backdrop-blur-xl">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[30px] border border-black/[0.08] bg-white p-7 shadow-2xl shadow-black/10">
        <div className="text-[11px] uppercase tracking-[0.30em] text-amber-300/65">
          Finance · Accounts Receivable
        </div>
        <h2 className="mt-3 text-3xl font-light tracking-[-0.04em] text-[#191919]">
          {action?.title || "Manage Customer Prepayments"}
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#746E66]">
          Apply unapplied customer cash to an open invoice or refund the available balance through a Finance-linked bank account.
        </p>

        {loading ? (
          <div className="mt-6 rounded-xl border border-black/[0.08] bg-[#FBF8F3] p-4 text-sm text-[#746E66]">
            Loading customer prepayments…
          </div>
        ) : null}

        {!loading && !prepayments.length ? (
          <div className="mt-6 rounded-xl border border-black/[0.08] bg-[#FBF8F3] p-4 text-sm text-[#746E66]">
            There is no unapplied customer cash available for this Legal Entity.
          </div>
        ) : null}

        {!loading && prepayments.length ? (
          <div className="mt-7 grid gap-5">
            <label className="block">
              <span className="text-xs text-[#746E66]">Unapplied Customer Payment</span>
              <select
                value={prepaymentId}
                onChange={(event) => setPrepaymentId(event.target.value)}
                disabled={saving}
                className="mt-2 w-full rounded-xl border border-black/[0.09] bg-white p-3 text-[#191919] outline-none focus:border-[#D6A66A]/70 disabled:opacity-50"
              >
                {prepayments.map((row) => (
                  <option key={row.id} value={row.id}>
                    {paymentLabel(row)}
                  </option>
                ))}
              </select>
            </label>

            {selectedPrepayment ? (
              <div className="grid gap-3 rounded-2xl border border-black/[0.08] bg-[#FBF8F3] p-4 text-sm sm:grid-cols-3">
                <div>
                  <div className="text-xs text-[#918B83]">Available</div>
                  <div className="mt-1 text-[#2F2C28]">{money(selectedPrepayment.available_amount, selectedPrepayment.currency_code)}</div>
                </div>
                <div>
                  <div className="text-xs text-[#918B83]">Original</div>
                  <div className="mt-1 text-[#5F5A54]">{money(selectedPrepayment.original_amount, selectedPrepayment.currency_code)}</div>
                </div>
                <div>
                  <div className="text-xs text-[#918B83]">Received</div>
                  <div className="mt-1 text-[#5F5A54]">{String(selectedPrepayment.received_at || "").slice(0, 10) || "-"}</div>
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setOperation("apply")}
                disabled={saving}
                className={`rounded-xl border px-4 py-3 text-sm ${
                  operation === "apply"
                    ? "border-amber-300/35 bg-amber-300/10 text-amber-100"
                    : "border-black/[0.08] bg-white text-[#746E66]"
                }`}
              >
                Apply to Invoice
              </button>
              <button
                type="button"
                onClick={() => setOperation("refund")}
                disabled={saving}
                className={`rounded-xl border px-4 py-3 text-sm ${
                  operation === "refund"
                    ? "border-amber-300/35 bg-amber-300/10 text-amber-100"
                    : "border-black/[0.08] bg-white text-[#746E66]"
                }`}
              >
                Refund Customer
              </button>
            </div>

            {operation === "apply" ? (
              <label className="block">
                <span className="text-xs text-[#746E66]">Open Customer Invoice</span>
                <select
                  value={invoiceId}
                  onChange={(event) => setInvoiceId(event.target.value)}
                  disabled={saving || !eligibleInvoices.length}
                  className="mt-2 w-full rounded-xl border border-black/[0.09] bg-white p-3 text-[#191919] outline-none focus:border-[#D6A66A]/70 disabled:opacity-50"
                >
                  <option value="">Select invoice</option>
                  {eligibleInvoices.map((invoice) => (
                    <option key={invoice.id} value={invoice.id}>
                      {[invoice.invoice_number || "Invoice", money(invoice.outstanding_balance, invoice.currency_code), invoice.due_date ? `Due ${invoice.due_date}` : null].filter(Boolean).join(" · ")}
                    </option>
                  ))}
                </select>
                {!eligibleInvoices.length ? (
                  <div className="mt-2 text-xs text-amber-200/70">No open invoice with a compatible customer and currency is available.</div>
                ) : null}
              </label>
            ) : (
              <>
                <label className="block">
                  <span className="text-xs text-[#746E66]">Settlement Bank Account</span>
                  <select
                    value={bankAccountId}
                    onChange={(event) => setBankAccountId(event.target.value)}
                    disabled={saving || !eligibleBanks.length}
                    className="mt-2 w-full rounded-xl border border-black/[0.09] bg-white p-3 text-[#191919] outline-none focus:border-[#D6A66A]/70 disabled:opacity-50"
                  >
                    <option value="">Select bank account</option>
                    {eligibleBanks.map((bank) => (
                      <option key={bank.id} value={bank.id}>
                        {[bank.bank_name, bank.account_name, bank.account_number, bank.currency_code || bank.currency].filter(Boolean).join(" · ")}
                      </option>
                    ))}
                  </select>
                  {!eligibleBanks.length ? (
                    <div className="mt-2 text-xs text-amber-200/70">No active Finance-linked bank account matches this prepayment currency.</div>
                  ) : null}
                </label>
                <label className="block">
                  <span className="text-xs text-[#746E66]">Refund Reference</span>
                  <input
                    value={referenceNumber}
                    onChange={(event) => setReferenceNumber(event.target.value)}
                    disabled={saving}
                    className="mt-2 w-full rounded-xl border border-black/[0.09] bg-white p-3 text-[#191919] outline-none focus:border-[#D6A66A]/70 disabled:opacity-50"
                    placeholder="Optional bank or customer reference"
                  />
                </label>
              </>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs text-[#746E66]">Amount</span>
                <input
                  type="number"
                  min="0.000001"
                  step="any"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  disabled={saving}
                  className="mt-2 w-full rounded-xl border border-black/[0.09] bg-white p-3 text-[#191919] outline-none focus:border-[#D6A66A]/70 disabled:opacity-50"
                />
              </label>
              <label className="block">
                <span className="text-xs text-[#746E66]">{operation === "apply" ? "Application Date" : "Refund Date"}</span>
                <input
                  type="date"
                  value={effectiveDate}
                  onChange={(event) => setEffectiveDate(event.target.value)}
                  disabled={saving}
                  className="mt-2 w-full rounded-xl border border-black/[0.09] bg-white p-3 text-[#191919] outline-none focus:border-[#D6A66A]/70 disabled:opacity-50"
                />
              </label>
            </div>
          </div>
        ) : null}

        {success ? (
          <div className="mt-5 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">
            {success}
          </div>
        ) : null}
        {error ? (
          <div className="mt-5 rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm leading-6 text-red-200">
            {error}
          </div>
        ) : null}

        <div className="mt-7 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-black/[0.08] bg-[#FBF8F3] px-5 py-3 text-sm text-[#746E66] disabled:opacity-50"
          >
            Close
          </button>
          <button
            onClick={submit}
            disabled={loading || saving || !selectedPrepayment || (operation === "apply" ? !invoiceId : !bankAccountId)}
            className="rounded-xl bg-white px-5 py-3 text-sm font-medium text-black disabled:opacity-40"
          >
            {saving ? "Posting…" : operation === "apply" ? "Apply Prepayment" : "Post Refund"}
          </button>
        </div>
      </div>
    </div>
  );
}
