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

  return (
    <section id="google-ads" className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.025] p-6 lg:p-7">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-white/30">Advertising</div>
          <h2 className="mt-2 text-2xl font-medium">Google Ads</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/45">
            Connect an existing advertiser account or let Avantiqo prepare advertising for this business.
          </p>
        </div>
        <div className={`rounded-full border px-3 py-1 text-xs ${customerReady ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200" : "border-white/10 bg-white/[0.04] text-white/50"}`}>
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
        <div className="mt-6 grid gap-4 rounded-2xl border border-white/10 bg-black/25 p-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <label className="text-xs uppercase tracking-[0.16em] text-white/35">Advertiser business</label>
            <select
              value={selectedEntityId}
              onChange={(event) => setSelectedEntityId(event.target.value)}
              disabled={working}
              className="mt-2 w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none disabled:opacity-50"
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
              className="grid gap-4 rounded-2xl border border-white/10 bg-black/25 p-4 lg:grid-cols-[1fr_320px] lg:items-center"
            >
              <div>
                <div className="flex items-center gap-2 font-medium text-white">
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                  {account.name || "Google Ads account"}
                </div>
                <div className="mt-1 text-xs text-white/35">
                  Connected advertiser account
                </div>
              </div>
              <select
                value={account.entity_id || ""}
                onChange={(event) => mapAccount(account.id, event.target.value)}
                disabled={working || account?.metadata?.managed_by_avantiqo === true}
                className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none disabled:opacity-50"
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

      <div className="mt-5 border-t border-white/10 pt-4">
        <a
          href={`/api/google-ads/auth?organizationId=${encodeURIComponent(organizationId)}`}
          className="inline-flex items-center gap-2 text-xs font-medium text-white/50 hover:text-white"
        >
          Connect an existing Google Ads account
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {loading ? (
        <div className="mt-5 flex items-center gap-2 text-sm text-white/35">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading Google Ads…
        </div>
      ) : null}
    </section>
  );
}
