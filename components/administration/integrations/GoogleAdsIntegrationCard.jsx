"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
} from "lucide-react";

function upper(value) {
  return String(value ?? "").trim().toUpperCase();
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
  onboarding = false,
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
        throw new Error(data.error || "Unable to load Google Ads");
      }
      applySnapshot(data);
    } catch (error) {
      onError(error?.message || "Unable to load Google Ads");
    } finally {
      setLoading(false);
    }
  }, [organizationId, onError]);

  useEffect(() => {
    load();
  }, [load]);

  async function action(payload) {
    setWorking(true);
    try {
      const response = await fetch("/api/administration/integrations/google-ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, ...payload }),
      });
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

  async function createManagedAccount() {
    if (!selectedEntityId) {
      onError("Select the business entity for this advertiser account.");
      return;
    }

    const result = await action({
      action: "create-managed-account",
      entityId: selectedEntityId,
    });
    if (result) onNotice("Google Ads activation request completed.");
  }

  async function mapAccount(assetId, entityId) {
    if (!entityId) return;
    const result = await action({ action: "map-account", assetId, entityId });
    if (result) onNotice("Google Ads business mapping saved.");
  }

  const connected = upper(snapshot.connection?.status) === "ACTIVE";
  const advertiserAccounts = snapshot.accounts.filter(
    (account) => account?.metadata?.manager !== true
  );
  const selectedEntity = snapshot.entities.find(
    (entity) => entity.id === selectedEntityId
  ) || null;
  const allMapped =
    advertiserAccounts.length > 0 && advertiserAccounts.every((account) => account.entity_id);
  const customerReady = connected && advertiserAccounts.length > 0 && allMapped;
  const platformSetupPending =
    !snapshot.platformReady || snapshot.platformManager?.ready !== true;

  if (onboarding) {
    return (
      <section className="rounded-[24px] border border-black/[0.07] bg-white p-6 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#A37849]">Advertising</div>
            <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.04em] text-[#2D2822]">Google Ads</h1>
            <p className="mt-2 max-w-2xl text-[10px] leading-5 text-[#777169]">Connect an existing advertiser account or let Avantiqo prepare a governed advertiser account for this business. Every advertiser must be mapped to the legal entity that owns the spend and campaigns.</p>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-[8px] font-semibold ${customerReady ? "bg-emerald-50 text-emerald-700" : platformSetupPending ? "bg-[#F7EFE5] text-[#8A633C]" : "bg-amber-50 text-amber-700"}`}>{customerReady ? "Configured" : platformSetupPending ? "Avantiqo setup" : "Needs setup"}</span>
        </div>

        {platformSetupPending && advertiserAccounts.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-[#C9AD89]/20 bg-[#FBF6EF] p-5">
            <div className="flex items-center gap-2 text-[10px] font-semibold text-[#6D5134]"><AlertTriangle size={12} />Avantiqo is completing Google Ads platform setup</div>
            <p className="mt-2 text-[9px] leading-5 text-[#7E7468]">Nothing is required from the business right now. This becomes actionable automatically when Google/Avantiqo provider setup is ready.</p>
          </div>
        ) : null}

        {!loading && advertiserAccounts.length === 0 && !platformSetupPending ? (
          <div className="mt-5 rounded-2xl border border-[#C9AD89]/20 bg-[#FBF6EF] p-5">
            <label className="text-[9px] font-semibold text-[#6C6258]">Advertiser legal entity</label>
            <select value={selectedEntityId} onChange={(event) => setSelectedEntityId(event.target.value)} disabled={working} className="mt-2 h-10 w-full rounded-xl border border-black/[0.08] bg-white px-3 text-[10px] disabled:opacity-50">
              <option value="">Select business entity</option>
              {snapshot.entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.display_name || entity.legal_name || entity.code}</option>)}
            </select>
            {selectedEntity && (!selectedEntity.currency || !selectedEntity.timezone) ? <div className="mt-2 text-[9px] text-amber-800">Complete the entity currency and time zone before activating advertising.</div> : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={createManagedAccount} disabled={working || !selectedEntityId || !selectedEntity?.currency || !selectedEntity?.timezone} className="h-10 rounded-xl bg-[#D6A66A] px-4 text-[10px] font-semibold text-[#191919] disabled:opacity-35">{working ? "Activating…" : "Activate Google Ads"}</button>
              <a href={`/api/google-ads/auth?organizationId=${encodeURIComponent(organizationId)}&onboarding=1`} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-black/[0.08] bg-white px-4 text-[10px] font-semibold text-[#5A5249]">Connect existing account<ExternalLink size={10} /></a>
            </div>
          </div>
        ) : null}

        {!loading && advertiserAccounts.length > 0 ? (
          <div className="mt-5 space-y-2.5">
            {advertiserAccounts.map((account) => (
              <div key={account.id} className="rounded-2xl border border-black/[0.07] bg-[#FCFBF8] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold text-[#433B33]"><CheckCircle2 size={11} className="text-emerald-700" />{account.name || "Google Ads account"}</div>
                    <div className="mt-1 text-[8px] text-[#938B82]">Connected advertiser account</div>
                  </div>
                  {account.entity_id ? <span className="text-[8px] font-semibold text-emerald-700">Mapped</span> : <span className="text-[8px] font-semibold text-amber-700">Choose entity</span>}
                </div>
                <select value={account.entity_id || ""} onChange={(event) => mapAccount(account.id, event.target.value)} disabled={working || account?.metadata?.managed_by_avantiqo === true} className="mt-3 h-9 w-full rounded-xl border border-black/[0.08] bg-white px-3 text-[9px] disabled:opacity-50">
                  <option value="">Select business entity</option>
                  {snapshot.entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.display_name || entity.legal_name || entity.code}</option>)}
                </select>
              </div>
            ))}
            {!platformSetupPending ? <a href={`/api/google-ads/auth?organizationId=${encodeURIComponent(organizationId)}&onboarding=1`} className="mt-2 inline-flex items-center gap-1.5 text-[9px] font-semibold text-[#806444]">Connect another existing account<ExternalLink size={9} /></a> : null}
          </div>
        ) : null}

        {loading ? <div className="mt-5 flex items-center gap-2 text-[9px] text-[#817B73]"><RefreshCw size={10} className="animate-spin" />Loading Google Ads…</div> : null}
      </section>
    );
  }

  return (
    <section id="google-ads" className="mt-6 rounded-[28px] border border-black/[0.08] bg-white p-6 lg:p-7">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-[#A19A92]">Advertising</div>
          <h2 className="mt-2 text-2xl font-medium">Google Ads</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#746E66]">
            Connect an existing advertiser account or let Avantiqo prepare advertising for this business.
          </p>
        </div>
        <div className={`rounded-full border px-3 py-1 text-xs ${customerReady ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200" : "border-black/[0.08] bg-white/[0.04] text-[#746E66]"}`}>
          {customerReady ? "Connected" : platformSetupPending ? "Setup in progress" : "Not connected"}
        </div>
      </div>

      {platformSetupPending && advertiserAccounts.length === 0 ? (
        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-400/15 bg-amber-400/[0.06] px-4 py-4 text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="text-sm font-medium">Avantiqo is completing Google Ads setup</div>
            <div className="mt-1 text-xs leading-5 text-amber-100/65">
              Nothing is required from the business right now. This page will become actionable when setup is ready.
            </div>
          </div>
        </div>
      ) : null}

      {!loading && advertiserAccounts.length === 0 && !platformSetupPending ? (
        <div className="mt-6 grid gap-4 rounded-2xl border border-black/[0.08] bg-[#FBF8F3] p-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <label className="text-xs uppercase tracking-[0.16em] text-[#918B83]">Advertiser business</label>
            <select
              value={selectedEntityId}
              onChange={(event) => setSelectedEntityId(event.target.value)}
              disabled={working}
              className="mt-2 w-full rounded-xl border border-black/[0.09] bg-white px-4 py-3 text-sm text-[#191919] outline-none disabled:opacity-50"
            >
              <option value="">Select business entity</option>
              {snapshot.entities.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {entity.display_name || entity.legal_name || entity.code}
                </option>
              ))}
            </select>
            {selectedEntity && (!selectedEntity.currency || !selectedEntity.timezone) ? (
              <div className="mt-2 text-xs text-amber-200/75">
                Complete the entity currency and time zone before activating advertising.
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={createManagedAccount}
            disabled={
              working ||
              !selectedEntityId ||
              !selectedEntity?.currency ||
              !selectedEntity?.timezone
            }
            className="rounded-2xl bg-[#D6A66A] px-5 py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            {working ? "Activating…" : "Activate Google Ads"}
          </button>
        </div>
      ) : null}

      {!loading && advertiserAccounts.length > 0 ? (
        <div className="mt-6 space-y-3">
          {advertiserAccounts.map((account) => (
            <div
              key={account.id}
              className="grid gap-4 rounded-2xl border border-black/[0.08] bg-[#FBF8F3] p-4 lg:grid-cols-[1fr_320px] lg:items-center"
            >
              <div>
                <div className="flex items-center gap-2 font-medium text-[#191919]">
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                  {account.name || "Google Ads account"}
                </div>
                <div className="mt-1 text-xs text-[#918B83]">
                  Connected advertiser account
                </div>
              </div>
              <select
                value={account.entity_id || ""}
                onChange={(event) => mapAccount(account.id, event.target.value)}
                disabled={working || account?.metadata?.managed_by_avantiqo === true}
                className="w-full rounded-xl border border-black/[0.09] bg-white px-4 py-3 text-sm text-[#191919] outline-none disabled:opacity-50"
              >
                <option value="">Select business entity</option>
                {snapshot.entities.map((entity) => (
                  <option key={entity.id} value={entity.id}>
                    {entity.display_name || entity.legal_name || entity.code}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      ) : null}

      {!platformSetupPending ? (
        <div className="mt-5 border-t border-black/[0.08] pt-4">
          <a
            href={`/api/google-ads/auth?organizationId=${encodeURIComponent(organizationId)}`}
            className="inline-flex items-center gap-2 text-xs font-medium text-[#746E66] hover:text-[#191919]"
          >
            Connect an existing Google Ads account
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      ) : null}

      {loading ? (
        <div className="mt-5 flex items-center gap-2 text-sm text-[#918B83]">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading Google Ads…
        </div>
      ) : null}
    </section>
  );
}
