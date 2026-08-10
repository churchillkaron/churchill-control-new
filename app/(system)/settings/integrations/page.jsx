"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ExternalLink,
  MapPin,
  RefreshCw,
  Settings2,
} from "lucide-react";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import GoogleAdsIntegrationCard from "@/components/administration/integrations/GoogleAdsIntegrationCard";

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString();
}

function connectionState(connection) {
  if (!connection || String(connection.status || "").toUpperCase() !== "ACTIVE") {
    return {
      label: "Not connected",
      detail: "Connect the Google account that owns or manages this organization’s Business Profile.",
      tone: "neutral",
    };
  }

  const discovery = String(
    connection.metadata?.location_discovery_status || "PENDING"
  ).toUpperCase();

  if (discovery === "READY") {
    return {
      label: "Connected",
      detail: "Google authorization is active and Business Profile locations are ready.",
      tone: "ready",
    };
  }

  if (discovery === "API_ACCESS_PENDING") {
    return {
      label: "Connected — Business Profile API approval pending",
      detail: "The organization’s Google authorization is valid. Avantiqo is waiting for Google to enable Business Profile API access for the platform Cloud project; reconnecting Google is not required.",
      tone: "warning",
    };
  }

  if (discovery === "RATE_LIMITED") {
    return {
      label: "Connected — Google quota cooldown",
      detail: "The OAuth authorization is safe. Location discovery hit a temporary Google quota window and will be checked again later.",
      tone: "warning",
    };
  }

  return {
    label: "Connected — location setup pending",
    detail: "The OAuth authorization is active. Finish location discovery and map each Google location to an Avantiqo entity.",
    tone: "warning",
  };
}

