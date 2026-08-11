"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { useOrganizationRuntime } from "@/lib/hooks/useOrganizationRuntime";

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

function verificationMethodLabel(value) {
  return text(value)
    .split("_")
    .filter(Boolean)
    .map((part) => `${part.charAt(0)}${part.slice(1).toLowerCase()}`)
    .join(" ");
}

export default function ProviderBillingPage() {
  const { organization, loading: organizationLoading } = useOrganizationRuntime();
  const organizationId = organization?.id || null;

  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [supplierSelections, setSupplierSelections] = useState({});
  const [verificationSelections, setVerificationSelections] = useState({});

  async function load() {
    if (!organizationId) {
      setState(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ organization_id: organizationId });
      const response = await fetch(
        `/api/administration/integrations/provider-billing?${params.toString()}`,
        { cache: "no-store" },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) {
        throw new Error(body?.error || `Request failed (${response.status})`);
      }
      setState(body);
      setSupplierSelections({});
      setVerificationSelections({});
    } catch (loadError) {
      setError(loadError?.message || "Unable to load provider billing");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (organizationLoading) return;
    load();
  }, [organizationId, organizationLoading]);

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
        provider.supplier_account?.verification_status,
        provider.supplier_account?.verification_method,
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
  const payerOrganization = governance.payer_organization || organization || null;
  const legalEntities = Array.isArray(governance.legal_entities)
    ? governance.legal_entities
    : [];
  const suppliers = Array.isArray(governance.suppliers)
    ? governance.suppliers
    : [];
  const verificationMethods = Array.isArray(governance.verification_methods)
    ? governance.verification_methods
    : [];

  const google = state?.supplier_accounts?.google_ads || null;
  const selectedGoogleResource = text(google?.billing?.payments_account_resource_name);
  const googleAccounts = Array.isArray(google?.payments_accounts)
    ? google.payments_accounts
    : [];

  function selectionFor(provider) {
    const selected = supplierSelections[provider.id] || {};
    return {
      payer_organization_id: organizationId || "",
      payer_entity_id:
        selected.payer_entity_id ?? provider?.supplier_account?.payer_entity_id ?? "",
      supplier_party_id:
        selected.supplier_party_id ?? provider?.supplier_account?.supplier_party_id ?? "",
    };
  }

  function verificationFor(provider) {
    const selected = verificationSelections[provider.id] || {};
    return {
      verification_method:
        selected.verification_method ??
        provider?.supplier_account?.verification_method ??
        "",
      verification_reference:
        selected.verification_reference ??
        provider?.supplier_account?.verification_reference ??
        "",
    };
  }

  function updateSelection(providerId, key, value) {
    setSupplierSelections((current) => ({
      ...current,
      [providerId]: {
        ...(current[providerId] || {}),
        [key]: value,
      },
    }));
  }

  function updateVerification(providerId, key, value) {
    setVerificationSelections((current) => ({
      ...current,
      [providerId]: {
        ...(current[providerId] || {}),
        [key]: value,
      },
    }));
  }

  async function post(body, fallbackMessage) {
    if (saving || !organizationId) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/administration/integrations/provider-billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          organization_id: organizationId,
        }),
      });
      const responseBody = await response.json().catch(() => ({}));
      if (!response.ok || responseBody?.success === false) {
        throw new Error(responseBody?.error || `Request failed (${response.status})`);
      }
      setState(responseBody);
      setSupplierSelections({});
      setVerificationSelections({});
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
    if (!organizationId || !selected.payer_entity_id || !selected.supplier_party_id) {
      setError("Select the payer entity and supplier party for this organization.");
      return;
    }

    return post(
      {
        provider: provider.id,
        action: "save-supplier-account",
        payer_organization_id: organizationId,
        payer_entity_id: selected.payer_entity_id,
        supplier_party_id: selected.supplier_party_id,
      },
      "Unable to save provider supplier account",
    );
  }

  async function verifySupplierAccount(provider) {
    const account = provider?.supplier_account || null;
    const selected = selectionFor(provider);
    const verification = verificationFor(provider);
    const mappingMatchesStored = Boolean(
      account &&
        account.payer_organization_id === organizationId &&
        account.payer_entity_id === selected.payer_entity_id &&
        account.supplier_party_id === selected.supplier_party_id,
    );

    if (!account || !mappingMatchesStored) {
      setError("Save the current organization, entity, and supplier party mapping before verification.");
      return;
    }
    if (!verification.verification_method) {
      setError("Select the evidence type used to verify the commercial payer.");
      return;
    }
    if (!text(verification.verification_reference)) {
      setError("Enter a non-secret supplier billing evidence reference.");
      return;
    }

    return post(
      {
        provider: provider.id,
        action: "verify-supplier-account",
        verification_method: verification.verification_method,
        verification_reference: verification.verification_reference,
      },
      "Unable to verify provider commercial payer",
    );
  }

  if (organizationLoading || loading) {
    return (
      <main className="min-h-screen bg-black p-6 text-white lg:p-10">
        <div className="mx-auto max-w-7xl rounded-3xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/50">
          Loading provider billing…
        </div>
      </main>
    );
  }

  if (!organizationId) {
    return (
      <main className="min-h-screen bg-black p-6 text-white lg:p-10">
        <div className="mx-auto max-w-7xl rounded-3xl border border-amber-400/20 bg-amber-400/10 p-6 text-sm text-amber-100">
          Select an organization before managing Provider Billing.
        </div>
      </main>
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
            Avantiqo operates provider billing centrally. The active organization funds provider use
            through its prepaid Avantiqo wallet. Each provider relationship resolves an Organization,
            payer Entity, and Supplier Party before commercial verification and execution.
          </p>
        </div>

        {error ? (
          <div className="mt-6 rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        <section className="mt-6 rounded-3xl border border-[#D6A66A]/25 bg-[#D6A66A]/[0.06] p-6">
          <div className="text-xs uppercase tracking-[0.22em] text-[#D6A66A]">
            Canonical commercial scope
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            {[
              `Organization: ${payerOrganization?.name || organization?.name || organizationId}`,
              "Entity owns accounting and tax",
              "Supplier Party identifies provider counterparty",
              "Commercial evidence verifies payer",
              "Prepaid wallet reserves before provider",
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
            ["Verified supplier accounts", state?.summary?.supplier_accounts_configured ?? 0],
            ["Billed through Avantiqo", state?.summary?.supplier_billed_to_avantiqo ?? 0],
            ["Fully ready", state?.summary?.service_cost_control_ready ?? 0],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <div className="text-xs uppercase tracking-[0.2em] text-white/35">{label}</div>
              <div className="mt-2 text-3xl font-semibold">{value}</div>
            </div>
          ))}
        </section>

        <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-6">
          <div className="text-xs uppercase tracking-[0.22em] text-white/30">
            Operator / Organization / Entity / Party
          </div>
          <h2 className="mt-2 text-2xl font-semibold">Commercial relationship control</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-white/45">
            Operator: {operatorOrganization?.name || "Avantiqo"}. Organization:{" "}
            {payerOrganization?.name || organization?.name || organizationId}. Avantiqo is the platform
            operator; it is not substituted for the organization, entity, or supplier party. Provider
            execution remains blocked until the organization has a valid payer entity, supplier party,
            and verified commercial evidence.
          </p>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className={`rounded-2xl border p-4 text-sm ${badgeClass(Boolean(payerOrganization?.id))}`}>
              <div className="font-medium">Organization</div>
              <div className="mt-1 opacity-70">{payerOrganization?.name || organization?.name || "Selected"}</div>
            </div>
            <div className={`rounded-2xl border p-4 text-sm ${badgeClass(legalEntities.length > 0)}`}>
              <div className="font-medium">Entities</div>
              <div className="mt-1 opacity-70">{legalEntities.length} active records</div>
            </div>
            <div className={`rounded-2xl border p-4 text-sm ${badgeClass(suppliers.length > 0)}`}>
              <div className="font-medium">Supplier Parties</div>
              <div className="mt-1 opacity-70">{suppliers.length} active supplier records</div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/finance/legal-entities"
              className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/70 hover:bg-white/[0.07]"
            >
              Manage Entities
            </Link>
            <Link
              href="/procurement/suppliers"
              className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/70 hover:bg-white/[0.07]"
            >
              Manage Supplier Parties
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
                Google Payments belongs to Avantiqo&apos;s managed provider setup. Selecting it does not
                bypass the active Organization, payer Entity, Supplier Party, commercial verification,
                advertiser BillingSetup approval, account budget, or prepaid wallet controls.
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
                Organization is fixed to the active business context. Select its payer Entity and Supplier Party,
                then verify the commercial payer from real provider billing evidence.
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
              const verification = verificationFor(provider);
              const supplierAccount = provider?.supplier_account || null;
              const mappingMatchesStored = Boolean(
                supplierAccount &&
                  supplierAccount.payer_organization_id === organizationId &&
                  supplierAccount.payer_entity_id === selected.payer_entity_id &&
                  supplierAccount.supplier_party_id === selected.supplier_party_id,
              );
              const verificationStatus =
                text(supplierAccount?.verification_status).toUpperCase() ||
                (supplierAccount ? "UNVERIFIED" : "NOT_CONFIGURED");
              const verified = verificationStatus === "VERIFIED";

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
                    <div><span className="text-white/65">Organization:</span> {payerOrganization?.name || organization?.name || organizationId}</div>
                    <div><span className="text-white/65">Customer funding:</span> ACTIVE PREPAID wallet</div>
                    <div><span className="text-white/65">Adapter:</span> {provider.adapter?.adapter_id}</div>
                    <div><span className="text-white/65">Supplier cost:</span> {provider.adapter?.supplier_cost_source}</div>
                    <div><span className="text-white/65">Pricing rows:</span> {provider.pricing_count}</div>
                  </div>

                  <div className="mt-4 space-y-3">
                    <div className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 text-xs text-white/65">
                      Organization · {payerOrganization?.name || organization?.name || organizationId}
                    </div>

                    <select
                      value={selected.payer_entity_id}
                      onChange={(event) =>
                        updateSelection(provider.id, "payer_entity_id", event.target.value)
                      }
                      className="w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-xs text-white"
                    >
                      <option value="">Select payer Entity</option>
                      {legalEntities.map((entity) => (
                        <option key={entity.id} value={entity.id}>
                          {entity.legal_name || entity.display_name || entity.code}
                        </option>
                      ))}
                    </select>

                    <select
                      value={selected.supplier_party_id}
                      onChange={(event) =>
                        updateSelection(provider.id, "supplier_party_id", event.target.value)
                      }
                      className="w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-xs text-white"
                    >
                      <option value="">Select Supplier Party</option>
                      {suppliers.map((supplier) => (
                        <option key={supplier.party_id} value={supplier.party_id}>
                          {supplier.party?.legal_name ||
                            supplier.party?.display_name ||
                            supplier.vendor_code ||
                            supplier.party_id}
                        </option>
                      ))}
                    </select>

                    {legalEntities.length === 0 ? (
                      <Link href="/finance/legal-entities" className="block text-xs text-[#D6A66A]">
                        This organization has no active Entity. Configure one in Finance →
                      </Link>
                    ) : null}

                    {suppliers.length === 0 ? (
                      <Link href="/procurement/suppliers" className="block text-xs text-[#D6A66A]">
                        This organization has no Supplier Party. Configure the provider supplier →
                      </Link>
                    ) : null}

                    <button
                      type="button"
                      disabled={saving || !selected.payer_entity_id || !selected.supplier_party_id}
                      onClick={() => saveSupplierAccount(provider)}
                      className="w-full rounded-xl border border-[#D6A66A]/30 bg-[#D6A66A]/10 px-3 py-2 text-xs font-medium text-[#F3D0A5] disabled:opacity-35"
                    >
                      {saving ? "Saving…" : "Save Organization + Entity + Supplier Party"}
                    </button>
                  </div>

                  {supplierAccount ? (
                    <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-medium text-white/75">
                          Commercial payer verification
                        </div>
                        <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${badgeClass(verified)}`}>
                          {verificationStatus}
                        </span>
                      </div>

                      {verified ? (
                        <div className="mt-3 space-y-1 text-xs leading-5 text-white/45">
                          <div>
                            <span className="text-white/65">Evidence:</span>{" "}
                            {verificationMethodLabel(supplierAccount.verification_method) || "Verified evidence"}
                          </div>
                          <div>
                            <span className="text-white/65">Reference:</span>{" "}
                            {supplierAccount.verification_reference || "—"}
                          </div>
                          <div>
                            <span className="text-white/65">Verified:</span>{" "}
                            {supplierAccount.verified_at
                              ? new Date(supplierAccount.verified_at).toLocaleString()
                              : "Recorded"}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 space-y-3">
                          <p className="text-xs leading-5 text-white/45">
                            Verify only after provider billing evidence clearly supports this Organization and Entity as payer and this Supplier Party as the counterparty. Store only a non-secret reference.
                          </p>
                          <select
                            value={verification.verification_method}
                            disabled={!mappingMatchesStored}
                            onChange={(event) =>
                              updateVerification(
                                provider.id,
                                "verification_method",
                                event.target.value,
                              )
                            }
                            className="w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-xs text-white disabled:opacity-40"
                          >
                            <option value="">Select evidence type</option>
                            {verificationMethods.map((method) => (
                              <option key={method} value={method}>
                                {verificationMethodLabel(method)}
                              </option>
                            ))}
                          </select>
                          <input
                            value={verification.verification_reference}
                            disabled={!mappingMatchesStored}
                            onChange={(event) =>
                              updateVerification(
                                provider.id,
                                "verification_reference",
                                event.target.value,
                              )
                            }
                            placeholder="Invoice / profile / statement reference"
                            className="w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-xs text-white outline-none disabled:opacity-40"
                          />
                          {!mappingMatchesStored ? (
                            <div className="text-[11px] leading-4 text-amber-100/70">
                              Save the current Organization, Entity, and Supplier Party mapping before verification.
                            </div>
                          ) : null}
                          <button
                            type="button"
                            disabled={
                              saving ||
                              !mappingMatchesStored ||
                              !verification.verification_method ||
                              !text(verification.verification_reference)
                            }
                            onClick={() => verifySupplierAccount(provider)}
                            className="w-full rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-xs font-medium text-emerald-100 disabled:opacity-35"
                          >
                            {saving ? "Verifying…" : "Verify commercial payer from evidence"}
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-100/80">
                      No Organization + Entity + Supplier Party mapping exists yet. Provider execution remains blocked.
                    </div>
                  )}

                  <div className={`mt-4 rounded-xl border px-3 py-2 text-xs ${badgeClass(provider.service_cost_control_ready)}`}>
                    {provider.service_cost_control_ready
                      ? "Verified Organization + Entity + Supplier Party + pricing + runtime controls are ready"
                      : provider.billing_blocker || provider.billing_status || "Provider billing blocked"}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
