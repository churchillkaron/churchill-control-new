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

function statusLabel(provider) {
  if (provider?.service_cost_control_ready) return "READY";
  return provider?.billing_status || provider?.billing_blocker || "BLOCKED";
}

export default function ProviderBillingPage() {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [supplierSelections, setSupplierSelections] = useState({});

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
        provider.billing_status,
        provider.billing_blocker,
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

  const governance = state?.supplier_governance || {};
  const operatorOrganization = governance.operator_organization || null;
  const payerOrganizations = Array.isArray(governance.payer_organizations)
    ? governance.payer_organizations
    : [];
  const legalEntities = Array.isArray(governance.legal_entities)
    ? governance.legal_entities
    : [];
  const suppliers = Array.isArray(governance.suppliers)
    ? governance.suppliers
    : [];

  const google = state?.supplier_accounts?.google_ads || null;
  const selectedGoogleResource = text(google?.billing?.payments_account_resource_name);
  const googleAccounts = Array.isArray(google?.payments_accounts)
    ? google.payments_accounts
    : [];

  function selectionFor(provider) {
    const selected = supplierSelections[provider.id] || {};
    return {
      payer_organization_id:
        selected.payer_organization_id ??
        provider?.supplier_account?.payer_organization_id ??
        "",
      payer_entity_id:
        selected.payer_entity_id ?? provider?.supplier_account?.payer_entity_id ?? "",
      supplier_party_id:
        selected.supplier_party_id ?? provider?.supplier_account?.supplier_party_id ?? "",
    };
  }

  function updateSelection(providerId, key, value) {
    setSupplierSelections((current) => {
      const next = {
        ...(current[providerId] || {}),
        [key]: value,
      };
      if (key === "payer_organization_id") {
        next.payer_entity_id = "";
        next.supplier_party_id = "";
      }
      return {
        ...current,
        [providerId]: next,
      };
    });
  }

  async function post(body, fallbackMessage) {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/administration/integrations/provider-billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const responseBody = await response.json().catch(() => ({}));
      if (!response.ok || responseBody?.success === false) {
        throw new Error(responseBody?.error || `Request failed (${response.status})`);
      }
      setState(responseBody);
    } catch (saveError) {
      setError(saveError?.message || fallbackMessage);
    } finally {
      setSaving(false);
    }
  }

  async function selectGoogleAccount(resourceName) {
    if (!resourceName) return;
    return post(
      {
        provider: "google_ads",
        action: "select-payments-account",
        paymentsAccountResourceName: resourceName,
      },
      "Unable to update Google provider billing",
    );
  }

  async function saveSupplierAccount(provider) {
    const selected = selectionFor(provider);
    if (
      !selected.payer_organization_id ||
      !selected.payer_entity_id ||
      !selected.supplier_party_id
    ) {
      setError(
        "Select the legal payer organization, its legal entity, and the provider supplier master.",
      );
      return;
    }

    return post(
      {
        provider: provider.id,
        action: "save-supplier-account",
        payer_organization_id: selected.payer_organization_id,
        payer_entity_id: selected.payer_entity_id,
        supplier_party_id: selected.supplier_party_id,
      },
      "Unable to save provider supplier account",
    );
  }

  return (
    <main className="min-h-screen bg-black p-6 text-white lg:p-10">
      <div className="mx-auto max-w-7xl">
        <div className="border-b border-white/10 pb-8">
          <Link
            href="/settings/integrations"
            className="text-sm text-[#D6A66A] hover:text-[#e8bd87]"
          >
            ← Integrations
          </Link>
          <div className="mt-6 text-xs uppercase tracking-[0.3em] text-[#D6A66A]">
            Administration / Integrations
          </div>
          <h1 className="mt-3 text-4xl font-semibold">Provider Billing</h1>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-white/50">
            Avantiqo operates provider billing centrally. The customer prepays the Avantiqo wallet,
            while the selected legal payer company receives the provider invoice or charge and Finance
            reconciles that supplier cost back to governed Service usage.
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
            <section className="mt-6 rounded-3xl border border-[#D6A66A]/25 bg-[#D6A66A]/[0.06] p-6">
              <div className="text-xs uppercase tracking-[0.22em] text-[#D6A66A]">
                Mandatory billing contract
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-5">
                {[
                  "Customer prepays wallet",
                  "Wallet reserves before provider",
                  "Legal payer receives provider charge",
                  "Finance reconciles supplier invoice",
                  "No direct customer/provider billing",
                ].map((label) => (
                  <div
                    key={label}
                    className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-white/75"
                  >
                    {label}
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[
                ["Registered providers", state?.summary?.registered_providers ?? 0],
                ["Supplier accounts", state?.summary?.supplier_accounts_configured ?? 0],
                ["Billed through Avantiqo", state?.summary?.supplier_billed_to_avantiqo ?? 0],
                ["Fully ready", state?.summary?.service_cost_control_ready ?? 0],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
                >
                  <div className="text-xs uppercase tracking-[0.2em] text-white/35">{label}</div>
                  <div className="mt-2 text-3xl font-semibold">{value}</div>
                </div>
              ))}
            </section>

            <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-6">
              <div className="text-xs uppercase tracking-[0.22em] text-white/30">
                Operator and payer governance
              </div>
              <h2 className="mt-2 text-2xl font-semibold">Legal payer control</h2>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-white/45">
                Operator: {operatorOrganization?.name || "Avantiqo"}. The operator shell is not treated as a legal company.
                Each provider must be assigned to the real organization that legally pays that supplier, plus a legal entity
                and supplier master belonging to the same organization.
              </p>

              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <div className={`rounded-2xl border p-4 text-sm ${badgeClass(payerOrganizations.length > 0)}`}>
                  <div className="font-medium">Eligible payer organizations</div>
                  <div className="mt-1 opacity-70">{payerOrganizations.length} available</div>
                </div>
                <div className={`rounded-2xl border p-4 text-sm ${badgeClass(legalEntities.length > 0)}`}>
                  <div className="font-medium">Legal entities</div>
                  <div className="mt-1 opacity-70">{legalEntities.length} active records</div>
                </div>
                <div className={`rounded-2xl border p-4 text-sm ${badgeClass(suppliers.length > 0)}`}>
                  <div className="font-medium">Supplier masters</div>
                  <div className="mt-1 opacity-70">{suppliers.length} active records</div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href="/finance/legal-entities"
                  className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/70 hover:bg-white/[0.07]"
                >
                  Manage Legal Entities
                </Link>
                <Link
                  href="/procurement/suppliers"
                  className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/70 hover:bg-white/[0.07]"
                >
                  Manage Suppliers
                </Link>
              </div>
            </section>

            <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.22em] text-white/30">
                    Managed media supplier account
                  </div>
                  <h2 className="mt-2 text-2xl font-semibold">Google Ads</h2>
                  <p className="mt-2 text-sm text-white/45">
                    Google Payments configuration is an additional provider-side requirement. Selecting it does not bypass
                    legal payer, supplier master, advertiser BillingSetup approval, account budget, or wallet controls.
                  </p>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs ${badgeClass(Boolean(google?.ready))}`}>
                  {google?.ready ? "Google account configured" : google?.blocker || "Setup required"}
                </span>
              </div>

              <div className="mt-5 grid gap-3 lg:grid-cols-2">
                {googleAccounts.length ? (
                  googleAccounts.map((account) => {
                    const selected = account.resource_name === selectedGoogleResource;
                    return (
                      <div
                        key={account.resource_name || account.payments_account_id}
                        className="rounded-2xl border border-white/10 bg-black/25 p-4"
                      >
                        <div className="font-medium">
                          {account.payments_account_name || "Google Payments account"}
                        </div>
                        <div className="mt-1 text-sm text-white/45">
                          Account {account.payments_account_id || "—"} · Profile {account.payments_profile_id || "—"}
                        </div>
                        <button
                          type="button"
                          disabled={selected || saving}
                          onClick={() => selectGoogleAccount(account.resource_name)}
                          className="mt-4 rounded-xl border border-[#D6A66A]/30 bg-[#D6A66A]/10 px-4 py-2 text-sm font-medium text-[#F3D0A5] disabled:opacity-45"
                        >
                          {selected ? "Selected" : saving ? "Saving…" : "Use for managed Google Ads"}
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100 lg:col-span-2">
                    No eligible Google Payments account is currently available to the Avantiqo Ads manager.
                  </div>
                )}
              </div>
            </section>

            <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.22em] text-white/30">Supplier adapters</div>
                  <h2 className="mt-2 text-2xl font-semibold">All registered providers</h2>
                  <p className="mt-2 text-sm text-white/45">
                    Configure exactly one active legal payer per provider. Changing payer suspends the previous active payer record for audit history.
                  </p>
                </div>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search providers…"
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none md:w-80"
                />
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {providers.map((provider) => {
                  const selected = selectionFor(provider);
                  const providerEntities = legalEntities.filter(
                    (entity) => entity.organization_id === selected.payer_organization_id,
                  );
                  const providerSuppliers = suppliers.filter(
                    (supplier) => supplier.organization_id === selected.payer_organization_id,
                  );

                  return (
                    <article key={provider.id} className="rounded-2xl border border-white/10 bg-black/25 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xs uppercase tracking-[0.18em] text-white/30">{provider.category}</div>
                          <h3 className="mt-1 text-lg font-semibold">{provider.name}</h3>
                          <div className="mt-1 text-xs text-white/35">{provider.id}</div>
                        </div>
                        <span className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] ${badgeClass(provider.service_cost_control_ready)}`}>
                          {statusLabel(provider)}
                        </span>
                      </div>

                      <div className="mt-4 space-y-2 text-xs leading-5 text-white/45">
                        <div><span className="text-white/65">Operator:</span> Avantiqo</div>
                        <div><span className="text-white/65">Customer funding:</span> ACTIVE PREPAID wallet</div>
                        <div><span className="text-white/65">Adapter:</span> {provider.adapter?.adapter_id}</div>
                        <div><span className="text-white/65">Supplier cost:</span> {provider.adapter?.supplier_cost_source}</div>
                        <div><span className="text-white/65">Pricing rows:</span> {provider.pricing_count}</div>
                      </div>

                      <div className="mt-4 space-y-3">
                        <select
                          value={selected.payer_organization_id}
                          onChange={(event) =>
                            updateSelection(provider.id, "payer_organization_id", event.target.value)
                          }
                          className="w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-xs text-white"
                        >
                          <option value="">Select legal payer organization</option>
                          {payerOrganizations.map((organization) => (
                            <option key={organization.id} value={organization.id}>
                              {organization.legal_name || organization.name}
                            </option>
                          ))}
                        </select>

                        <select
                          value={selected.payer_entity_id}
                          disabled={!selected.payer_organization_id}
                          onChange={(event) =>
                            updateSelection(provider.id, "payer_entity_id", event.target.value)
                          }
                          className="w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-xs text-white disabled:opacity-40"
                        >
                          <option value="">Select payer legal entity</option>
                          {providerEntities.map((entity) => (
                            <option key={entity.id} value={entity.id}>
                              {entity.legal_name || entity.display_name || entity.code}
                            </option>
                          ))}
                        </select>

                        <select
                          value={selected.supplier_party_id}
                          disabled={!selected.payer_organization_id}
                          onChange={(event) =>
                            updateSelection(provider.id, "supplier_party_id", event.target.value)
                          }
                          className="w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-xs text-white disabled:opacity-40"
                        >
                          <option value="">Select provider supplier master</option>
                          {providerSuppliers.map((supplier) => (
                            <option key={supplier.party_id} value={supplier.party_id}>
                              {supplier.party?.legal_name ||
                                supplier.party?.display_name ||
                                supplier.vendor_code ||
                                supplier.party_id}
                            </option>
                          ))}
                        </select>

                        {selected.payer_organization_id && providerEntities.length === 0 ? (
                          <Link href="/finance/legal-entities" className="block text-xs text-[#D6A66A]">
                            This payer has no legal entity. Configure one in Finance →
                          </Link>
                        ) : null}

                        {selected.payer_organization_id && providerSuppliers.length === 0 ? (
                          <Link href="/procurement/suppliers" className="block text-xs text-[#D6A66A]">
                            This payer has no supplier masters. Configure the provider supplier →
                          </Link>
                        ) : null}

                        <button
                          type="button"
                          disabled={
                            saving ||
                            !selected.payer_organization_id ||
                            !selected.payer_entity_id ||
                            !selected.supplier_party_id
                          }
                          onClick={() => saveSupplierAccount(provider)}
                          className="w-full rounded-xl border border-[#D6A66A]/30 bg-[#D6A66A]/10 px-3 py-2 text-xs font-medium text-[#F3D0A5] disabled:opacity-35"
                        >
                          {saving ? "Saving…" : "Save legal payer + supplier account"}
                        </button>
                      </div>

                      <div className={`mt-4 rounded-xl border px-3 py-2 text-xs ${badgeClass(provider.service_cost_control_ready)}`}>
                        {provider.service_cost_control_ready
                          ? "Legal payer + supplier + pricing + runtime controls are ready"
                          : provider.billing_blocker || provider.billing_status || "Provider billing blocked"}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
