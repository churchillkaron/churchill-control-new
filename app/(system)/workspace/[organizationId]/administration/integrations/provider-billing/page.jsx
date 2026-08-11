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
  const payerOrganization = governance.payer_organization || null;
  const providerPayerOrganizationId =
    text(state?.provider_payer_organization_id) || text(payerOrganization?.id);
  const legalEntities = Array.isArray(governance.legal_entities)
    ? governance.legal_entities
    : [];
  const suppliers = Array.isArray(governance.suppliers)
    ? governance.suppliers
    : [];
  const verificationMethods = Array.isArray(governance.verification_methods)
    ? governance.verification_methods
    : [];

  const operatorName = operatorOrganization?.name || "Avantiqo Platform";
  const payerName = payerOrganization?.name || "Provider payer not resolved";

  const google = state?.supplier_accounts?.google_ads || null;
  const selectedGoogleResource = text(google?.billing?.payments_account_resource_name);
  const googleAccounts = Array.isArray(google?.payments_accounts)
    ? google.payments_accounts
    : [];

  function selectionFor(provider) {
    const selected = supplierSelections[provider.id] || {};
    return {
      payer_organization_id: providerPayerOrganizationId,
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
    if (
      !organizationId ||
      !providerPayerOrganizationId ||
      !selected.payer_entity_id ||
      !selected.supplier_party_id
    ) {
      setError("Select the legal provider payer entity and supplier party for this provider.");
      return;
    }

    return post(
      {
        provider: provider.id,
        action: "save-supplier-account",
        payer_organization_id: providerPayerOrganizationId,
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
        account.payer_organization_id === providerPayerOrganizationId &&
        account.payer_entity_id === selected.payer_entity_id &&
        account.supplier_party_id === selected.supplier_party_id,
    );

    if (!account || !mappingMatchesStored) {
      setError("Save the current legal provider payer entity and supplier party mapping before verification.");
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
        payer_organization_id: providerPayerOrganizationId,
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
            href={`/workspace/${encodeURIComponent(organizationId)}/administration/integrations`}
            className="text-sm text-[#D6A66A] hover:text-[#e8bd87]"
          >
            ← Integrations
          </Link>
          <div className="mt-6 text-xs uppercase tracking-[0.3em] text-[#D6A66A]">
            Administration / Integrations
          </div>
          <h1 className="mt-3 text-4xl font-semibold">Provider Billing</h1>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-white/50">
            {operatorName} operates managed provider integrations. {payerName} is the legal and commercial
            payer for external provider invoices, charges, ad spend, tax, and supplier obligations. The
            selected customer organization remains the usage owner and funds paid execution through its
            own prepaid wallet.
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
          <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-4">
            {[
              `Customer usage owner: ${organization?.name || organizationId}`,
              `Platform operator: ${operatorName}`,
              `Legal provider payer: ${payerName}`,
              `${payerName} Entity owns provider AP and tax`,
              `Supplier Party is ${payerName}'s counterparty`,
              "Customer prepaid wallet reserves before execution",
              "No customer payment method at provider",
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
            ["Managed by Avantiqo", state?.summary?.supplier_billed_to_avantiqo ?? 0],
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
            Customer / Operator / Provider Payer / Entity / Party
          </div>
          <h2 className="mt-2 text-2xl font-semibold">Commercial relationship control</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-white/45">
            Customer: {organization?.name || organizationId}. Platform operator: {operatorName}. Legal
            provider payer: {payerName}. The customer owns Service usage and its prepaid wallet; {operatorName}
            operates the provider integration; {payerName} is the contracting and paying party to Google,
            Meta, OpenAI, and other managed providers. Provider execution remains blocked until the legal
            provider payer has a valid Entity, Supplier Party, verified commercial evidence, and the customer
            has prepaid funding.
          </p>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className={`rounded-2xl border p-4 text-sm ${badgeClass(Boolean(organizationId))}`}>
              <div className="font-medium">Customer organization</div>
              <div className="mt-1 opacity-70">{organization?.name || organizationId}</div>
            </div>
            <div className={`rounded-2xl border p-4 text-sm ${badgeClass(Boolean(operatorOrganization?.id))}`}>
              <div className="font-medium">Platform operator</div>
              <div className="mt-1 opacity-70">{operatorName}</div>
            </div>
            <div className={`rounded-2xl border p-4 text-sm ${badgeClass(Boolean(providerPayerOrganizationId))}`}>
              <div className="font-medium">Legal provider payer</div>
              <div className="mt-1 opacity-70">{payerName}</div>
            </div>
            <div className={`rounded-2xl border p-4 text-sm ${badgeClass(legalEntities.length > 0)}`}>
              <div className="font-medium">Payer legal Entities</div>
              <div className="mt-1 opacity-70">{legalEntities.length} active records</div>
            </div>
            <div className={`rounded-2xl border p-4 text-sm ${badgeClass(suppliers.length > 0)}`}>
              <div className="font-medium">Payer Supplier Parties</div>
              <div className="mt-1 opacity-70">{suppliers.length} active supplier records</div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/finance/legal-entities"
              className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/70 hover:bg-white/[0.07]"
            >
              Manage payer Entities
            </Link>
            <Link
              href="/procurement/suppliers"
              className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/70 hover:bg-white/[0.07]"
            >
              Manage payer Supplier Parties
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
                Google Payments is operated through {operatorName}&apos;s managed provider setup, while
                {payerName} remains the legal provider payer. The customer never supplies a payment method
                to Google. Selecting the managed Payments account does not bypass advertiser BillingSetup
                approval, campaign budget authorization, or the customer prepaid-wallet gate.
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
                      {selected ? "Selected" : saving ? "Saving…" : "Use managed Google Ads account"}
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100 lg:col-span-2">
                No eligible Google Payments account is currently available to the {operatorName} Ads manager.
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
                {operatorName} is the platform operator. The legal provider payer is fixed by governance to
                {payerName}. Select the payer&apos;s Entity and Supplier Party, then verify the commercial payer
                from real provider billing evidence. The selected customer organization remains the usage and
                prepaid-wallet owner only.
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
                  supplierAccount.payer_organization_id === providerPayerOrganizationId &&
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
                    <div><span className="text-white/65">Customer:</span> {organization?.name || organizationId}</div>
                    <div><span className="text-white/65">Operator:</span> {operatorName}</div>
                    <div><span className="text-white/65">Provider payer:</span> {payerName}</div>
                    <div><span className="text-white/65">Customer funding:</span> ACTIVE PREPAID wallet</div>
                    <div><span className="text-white/65">Adapter:</span> {provider.adapter?.adapter_id}</div>
                    <div><span className="text-white/65">Supplier cost:</span> {provider.adapter?.supplier_cost_source}</div>
                    <div><span className="text-white/65">Pricing rows:</span> {provider.pricing_count}</div>
                  </div>

                  <div className="mt-4 space-y-3">
                    <div className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 text-xs text-white/65">
                      Legal provider payer · {payerName}
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
                      <option value="">Select payer Supplier Party</option>
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
                        The legal provider payer has no active Entity. Configure one in Finance →
                      </Link>
                    ) : null}

                    {suppliers.length === 0 ? (
                      <Link href="/procurement/suppliers" className="block text-xs text-[#D6A66A]">
                        The legal provider payer has no Supplier Party for this provider. Configure the supplier →
                      </Link>
                    ) : null}

                    <button
                      type="button"
                      disabled={saving || !selected.payer_entity_id || !selected.supplier_party_id}
                      onClick={() => saveSupplierAccount(provider)}
                      className="w-full rounded-xl border border-[#D6A66A]/30 bg-[#D6A66A]/10 px-3 py-2 text-xs font-medium text-[#F3D0A5] disabled:opacity-35"
                    >
                      {saving ? "Saving…" : "Save payer Entity + Supplier Party"}
                    </button>
                  </div>

                  {supplierAccount ? (
                    <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-medium text-white/75">
                          Legal provider payer verification
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
                            Verify only after provider billing evidence clearly supports {payerName} and the selected
                            legal Entity as payer, with this Supplier Party as the counterparty. Store only a non-secret
                            reference.
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
                              Save the current payer Entity and Supplier Party mapping before verification.
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
                            {saving ? "Verifying…" : "Verify legal provider payer"}
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-100/80">
                      No payer Entity + Supplier Party mapping exists yet. Provider execution remains blocked.
                    </div>
                  )}

                  <div className={`mt-4 rounded-xl border px-3 py-2 text-xs ${badgeClass(provider.service_cost_control_ready)}`}>
                    {provider.service_cost_control_ready
                      ? "Verified legal payer + Entity + Supplier Party + pricing + runtime controls are ready"
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
