"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeDollarSign,
  CheckCircle2,
  ExternalLink,
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

export default function GoogleAdsIntegrationCard({
  organizationId,
  onNotice = () => {},
  onError = () => {},
}) {
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [snapshot, setSnapshot] = useState({
    connection: null,
    accounts: [],
    entities: [],
    service: null,
    wallet: null,
    platformReady: false,
  });

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
      setSnapshot({
        connection: data.connection || null,
        accounts: data.accounts || [],
        entities: data.entities || [],
        service: data.service || null,
        wallet: data.wallet || null,
        platformReady: data.platformReady === true,
      });
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
      setSnapshot({
        connection: data.connection || null,
        accounts: data.accounts || [],
        entities: data.entities || [],
        service: data.service || null,
        wallet: data.wallet || null,
        platformReady: data.platformReady === true,
      });
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
      onNotice(
        `Found ${result.accounts?.length || 0} accessible Google Ads account${result.accounts?.length === 1 ? "" : "s"}.`
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
  const allMapped =
    snapshot.accounts.length > 0 &&
    snapshot.accounts.every((account) => account.entity_id);
  const ready =
    connected &&
    serviceActive &&
    walletActive &&
    snapshot.platformReady &&
    allMapped;

  const blockers = useMemo(() => {
    const list = [];
    if (!connected) list.push("organization authorization");
    if (!serviceActive) list.push("Google Ads service");
    if (!snapshot.platformReady) list.push("Avantiqo developer-token configuration");
    if (!walletActive) list.push("active wallet");
    if (!snapshot.accounts.length) list.push("Ads account discovery");
    else if (!allMapped) list.push("entity mapping");
    return list;
  }, [connected, serviceActive, snapshot.platformReady, walletActive, snapshot.accounts.length, allMapped]);

  return (
    <section className="mt-6 rounded-[32px] border border-white/10 bg-white/[0.03] p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="max-w-3xl">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
              <BadgeDollarSign className="h-6 w-6 text-[#D6A66A]" />
            </div>
            <div>
              <div className="text-sm text-white/40">Google</div>
              <h2 className="text-2xl font-medium">Google Ads</h2>
            </div>
          </div>

          <div
            className={`mt-5 rounded-2xl border px-4 py-4 ${
              ready
                ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
                : connected
                  ? "border-amber-400/20 bg-amber-400/10 text-amber-100"
                  : "border-white/10 bg-white/[0.04] text-white/70"
            }`}
          >
            <div className="flex items-center gap-2 font-medium">
              {ready ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : connected ? (
                <AlertTriangle className="h-4 w-4" />
              ) : null}
              {ready
                ? "Connected and financially governed"
                : connected
                  ? "Connected — setup incomplete"
                  : "Not connected"}
            </div>
            <div className="mt-1 text-sm opacity-70">
              {ready
                ? "Campaign API calls pass through Service governance and real media budgets are reserved in the organization wallet before campaign creation."
                : blockers.length
                  ? `Still required: ${blockers.join(", ")}.`
                  : "Connect the Google account that can manage this organization’s Ads account."}
            </div>
          </div>

          {connected && (
            <div className="mt-4 grid gap-2 text-xs text-white/35 sm:grid-cols-2">
              <div>Accounts: {snapshot.accounts.length}</div>
              <div>Service: {snapshot.service?.status || "not enabled"}</div>
              <div>
                Wallet: {snapshot.wallet
                  ? `${snapshot.wallet.status} · ${money(snapshot.wallet.available_balance, snapshot.wallet.currency)} available`
                  : "not configured"}
              </div>
              <div>
                Provider gateway: {snapshot.platformReady ? "ready" : "platform setup required"}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col items-stretch gap-3 sm:min-w-[240px]">
          {!connected ? (
            <a
              href={`/api/google-ads/auth?organizationId=${encodeURIComponent(organizationId)}`}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#D6A66A] px-5 py-3 text-sm font-semibold text-black"
            >
              Connect Google Ads
              <ExternalLink className="h-4 w-4" />
            </a>
          ) : (
            <button
              type="button"
              onClick={discover}
              disabled={working || !snapshot.platformReady}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#D6A66A] px-5 py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-45"
            >
              <RefreshCw className={`h-4 w-4 ${working ? "animate-spin" : ""}`} />
              {working ? "Checking Google Ads…" : snapshot.accounts.length ? "Refresh Ads accounts" : "Discover Ads accounts"}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="mt-7 border-t border-white/10 pt-6 text-sm text-white/35">
          Loading Google Ads configuration…
        </div>
      ) : connected && snapshot.accounts.length > 0 ? (
        <div className="mt-8 border-t border-white/10 pt-7">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.22em] text-white/30">
                Advertising account mapping
              </div>
              <h3 className="mt-2 text-xl font-medium">
                Google Ads accounts → Avantiqo entities
              </h3>
            </div>
            <div className={`text-xs ${allMapped ? "text-emerald-300" : "text-amber-200"}`}>
              {allMapped ? "All accounts mapped" : "Mapping required"}
            </div>
          </div>

          <div className="space-y-3">
            {snapshot.accounts.map((account) => (
              <div
                key={account.id}
                className="grid gap-4 rounded-2xl border border-white/10 bg-black/30 p-4 lg:grid-cols-[1fr_360px] lg:items-center"
              >
                <div>
                  <div className="font-medium text-white">
                    {account.name || `Google Ads ${account.external_id}`}
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
                </div>

                <select
                  value={account.entity_id || ""}
                  onChange={(event) => mapAccount(account.id, event.target.value)}
                  disabled={working}
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
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
