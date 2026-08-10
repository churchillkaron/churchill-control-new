"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeDollarSign,
  Building2,
  CheckCircle2,
  ExternalLink,
  Plus,
  RefreshCw,
} from "lucide-react";

function text(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function money(value, currency) {
  const amount = Number(value || 0);
  return `${Number.isFinite(amount) ? amount.toLocaleString() : "0"} ${currency || ""}`.trim();
}

function defaultEntityId(entities = []) {
  return (
    entities.find((entity) => entity.is_default_accounting_entity)?.id ||
    entities[0]?.id ||
    ""
  );
}

export default function GoogleAdsIntegrationCard({
  organizationId,
  onNotice = () => {},
  onError = () => {},
}) {
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [selectedEntityId, setSelectedEntityId] = useState("");
  const [snapshot, setSnapshot] = useState({
    connection: null,
    accounts: [],
    entities: [],
    service: null,
    wallet: null,
    platformReady: false,
    platformManager: { ready: false },
  });

  function applySnapshot(data) {
    const next = {
      connection: data.connection || null,
      accounts: data.accounts || [],
      entities: data.entities || [],
      service: data.service || null,
      wallet: data.wallet || null,
      platformReady: data.platformReady === true,
      platformManager: data.platformManager || { ready: false },
    };
    setSnapshot(next);
    setSelectedEntityId((current) =>
      next.entities.some((entity) => entity.id === current)
        ? current
        : defaultEntityId(next.entities)
    );
  }

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);

    try {
      const response = await fetch(
        `/api/administration/integrations/google-ads?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: "no-store" }
      );
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Unable to load Google Ads integration");
      }
      applySnapshot(data);
    } catch (error) {
      onError(error?.message || "Unable to load Google Ads integration");
    } finally {
      setLoading(false);
    }
  }, [organizationId, onError]);

  useEffect(() => {
    load();
  }, [load]);

  async function action(payload) {
    if (!organizationId) return null;
    setWorking(true);

    try {
      const response = await fetch(
        "/api/administration/integrations/google-ads",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ organizationId, ...payload }),
        }
      );
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Google Ads action failed");
      }
      applySnapshot(data);
      return data;
    } catch (error) {
      onError(error?.message || "Google Ads action failed");
      return null;
    } finally {
      setWorking(false);
    }
  }

  async function discover() {
    const result = await action({ action: "discover" });
    if (result) {
      const advertisers = (result.accounts || []).filter(
        (account) => account?.metadata?.manager !== true
      );
      onNotice(
        advertisers.length
          ? `Found ${advertisers.length} existing Google Ads advertiser account${advertisers.length === 1 ? "" : "s"}.`
          : "No existing advertiser account was found. You can use Avantiqo-managed advertising instead."
      );
    }
  }

  async function createManagedAccount() {
    if (!selectedEntityId) {
      onError("Select an Avantiqo legal entity first.");
      return;
    }

    const result = await action({
      action: "create-managed-account",
      entityId: selectedEntityId,
    });
    if (result) {
      onNotice(
        "Google Ads activated. Avantiqo created and mapped the managed advertiser account."
      );
    }
  }

  async function mapAccount(assetId, entityId) {
    if (!entityId) return;
    const result = await action({
      action: "map-account",
      assetId,
      entityId,
    });
    if (result) onNotice("Google Ads account mapping saved.");
  }

  const connected = upper(snapshot.connection?.status) === "ACTIVE";
  const serviceActive = upper(snapshot.service?.status) === "ACTIVE";
  const walletActive = upper(snapshot.wallet?.status) === "ACTIVE";
  const advertiserAccounts = snapshot.accounts.filter(
    (account) => account?.metadata?.manager !== true
  );
  const managedAdvertiser = advertiserAccounts.find(
    (account) => account?.metadata?.managed_by_avantiqo === true
  ) || null;
  const selectedEntity = snapshot.entities.find(
    (entity) => entity.id === selectedEntityId
  ) || null;
  const allAdvertisersMapped =
    advertiserAccounts.length > 0 &&
    advertiserAccounts.every((account) => account.entity_id);
  const activated = connected && serviceActive && allAdvertisersMapped;
  const ready =
    activated &&
    walletActive &&
    snapshot.platformReady;

  const blockers = useMemo(() => {
    const list = [];
    if (!snapshot.platformReady) list.push("Avantiqo provider configuration");
    if (!advertiserAccounts.length) list.push("advertiser activation");
    if (advertiserAccounts.length && !allAdvertisersMapped) {
      list.push("advertiser entity mapping");
    }
    if (advertiserAccounts.length && !serviceActive) list.push("Google Ads service");
    if (advertiserAccounts.length && !walletActive) list.push("funded Avantiqo wallet");
    return list;
  }, [
    snapshot.platformReady,
    advertiserAccounts.length,
    allAdvertisersMapped,
    serviceActive,
    walletActive,
  ]);

  const canCreateManaged =
    snapshot.platformReady &&
    snapshot.platformManager?.ready === true &&
    advertiserAccounts.length === 0 &&
    Boolean(selectedEntity?.currency && selectedEntity?.timezone);

  return (
    <section className="mt-6 rounded-[32px] border border-white/10 bg-white/[0.03] p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="max-w-3xl">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
              <BadgeDollarSign className="h-6 w-6 text-[#D6A66A]" />
            </div>
            <div>
              <div className="text-sm text-white/40">Managed advertising</div>
              <h2 className="text-2xl font-medium">Google Ads</h2>
            </div>
          </div>

          <div
            className={`mt-5 rounded-2xl border px-4 py-4 ${
              ready
                ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
                : activated
                  ? "border-amber-400/20 bg-amber-400/10 text-amber-100"
                  : "border-white/10 bg-white/[0.04] text-white/70"
            }`}
          >
            <div className="flex items-center gap-2 font-medium">
              {ready ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : activated ? (
                <AlertTriangle className="h-4 w-4" />
              ) : null}
              {ready
                ? "Advertising ready"
                : activated
                  ? "Google Ads activated — fund wallet to spend"
                  : "Ready to activate in Avantiqo"}
            </div>
            <div className="mt-1 text-sm opacity-70">
              {ready
                ? "Avantiqo manages the advertiser account, pays Google, and controls campaign spend from the organization prepaid wallet."
                : blockers.length
                  ? `Still required: ${blockers.join(", ")}.`
                  : "Activate Google Ads here. No Google setup is required for an Avantiqo-managed advertiser account."}
            </div>
          </div>

          {advertiserAccounts.length > 0 && (
            <div className="mt-4 grid gap-2 text-xs text-white/35 sm:grid-cols-2">
              <div>
                Account model: {managedAdvertiser ? "managed by Avantiqo" : "customer-owned"}
              </div>
              <div>Service: {snapshot.service?.status || "not enabled"}</div>
              <div>
                Wallet: {snapshot.wallet
                  ? `${snapshot.wallet.status} · ${money(snapshot.wallet.available_balance, snapshot.wallet.currency)} available`
                  : "not funded yet"}
              </div>
              <div>
                Google payment: {managedAdvertiser ? "Avantiqo" : "depends on customer account"}
              </div>
            </div>
          )}
        </div>

        {advertiserAccounts.length > 0 && !managedAdvertiser && connected && (
          <button
            type="button"
            onClick={discover}
            disabled={working || !snapshot.platformReady}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-medium text-white/70 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <RefreshCw className={`h-4 w-4 ${working ? "animate-spin" : ""}`} />
            {working ? "Checking Google Ads…" : "Refresh existing accounts"}
          </button>
        )}
      </div>

      {!loading && advertiserAccounts.length === 0 && (
        <div className="mt-8 border-t border-white/10 pt-7">
          <div className="mb-5">
            <div className="text-xs uppercase tracking-[0.22em] text-white/30">
              One-click activation
            </div>
            <h3 className="mt-2 text-xl font-medium">Activate managed Google Ads</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/45">
              Avantiqo creates and manages the advertiser account for this business. Campaign budgets are funded from the Avantiqo wallet, Avantiqo pays Google, and the customer stays inside Avantiqo for normal setup and operation.
            </p>
          </div>

          {!snapshot.entities.length ? (
            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-5">
              <div className="flex items-start gap-3">
                <Building2 className="mt-0.5 h-5 w-5 text-amber-200" />
                <div>
                  <div className="font-medium text-amber-100">Legal entity required</div>
                  <div className="mt-1 text-sm leading-6 text-amber-100/65">
                    Create the company/legal entity first so Avantiqo has the legal name, currency and time zone required for the advertiser account.
                  </div>
                  <a
                    href="/finance/legal-entities"
                    className="mt-4 inline-flex items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-2 text-sm font-medium text-amber-100"
                  >
                    Open Legal Entities
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 rounded-2xl border border-white/10 bg-black/30 p-5 lg:grid-cols-[1fr_auto] lg:items-end">
              <div>
                <label className="text-xs uppercase tracking-[0.16em] text-white/35">
                  Advertiser business
                </label>
                <select
                  value={selectedEntityId}
                  onChange={(event) => setSelectedEntityId(event.target.value)}
                  disabled={working}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none disabled:opacity-50"
                >
                  {snapshot.entities.map((entity) => (
                    <option key={entity.id} value={entity.id}>
                      {entity.display_name || entity.legal_name || entity.code}
                    </option>
                  ))}
                </select>

                {selectedEntity && (
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-white/40">
                    <span>Name: {selectedEntity.display_name || selectedEntity.legal_name || selectedEntity.code}</span>
                    <span>Currency: {selectedEntity.currency || "missing"}</span>
                    <span>Time zone: {selectedEntity.timezone || "missing"}</span>
                  </div>
                )}

                {selectedEntity && (!selectedEntity.currency || !selectedEntity.timezone) && (
                  <div className="mt-3 text-xs leading-5 text-amber-200/80">
                    Complete this legal entity’s currency and time zone before activating Google Ads.
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={createManagedAccount}
                disabled={working || !canCreateManaged}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#D6A66A] px-5 py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus className="h-4 w-4" />
                {working ? "Activating Google Ads…" : "Activate Google Ads"}
              </button>
            </div>
          )}

          {!snapshot.platformManager?.ready && (
            <div className="mt-3 rounded-xl border border-amber-400/15 bg-amber-400/[0.05] px-4 py-3 text-xs text-amber-100/70">
              Avantiqo’s managed Google Ads gateway is not ready yet. This is a platform setup issue; the customer does not need to configure Google.
            </div>
          )}

          <div className="mt-5 border-t border-white/10 pt-5">
            <div className="text-xs uppercase tracking-[0.16em] text-white/25">
              Already have your own Google Ads account?
            </div>
            <p className="mt-2 max-w-3xl text-xs leading-5 text-white/35">
              Existing-account connection is optional. Use it only when the business specifically wants Avantiqo to operate an advertiser account it already owns.
            </p>
            <a
              href={`/api/google-ads/auth?organizationId=${encodeURIComponent(organizationId)}`}
              className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-white/55 hover:text-white"
            >
              Connect existing Google Ads account
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      )}

      {loading ? (
        <div className="mt-7 border-t border-white/10 pt-6 text-sm text-white/35">
          Loading Google Ads configuration…
        </div>
      ) : advertiserAccounts.length > 0 ? (
        <div className="mt-8 border-t border-white/10 pt-7">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.22em] text-white/30">
                Advertising account
              </div>
              <h3 className="mt-2 text-xl font-medium">
                Google Ads account → Avantiqo entity
              </h3>
            </div>
            <div className={`text-xs ${allAdvertisersMapped ? "text-emerald-300" : "text-amber-200"}`}>
              {allAdvertisersMapped ? "Advertiser ready" : "Entity mapping required"}
            </div>
          </div>

          <div className="space-y-3">
            {advertiserAccounts.map((account) => {
              const managed = account?.metadata?.managed_by_avantiqo === true;

              return (
                <div
                  key={account.id}
                  className="grid gap-4 rounded-2xl border border-white/10 bg-black/30 p-4 lg:grid-cols-[1fr_360px] lg:items-center"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2 font-medium text-white">
                      <span>{account.name || `Google Ads ${account.external_id}`}</span>
                      {managed ? (
                        <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] text-emerald-200">
                          Managed by Avantiqo
                        </span>
                      ) : (
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] text-white/45">
                          Customer-owned account
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-white/35">
                      Customer {account.external_id}
                      {account.metadata?.currency_code
                        ? ` · ${account.metadata.currency_code}`
                        : ""}
                      {account.metadata?.time_zone
                        ? ` · ${account.metadata.time_zone}`
                        : ""}
                    </div>
                    {managed && (
                      <div className="mt-2 text-xs text-white/45">
                        Avantiqo-managed billing. Campaign spending is controlled through the organization wallet.
                      </div>
                    )}
                  </div>

                  <select
                    value={account.entity_id || ""}
                    onChange={(event) => mapAccount(account.id, event.target.value)}
                    disabled={working || managed}
                    className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none disabled:opacity-50"
                  >
                    <option value="">Select Avantiqo entity…</option>
                    {snapshot.entities.map((entity) => (
                      <option key={entity.id} value={entity.id}>
                        {entity.display_name || entity.legal_name || entity.code}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