export default function IntegrationsPage() {
  const business = useBusinessContext();
  const [urlOrganizationId, setUrlOrganizationId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [snapshot, setSnapshot] = useState({
    connection: null,
    locations: [],
    entities: [],
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setUrlOrganizationId(params.get("organizationId"));
    setNotice(params.get("message") || "");
  }, []);

  const organizationId =
    business?.organization_id || business?.organization?.id || urlOrganizationId || null;

  const load = useCallback(async () => {
    if (!organizationId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/administration/integrations/google-business?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: "no-store" }
      );
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Unable to load integrations");
      }
      setSnapshot({
        connection: data.connection || null,
        locations: data.locations || [],
        entities: data.entities || [],
      });
    } catch (loadError) {
      setError(loadError?.message || "Unable to load integrations");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (!business?.ready) return;
    load();
  }, [business?.ready, load]);

  async function runAction(payload) {
    if (!organizationId) return null;

    setWorking(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        "/api/administration/integrations/google-business",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ organizationId, ...payload }),
        }
      );
      const data = await response.json();

      if (data.connection || data.locations || data.entities) {
        setSnapshot({
          connection: data.connection || null,
          locations: data.locations || [],
          entities: data.entities || [],
        });
      }

      if (!response.ok || !data.success) {
        const retryText =
          data.retryAt && data.code !== "GOOGLE_API_ACCESS_PENDING"
            ? ` Retry after ${formatDate(data.retryAt)}.`
            : "";
        throw new Error(`${data.error || "Google Business action failed"}${retryText}`);
      }

      setSnapshot({
        connection: data.connection || null,
        locations: data.locations || [],
        entities: data.entities || [],
      });
      return data;
    } catch (actionError) {
      setError(actionError?.message || "Google Business action failed");
      return null;
    } finally {
      setWorking(false);
    }
  }

  async function discover(force = false) {
    const result = await runAction({ action: "discover", force });
    if (result) {
      setNotice(
        result.locations?.length
          ? `Found ${result.locations.length} Google Business Profile location${result.locations.length === 1 ? "" : "s"}.`
          : "Google location discovery completed."
      );
    }
  }

  async function mapLocation(assetId, entityId) {
    if (!entityId) return;
    const result = await runAction({
      action: "map-location",
      assetId,
      entityId,
    });
    if (result) setNotice("Google location mapping saved.");
  }

  const connection = snapshot.connection;
  const connected = String(connection?.status || "").toUpperCase() === "ACTIVE";
  const state = connectionState(connection);
  const discoveryStatus = String(
    connection?.metadata?.location_discovery_status || ""
  ).toUpperCase();
  const apiAccessPending = discoveryStatus === "API_ACCESS_PENDING";
  const retryAt = connection?.metadata?.location_discovery_retry_at || null;
  const retryBlocked = Boolean(
    !apiAccessPending && retryAt && new Date(retryAt).getTime() > Date.now()
  );
  const allMapped =
    snapshot.locations.length > 0 && snapshot.locations.every((location) => location.entity_id);

  const statusClass = useMemo(() => {
    if (state.tone === "ready") {
      return "border-emerald-400/20 bg-emerald-400/10 text-emerald-100";
    }
    if (state.tone === "warning") {
      return "border-amber-400/20 bg-amber-400/10 text-amber-100";
    }
    return "border-white/10 bg-white/[0.04] text-white/70";
  }, [state.tone]);

  if (!business?.ready || loading) {
    return (
      <main className="min-h-screen bg-black p-8 text-white">
        <div className="mx-auto max-w-6xl rounded-[32px] border border-white/10 bg-white/[0.03] p-8 text-white/45">
          Loading integrations…
        </div>
      </main>
    );
  }

  if (!organizationId) {
    return (
      <main className="min-h-screen bg-black p-8 text-white">
        <div className="mx-auto max-w-6xl rounded-[32px] border border-amber-400/20 bg-amber-400/[0.06] p-8 text-amber-100">
          Select an organization before managing external integrations.
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black p-6 text-white lg:p-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-[#D6A66A]">
            <Settings2 className="h-4 w-4" />
            Administration / Integrations
          </div>
          <h1 className="mt-4 text-5xl font-light lg:text-6xl">Integrations</h1>
          <p className="mt-4 max-w-3xl text-lg leading-7 text-white/45">
            Connect organization-owned services once, then map external accounts and locations to the correct Avantiqo business entities.
          </p>
        </div>

        {(error || notice) && (
          <div
            className={`mb-6 rounded-2xl border px-5 py-4 text-sm ${
              error
                ? "border-red-400/20 bg-red-400/10 text-red-100"
                : "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
            }`}
          >
            {error || notice}
          </div>
        )}

        <section className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 lg:p-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-3xl">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
                  <Building2 className="h-6 w-6 text-[#D6A66A]" />
                </div>
                <div>
                  <div className="text-sm text-white/40">Google</div>
                  <h2 className="text-2xl font-medium">Google Business Profile</h2>
                </div>
              </div>

              <div className={`mt-5 rounded-2xl border px-4 py-4 ${statusClass}`}>
                <div className="flex items-center gap-2 font-medium">
                  {state.tone === "ready" ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : state.tone === "warning" ? (
                    <AlertTriangle className="h-4 w-4" />
                  ) : null}
                  {state.label}
                </div>
                <div className="mt-1 text-sm opacity-70">{state.detail}</div>
              </div>

              {connected && (
                <div className="mt-4 grid gap-2 text-xs text-white/35 sm:grid-cols-2">
                  <div>Authorization: active</div>
                  <div>Locations: {snapshot.locations.length}</div>
                  {connection.authorized_at && (
                    <div>Authorized: {formatDate(connection.authorized_at)}</div>
                  )}
                  {discoveryStatus && <div>Discovery: {discoveryStatus}</div>}
                </div>
              )}
            </div>

            <div className="flex flex-col items-stretch gap-3 sm:min-w-[240px]">
              {!connected ? (
                <a
                  href={`/api/google/auth?organizationId=${encodeURIComponent(organizationId)}`}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#D6A66A] px-5 py-3 text-sm font-semibold text-black"
                >
                  Connect Google Business Profile
                  <ExternalLink className="h-4 w-4" />
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => discover(apiAccessPending)}
                  disabled={working || retryBlocked}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#D6A66A] px-5 py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <RefreshCw className={`h-4 w-4 ${working ? "animate-spin" : ""}`} />
                  {working
                    ? "Checking Google…"
                    : apiAccessPending
                      ? "Check Google access"
                      : snapshot.locations.length
                        ? "Refresh locations"
                        : "Discover locations"}
                </button>
              )}

              {apiAccessPending && (
                <div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.06] px-3 py-2 text-xs leading-5 text-amber-100/70">
                  Automatic review/location discovery is paused while Google Business Profile API access is pending. The saved Google authorization remains active.
                </div>
              )}

              {retryBlocked && (
                <div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.06] px-3 py-2 text-xs leading-5 text-amber-100/70">
                  Temporary Google quota cooldown until {formatDate(retryAt)}. The connection remains active.
                </div>
              )}
            </div>
          </div>

          {connected && snapshot.locations.length > 0 && (
            <div className="mt-8 border-t border-white/10 pt-7">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.22em] text-white/30">Location mapping</div>
                  <h3 className="mt-2 text-xl font-medium">Google locations → Avantiqo entities</h3>
                </div>
                <div className={`text-xs ${allMapped ? "text-emerald-300" : "text-amber-200"}`}>
                  {allMapped ? "All locations mapped" : "Mapping required"}
                </div>
              </div>

              <div className="space-y-3">
                {snapshot.locations.map((location) => (
                  <div
                    key={location.id}
                    className="grid gap-4 rounded-2xl border border-white/10 bg-black/30 p-4 lg:grid-cols-[1fr_360px] lg:items-center"
                  >
                    <div className="flex items-start gap-3">
                      <MapPin className="mt-0.5 h-5 w-5 text-[#D6A66A]" />
                      <div>
                        <div className="font-medium text-white">{location.name || "Google Business location"}</div>
                        <div className="mt-1 text-xs text-white/35">
                          {location.metadata?.account_title || location.metadata?.account_name || "Google Business Profile"}
                        </div>
                      </div>
                    </div>

                    <select
                      value={location.entity_id || ""}
                      onChange={(event) => mapLocation(location.id, event.target.value)}
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
          )}
        </section>

        <GoogleAdsIntegrationCard
          organizationId={organizationId}
          onNotice={setNotice}
          onError={setError}
        />

        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-4 text-xs leading-5 text-white/35">
          Google credentials are managed centrally by Avantiqo. Customers never enter client IDs, developer tokens, API keys, or passwords. Each organization authorizes its own Google account, and discovered Business Profile locations and Ads accounts remain isolated and mapped to that organization’s entity structure.
        </div>
      </div>
    </main>
  );
}
