"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

function text(value) {
  return String(value ?? "").trim();
}

function badgeClass(ok) {
  return ok
    ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
    : "border-amber-400/20 bg-amber-400/10 text-amber-100";
}

export default function ProviderBillingPage() {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/administration/integrations/provider-billing", {
        cache: "no-store",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) {
        throw new Error(body?.error || `Request failed (${response.status})`);
      }
      setState(body);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load provider billing");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const providers = useMemo(() => {
    const rows = Array.isArray(state?.providers) ? state.providers : [];
    const normalized = query.trim().toLowerCase();
    if (!normalized) return rows;
    return rows.filter((provider) =>
      [
        provider.name,
        provider.id,
        provider.category,
        provider.adapter?.billing_mode,
        provider.adapter?.supplier_cost_source,
        ...(provider.capabilities || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [state, query]);

  const google = state?.supplier_accounts?.google_ads || null;
  const selectedGoogleResource = text(google?.billing?.payments_account_resource_name);
  const googleAccounts = Array.isArray(google?.payments_accounts)
    ? google.payments_accounts
    : [];

  async function selectGoogleAccount(resourceName) {
    if (!resourceName || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/administration/integrations/provider-billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "google_ads",
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
      setError(saveError?.message || "Unable to update provider billing");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-black p-6 text-white lg:p-10">
      <div className="mx-auto max-w-7xl">
        <div className="border-b border-white/10 pb-8">
          <Link href="/settings/integrations" className="text-sm text-[#D6A66A] hover:text-[#e8bd87]">
            ← Integrations
          </Link>
          <div className="mt-6 text-xs uppercase tracking-[0.3em] text-[#D6A66A]">
            Administration / Integrations
          </div>
          <h1 className="mt-3 text-4xl font-semibold">Provider Billing</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/50">
            Avantiqo-only supplier billing and cost governance. Provider costs continue through the existing Service Pricing → Usage → Wallet → Billing → Finance flow. This screen does not create a second billing system.
          </p>
        </div>

        {error ? (
          <div className="mt-6 rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/50">
            Loading provider billing…
          </div>
        ) : (
          <>
            <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[
                ["Registered providers", state?.summary?.registered_providers ?? 0],
                ["Adapters registered", state?.summary?.adapters_registered ?? 0],
                ["Runtime available", state?.summary?.runtime_available ?? 0],
                ["Cost-control ready", state?.summary?.service_cost_control_ready ?? 0],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="text-xs uppercase tracking-[0.2em] text-white/35">{label}</div>
                  <div className="mt-2 text-3xl font-semibold">{value}</div>
                </div>
              ))}
            </section>

            <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.22em] text-white/30">Supplier account configuration</div>
                  <h2 className="mt-2 text-2xl font-semibold">Google Ads</h2>
                  <p className="mt-2 text-sm text-white/45">
                    Select the Avantiqo Google Payments account used for managed advertiser accounts. Customer wallets and media markup stay in Services.
                  </p>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs ${badgeClass(Boolean(google?.ready))}`}>
                  {google?.ready ? "Configured" : google?.blocker || "Setup required"}
                </span>
              </div>

              <div className="mt-5 grid gap-3 lg:grid-cols-2">
                {googleAccounts.length ? googleAccounts.map((account) => {
                  const selected = account.resource_name === selectedGoogleResource;
                  return (
                    <div key={account.resource_name || account.payments_account_id} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                      <div className="font-medium">{account.payments_account_name || "Google Payments account"}</div>
                      <div className="mt-1 text-sm text-white/45">
                        Account {account.payments_account_id || "—"} · Profile {account.payments_profile_id || "—"}
                      </div>
                      <button
                        type="button"
                        disabled={selected || saving}
                        onClick={() => selectGoogleAccount(account.resource_name)}
                        className="mt-4 rounded-xl border border-[#D6A66A]/30 bg-[#D6A66A]/10 px-4 py-2 text-sm font-medium text-[#F3D0A5] disabled:opacity-45"
                      >
                        {selected ? "Selected" : saving ? "Saving…" : "Use for managed Ads"}
                      </button>
                    </div>
                  );
                }) : (
                  <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100 lg:col-span-2">
                    No eligible Google Payments account is currently available to the Avantiqo Ads manager.
                  </div>
                )}
              </div>
            </section>

            <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.22em] text-white/30">Service provider adapters</div>
                  <h2 className="mt-2 text-2xl font-semibold">All registered providers</h2>
                </div>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search providers…"
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none md:w-80"
                />
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {providers.map((provider) => (
                  <article key={provider.id} className="rounded-2xl border border-white/10 bg-black/25 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs uppercase tracking-[0.18em] text-white/30">{provider.category}</div>
                        <h3 className="mt-1 text-lg font-semibold">{provider.name}</h3>
                        <div className="mt-1 text-xs text-white/35">{provider.id}</div>
                      </div>
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] ${badgeClass(provider.runtime_available)}`}>
                        {provider.runtime_available ? "Runtime" : "Unavailable"}
                      </span>
                    </div>

                    <div className="mt-4 space-y-2 text-xs leading-5 text-white/45">
                      <div><span className="text-white/65">Adapter:</span> {provider.adapter?.adapter_id}</div>
                      <div><span className="text-white/65">Billing mode:</span> {provider.adapter?.billing_mode}</div>
                      <div><span className="text-white/65">Supplier cost:</span> {provider.adapter?.supplier_cost_source}</div>
                      <div><span className="text-white/65">Pricing rows:</span> {provider.pricing_count}</div>
                      <div><span className="text-white/65">Capabilities:</span> {(provider.capabilities || []).length}</div>
                    </div>

                    <div className={`mt-4 rounded-xl border px-3 py-2 text-xs ${badgeClass(provider.service_cost_control_ready)}`}>
                      {provider.service_cost_control_ready
                        ? "Service cost control ready"
                        : provider.pricing_configured
                          ? "Runtime unavailable"
                          : "Provider pricing still required"}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
