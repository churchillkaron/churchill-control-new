"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export default function ShopifyFinanceSyncPanel({ organizationId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState("OBSERVE_ONLY");
  const [bankAccountId, setBankAccountId] = useState("");

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/administration/integrations/shopify/finance?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: "no-store" },
      );
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Unable to load Shopify Finance settings");
      setData(result);
      setMode(result.finance?.mode || "OBSERVE_ONLY");
      setBankAccountId(result.finance?.settlement_bank_account_id || "");
    } catch (loadError) {
      setError(loadError.message || "Unable to load Shopify Finance settings");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  const accounts = useMemo(() => data?.bank_accounts || [], [data]);
  const health = data?.finance?.health || {};
  const metrics = [
    ["Observed", health.observed || 0],
    ["Reconciled", health.reconciled || 0],
    ["Pending", health.pending || 0],
    ["Needs attention", health.blocked || health.failed || 0],
    ["Payments posted", health.posted_payments || 0],
    ["Refunds posted", health.posted_refunds || 0],
  ];

  async function save() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/administration/integrations/shopify/finance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          mode,
          settlement_bank_account_id: bankAccountId || null,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Unable to save Shopify Finance settings");
      setData(result);
      setMode(result.finance?.mode || "OBSERVE_ONLY");
      setBankAccountId(result.finance?.settlement_bank_account_id || "");
    } catch (saveError) {
      setError(saveError.message || "Unable to save Shopify Finance settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-6 pb-12">
      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-white shadow-2xl backdrop-blur-xl">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">Shopify → Finance</p>
            <h2 className="mt-2 text-2xl font-semibold">Settlement synchronization</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">
              Avantiqo observes Shopify payment, fulfillment, and refund lifecycle events by default. Finance posting activates only after the store is mapped to a legal entity and a real settlement bank account is selected.
            </p>
          </div>
          <div className="rounded-full border border-white/10 bg-black/30 px-4 py-2 text-xs font-semibold text-white/70">
            {data?.finance?.mode === "POST_TO_FINANCE" ? "Finance posting enabled" : "Observe only"}
          </div>
        </div>

        {loading ? <p className="mt-6 text-sm text-white/50">Loading Finance settings…</p> : null}
        {error ? <div className="mt-6 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}

        {!loading && !data?.store ? (
          <p className="mt-6 text-sm text-white/55">Connect Shopify before configuring settlement synchronization.</p>
        ) : null}

        {!loading && data?.store ? (
          <>
            <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              {metrics.map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                  <div className="text-2xl font-semibold text-white">{value}</div>
                  <div className="mt-1 text-xs text-white/45">{label}</div>
                </div>
              ))}
            </div>

            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-medium text-white/75">Finance mode</span>
                <select
                  value={mode}
                  onChange={(event) => setMode(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none"
                >
                  <option value="OBSERVE_ONLY">Observe only</option>
                  <option value="POST_TO_FINANCE">Post verified settlements to Finance</option>
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-white/75">Settlement bank account</span>
                <select
                  value={bankAccountId}
                  onChange={(event) => setBankAccountId(event.target.value)}
                  disabled={!data?.store?.entity_id}
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none disabled:opacity-40"
                >
                  <option value="">Not configured</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.account_name || account.bank_name || "Bank account"}
                      {account.currency_code || account.currency ? ` · ${account.currency_code || account.currency}` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <div className="md:col-span-2 flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-white/60 md:flex-row md:items-center md:justify-between">
                <div>
                  <div>Legal entity: {data.store.entity_id ? "Mapped" : "Mapping required"}</div>
                  <div>Settlement account: {data.finance?.settlement_bank_account ? "Mapped" : "Not mapped"}</div>
                  <div className="mt-1 text-xs text-white/40">
                    Avantiqo posts only successful, non-test Shopify SALE/CAPTURE transactions. Refund records remain observational until Shopify confirms a successful REFUND transaction.
                  </div>
                  <div className="mt-1 text-xs text-white/40">
                    Payments received before full fulfillment stay unposted until a customer invoice exists; Avantiqo does not invent a deposit account or recognize revenue early.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={save}
                  disabled={saving || !data.store.entity_id}
                  className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {saving ? "Saving…" : "Save Finance settings"}
                </button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
