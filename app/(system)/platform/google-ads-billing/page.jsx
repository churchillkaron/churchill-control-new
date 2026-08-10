"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

function text(value) {
  return String(value ?? "").trim();
}

export default function PlatformGoogleAdsBillingPage() {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/platform/integrations/google-ads/billing", {
        cache: "no-store",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) {
        throw new Error(body?.error || `Request failed (${response.status})`);
      }
      setState(body);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load Google Ads billing");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const selectedResource = text(state?.billing?.payments_account_resource_name);
  const accounts = useMemo(
    () => (Array.isArray(state?.payments_accounts) ? state.payments_accounts : []),
    [state]
  );

  async function selectAccount(resourceName) {
    if (!resourceName || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/platform/integrations/google-ads/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "select-payments-account",
          paymentsAccountResourceName: resourceName,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) {
        throw new Error(body?.error || `Request failed (${response.status})`);
      }
      setState(body);
    } catch (saveError) {
      setError(saveError?.message || "Unable to select Google Payments account");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="border-b border-white/10 pb-6">
        <Link href="/platform" className="text-sm text-emerald-300 hover:text-emerald-200">
          ← Platform Command
        </Link>
        <p className="mt-6 text-xs uppercase tracking-[0.32em] text-emerald-300">
          Platform Integration
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-white">
          Google Ads Supplier Billing
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
          Select the Google Payments account Avantiqo uses to pay Google for managed advertiser accounts.
          This does not change customer wallet or billing logic and does not create ad spend.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-6 text-sm text-white/55">
          Discovering Google Payments accounts…
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
              <div className="text-xs uppercase tracking-[0.2em] text-white/40">Manager</div>
              <div className="mt-2 text-lg font-medium text-white">
                {state?.manager?.name || "Not ready"}
              </div>
              <div className="mt-1 text-sm text-white/50">
                {state?.manager?.customer_id || "No customer ID"}
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
              <div className="text-xs uppercase tracking-[0.2em] text-white/40">Billing bridge</div>
              <div className="mt-2 text-lg font-medium text-white">
                {state?.ready ? "Configured" : "Setup required"}
              </div>
              <div className="mt-1 text-sm text-white/50">
                {state?.blocker || "Avantiqo Payments account selected"}
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
              <div className="text-xs uppercase tracking-[0.2em] text-white/40">Accounts found</div>
              <div className="mt-2 text-lg font-medium text-white">{accounts.length}</div>
              <div className="mt-1 text-sm text-white/50">Google monthly-invoicing accounts visible to the manager</div>
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.025] p-5">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-medium text-white">Eligible Google Payments accounts</h2>
                <p className="mt-1 text-sm text-white/50">
                  Choose the account that should fund Avantiqo-managed advertisers.
                </p>
              </div>
              <button
                type="button"
                onClick={load}
                disabled={loading || saving}
                className="rounded-md border border-white/15 px-3 py-2 text-sm text-white/70 hover:bg-white/5 disabled:opacity-40"
              >
                Refresh
              </button>
            </div>

            {accounts.length ? (
              <div className="space-y-3">
                {accounts.map((account) => {
                  const selected = account.resource_name === selectedResource;
                  return (
                    <div
                      key={account.resource_name || account.payments_account_id}
                      className="flex flex-col gap-4 rounded-lg border border-white/10 bg-black/20 p-4 md:flex-row md:items-center md:justify-between"
                    >
                      <div>
                        <div className="font-medium text-white">
                          {account.payments_account_name || "Google Payments account"}
                        </div>
                        <div className="mt-1 text-sm text-white/50">
                          Account {account.payments_account_id || "—"} · Profile {account.payments_profile_id || "—"}
                        </div>
                        <div className="mt-1 break-all text-xs text-white/35">
                          {account.resource_name || "No resource name"}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={selected || saving}
                        onClick={() => selectAccount(account.resource_name)}
                        className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm font-medium text-emerald-100 hover:bg-emerald-400/20 disabled:cursor-default disabled:opacity-50"
                      >
                        {selected ? "Selected" : saving ? "Saving…" : "Use for managed Ads"}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-lg border border-amber-400/20 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100">
                No eligible Google Payments account was returned. Avantiqo cannot attach managed advertiser billing until Google monthly invoicing is available to the manager account.
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
