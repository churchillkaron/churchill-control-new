"use client";

import { useEffect, useMemo, useState } from "react";

const DEFAULT_API = "/api/finance/accounting-settings/customer-deposit-liability";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function FinanceCustomerDepositLiabilityEngine({
  action,
  organizationId,
  entityId,
  onClose,
  onComplete,
}) {
  const api = action?.api || action?.endpoint || DEFAULT_API;
  const [effectiveDate, setEffectiveDate] = useState(today());
  const [liabilityAccountId, setLiabilityAccountId] = useState("");
  const [accounts, setAccounts] = useState([]);
  const [configuration, setConfiguration] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === liabilityAccountId) || null,
    [accounts, liabilityAccountId]
  );

  useEffect(() => {
    let active = true;

    async function load() {
      if (!organizationId || !entityId) {
        if (active) {
          setLoading(false);
          setError("Select a Legal Entity before configuring customer deposit accounting.");
        }
        return;
      }

      try {
        setLoading(true);
        setError("");
        setSaved(false);

        const url = new URL(api, window.location.origin);
        url.searchParams.set("organizationId", organizationId);
        url.searchParams.set("entityId", entityId);
        url.searchParams.set("effectiveDate", effectiveDate);

        const response = await fetch(url.toString(), { cache: "no-store" });
        const json = await response.json().catch(() => ({}));

        if (!response.ok || json?.success === false) {
          throw new Error(json?.error || "Customer deposit accounting setup could not be loaded");
        }

        if (!active) return;

        const nextAccounts = Array.isArray(json.liability_accounts)
          ? json.liability_accounts
          : [];
        setAccounts(nextAccounts);
        setConfiguration(json.configuration || null);
        setLiabilityAccountId(json.configuration?.liability_account_id || "");
      } catch (loadError) {
        if (active) {
          setAccounts([]);
          setConfiguration(null);
          setLiabilityAccountId("");
          setError(loadError.message || "Customer deposit accounting setup could not be loaded");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [api, organizationId, entityId, effectiveDate]);

  async function save() {
    try {
      if (!organizationId || !entityId) {
        throw new Error("Select a Legal Entity before configuring customer deposit accounting.");
      }
      if (!liabilityAccountId) {
        throw new Error("Select a Customer Deposit Liability Account.");
      }
      if (configuration?.base_accounting_ready === false) {
        throw new Error(
          configuration.base_accounting_error ||
          "Configure customer receipt accounting before customer deposit accounting."
        );
      }

      setSaving(true);
      setSaved(false);
      setError("");

      const response = await fetch(api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          organization_id: organizationId,
          entityId,
          entity_id: entityId,
          liabilityAccountId,
          liability_account_id: liabilityAccountId,
          effectiveDate,
          effective_date: effectiveDate,
        }),
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok || json?.success === false) {
        throw new Error(json?.error || "Customer deposit accounting setup could not be saved");
      }

      setConfiguration(json.configuration || null);
      setSaved(true);
      onComplete?.();
    } catch (saveError) {
      setError(saveError.message || "Customer deposit accounting setup could not be saved");
    } finally {
      setSaving(false);
    }
  }

  const baseReady = configuration?.base_accounting_ready !== false;
  const configured = configuration?.configured === true;

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/75 px-5 backdrop-blur-xl">
      <div className="w-full max-w-2xl rounded-[30px] border border-white/[0.08] bg-[#0b0b0b]/95 p-7 shadow-2xl shadow-black/80">
        <div className="text-[11px] uppercase tracking-[0.30em] text-amber-300/65">
          Finance · Accounting Setup
        </div>
        <h2 className="mt-3 text-3xl font-light tracking-[-0.04em] text-white">
          {action?.title || "Customer Deposit Accounting"}
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-6 text-white/45">
          Choose the liability account used for customer deposits and unapplied cash. Avantiqo derives the bank and Accounts Receivable sides from this Legal Entity's existing customer accounting configuration.
        </p>

        <div className="mt-7 grid gap-5">
          <label className="block">
            <span className="text-xs text-white/45">Effective From</span>
            <input
              type="date"
              value={effectiveDate}
              onChange={(event) => setEffectiveDate(event.target.value)}
              disabled={loading || saving}
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 p-3 text-white outline-none focus:border-amber-300/35 disabled:opacity-50"
            />
          </label>

          <label className="block">
            <span className="text-xs text-white/45">Customer Deposit Liability Account</span>
            <select
              value={liabilityAccountId}
              onChange={(event) => setLiabilityAccountId(event.target.value)}
              disabled={loading || saving || !baseReady}
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 p-3 text-white outline-none focus:border-amber-300/35 disabled:opacity-50"
            >
              <option value="">Select liability account</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {[account.code, account.name].filter(Boolean).join(" · ")}
                </option>
              ))}
            </select>
          </label>
        </div>

        {loading ? (
          <div className="mt-5 rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 text-sm text-white/50">
            Loading accounting configuration…
          </div>
        ) : null}

        {!loading && configuration?.base_accounting_ready === false ? (
          <div className="mt-5 rounded-xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">
            {configuration.base_accounting_error}
          </div>
        ) : null}

        {!loading && configured ? (
          <div className="mt-5 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">
            Customer deposit accounting is configured for this effective date.
          </div>
        ) : null}

        {saved ? (
          <div className="mt-5 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">
            Saved. All customer-deposit posting rules now use {selectedAccount?.name || "the selected liability account"}.
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
            className="rounded-xl border border-white/[0.08] bg-white/[0.035] px-5 py-3 text-sm text-white/60 disabled:opacity-50"
          >
            Close
          </button>
          <button
            onClick={save}
            disabled={loading || saving || !baseReady || !liabilityAccountId}
            className="rounded-xl bg-white px-5 py-3 text-sm font-medium text-black disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save Deposit Accounting"}
          </button>
        </div>
      </div>
    </div>
  );
}
