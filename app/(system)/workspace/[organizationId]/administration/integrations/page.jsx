"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Link2,
  MapPin,
  RefreshCw,
  Settings2,
  ShieldCheck,
} from "lucide-react";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import GoogleAdsIntegrationCard from "@/components/administration/integrations/GoogleAdsIntegrationCard";

function upper(value) {
  return String(value ?? "").trim().toUpperCase();
}

function toneClass(state) {
  if (state === "CONNECTED") {
    return "border-emerald-400/20 bg-emerald-400/10 text-emerald-100";
  }
  if (state === "SETUP_IN_PROGRESS" || state === "PLATFORM_SETUP") {
    return "border-amber-400/20 bg-amber-400/10 text-amber-100";
  }
  return "border-white/10 bg-white/[0.035] text-white/65";
}

function capabilityTone(status) {
  if (status === "READY") {
    return { dot: "bg-emerald-300", text: "text-emerald-200", label: "Ready" };
  }
  if (status === "SETUP_REQUIRED") {
    return { dot: "bg-amber-300", text: "text-amber-100", label: "Setup required" };
  }
  return { dot: "bg-white/25", text: "text-white/40", label: "Not available" };
}

function CapabilityList({ capabilities }) {
  if (!Array.isArray(capabilities) || !capabilities.length) return null;

  return (
    <div className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
      {capabilities.map((capability, index) => {
        const tone = capabilityTone(capability.status);
        return (
          <div
            key={capability.id}
            className={`flex items-start justify-between gap-4 px-4 py-3 ${index ? "border-t border-white/10" : ""}`}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} />
                <span className="text-xs font-medium text-white/80">{capability.label}</span>
              </div>
              {capability.detail ? (
                <div className="mt-1 pl-3.5 text-[11px] leading-4 text-white/35">
                  {capability.detail}
                </div>
              ) : null}
            </div>
            <span className={`shrink-0 text-[10px] font-medium ${tone.text}`}>{tone.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function IntegrationsPage() {
  const business = useBusinessContext();
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalog, setCatalog] = useState([]);
  const [platformOperator, setPlatformOperator] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(true);
  const [googleWorking, setGoogleWorking] = useState(false);
  const [googleSnapshot, setGoogleSnapshot] = useState({ connection: null, locations: [], entities: [] });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const organizationId = business?.organization_id || business?.organization?.id || null;

  const loadCatalog = useCallback(async () => {
    if (!organizationId) return;
    setCatalogLoading(true);
    try {
      const response = await fetch(
        `/api/administration/integrations/catalog?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: "no-store" }
      );
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Unable to load integrations");
      setCatalog(Array.isArray(data.rows) ? data.rows : []);
      setPlatformOperator(data.platformOperator === true);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load integrations");
    } finally {
      setCatalogLoading(false);
    }
  }, [organizationId]);

  const loadGoogleBusiness = useCallback(async () => {
    if (!organizationId) return;
    setGoogleLoading(true);
    try {
      const response = await fetch(
        `/api/administration/integrations/google-business?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: "no-store" }
      );
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Unable to load Google Business Profile");
      setGoogleSnapshot({ connection: data.connection || null, locations: data.locations || [], entities: data.entities || [] });
    } catch (loadError) {
      setError(loadError?.message || "Unable to load Google Business Profile");
    } finally {
      setGoogleLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (!business?.ready || !organizationId) return;
    loadCatalog();
    loadGoogleBusiness();
  }, [business?.ready, organizationId, loadCatalog, loadGoogleBusiness]);

  async function runGoogleAction(payload) {
    if (!organizationId) return null;
    setGoogleWorking(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/administration/integrations/google-business", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, ...payload }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        if (data.code === "GOOGLE_API_ACCESS_PENDING") {
          setNotice("Google Business Profile is connected. Avantiqo is completing the remaining setup.");
          return data;
        }
        throw new Error(data.error || "Google Business action failed");
      }
      setGoogleSnapshot({ connection: data.connection || null, locations: data.locations || [], entities: data.entities || [] });
      await loadCatalog();
      return data;
    } catch (actionError) {
      setError(actionError?.message || "Google Business action failed");
      return null;
    } finally {
      setGoogleWorking(false);
    }
  }

  async function discoverGoogle() {
    const result = await runGoogleAction({ action: "discover", force: true });
    if (result?.success) {
      setNotice(
        result.locations?.length
          ? `Google Business Profile updated. ${result.locations.length} location${result.locations.length === 1 ? "" : "s"} found.`
          : "Google Business Profile checked."
      );
    }
  }

  async function mapLocation(assetId, entityId) {
    if (!entityId) return;
    const result = await runGoogleAction({ action: "map-location", assetId, entityId });
    if (result?.success) setNotice("Google Business location mapping saved.");
  }

  const googleConnected = upper(googleSnapshot.connection?.status) === "ACTIVE";
  const googleSetupPending = googleConnected && upper(googleSnapshot.connection?.metadata?.location_discovery_status) !== "READY";
  const googleCatalog = catalog.find((row) => row.id === "google-business") || null;
  const googlePlatformReady = googleCatalog?.platformReady !== false;
  const allLocationsMapped = googleSnapshot.locations.length > 0 && googleSnapshot.locations.every((location) => location.entity_id);
  const activeCount = useMemo(() => catalog.filter((row) => row.state === "CONNECTED").length, [catalog]);

  if (!business?.ready) {
    return (
      <main className="min-h-screen bg-black p-8 text-white">
        <div className="mx-auto max-w-6xl text-white/45">Loading integrations…</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black p-6 text-white lg:p-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-[#D6A66A]">
              <Settings2 className="h-4 w-4" />
              Administration / Integrations
            </div>
            <h1 className="mt-4 text-5xl font-light lg:text-6xl">Integrations</h1>
            <p className="mt-4 max-w-3xl text-lg leading-7 text-white/45">
              Connect the external business accounts this organization uses. Avantiqo handles the technical infrastructure behind them.
            </p>
          </div>
          {platformOperator ? (
            <a
              href={`/workspace/${encodeURIComponent(organizationId)}/administration/integrations/platform-setup`}
              className="inline-flex items-center gap-2 rounded-xl border border-[#D6A66A]/30 bg-[#D6A66A]/10 px-4 py-2.5 text-xs font-medium text-[#E5C18D]"
            >
              <ShieldCheck className="h-4 w-4" />
              Avantiqo Provider Setup
            </a>
          ) : null}
        </div>

        {(error || notice) && (
          <div className={`mb-6 rounded-2xl border px-5 py-4 text-sm ${error ? "border-red-400/20 bg-red-400/10 text-red-100" : "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"}`}>
            {error || notice}
          </div>
        )}

        <section className="rounded-[30px] border border-white/10 bg-white/[0.025] p-6 lg:p-7">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.22em] text-white/30">Business connections</div>
              <h2 className="mt-2 text-2xl font-medium">Connected services</h2>
            </div>
            <div className="text-sm text-white/40">{catalogLoading ? "Loading…" : `${activeCount} connected`}</div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {catalog.map((integration) => {
              const canConnect = integration.action === "CONNECT" && integration.connectPath;
              const canManage = integration.action === "MANAGE" && integration.detailAnchor;
              return (
                <article
                  key={integration.id}
                  className={`rounded-2xl border border-white/10 bg-black/25 p-5 ${integration.id === "meta" ? "md:col-span-2 xl:col-span-2" : ""}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.18em] text-white/30">{integration.category}</div>
                      <h3 className="mt-2 text-lg font-medium text-white">{integration.name}</h3>
                    </div>
                    <div className={`rounded-full border px-2.5 py-1 text-[10px] ${toneClass(integration.state)}`}>{integration.label}</div>
                  </div>

                  <p className="mt-3 min-h-[48px] text-sm leading-6 text-white/42">{integration.description}</p>

                  {integration.account ? (
                    <div className="mt-3 truncate text-xs text-white/55">Connected: {integration.account}</div>
                  ) : null}

                  {integration.detail ? (
                    <div className="mt-2 text-xs leading-5 text-white/35">{integration.detail}</div>
                  ) : null}

                  <CapabilityList capabilities={integration.capabilities} />

                  <div className="mt-5">
                    {canConnect ? (
                      <a
                        href={`${integration.connectPath}?organizationId=${encodeURIComponent(organizationId)}`}
                        className="inline-flex items-center gap-2 rounded-xl bg-[#D6A66A] px-4 py-2.5 text-xs font-semibold text-black"
                      >
                        {integration.actionLabel || "Connect"}
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : canManage ? (
                      <a href={`#${integration.detailAnchor}`} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs font-medium text-white/70">
                        Manage
                        <Link2 className="h-3.5 w-3.5" />
                      </a>
                    ) : (
                      <span className="text-xs text-white/30">
                        {integration.state === "PLATFORM_SETUP"
                          ? "No customer action required"
                          : integration.state === "COMING_SOON"
                            ? "Not available yet"
                            : "No action required"}
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section id="google-business" className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.025] p-6 lg:p-7">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <div className="text-xs uppercase tracking-[0.22em] text-white/30">Business presence</div>
              <h2 className="mt-2 text-2xl font-medium">Google Business Profile</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/45">Connect the business profile used for locations, reviews and public business information.</p>
            </div>
            <div className={`rounded-full border px-3 py-1 text-xs ${googleConnected ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200" : "border-white/10 bg-white/[0.04] text-white/50"}`}>
              {googleConnected ? "Connected" : googlePlatformReady ? "Not connected" : "Avantiqo setup"}
            </div>
          </div>

          {!googleConnected && !googlePlatformReady ? (
            <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-400/15 bg-amber-400/[0.06] px-4 py-4 text-amber-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="text-sm font-medium">Avantiqo is completing Google setup</div>
                <div className="mt-1 text-xs leading-5 text-amber-100/65">No customer action is required. The Connect button will appear automatically when the platform connection is ready.</div>
              </div>
            </div>
          ) : !googleConnected ? (
            <a href={`/api/google/auth?organizationId=${encodeURIComponent(organizationId)}`} className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-[#D6A66A] px-5 py-3 text-sm font-semibold text-black">
              Connect Google Business Profile
              <ExternalLink className="h-4 w-4" />
            </a>
          ) : googleSetupPending ? (
            <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-400/15 bg-amber-400/[0.06] px-4 py-4 text-amber-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="text-sm font-medium">Connected — setup in progress</div>
                <div className="mt-1 text-xs leading-5 text-amber-100/65">The Google connection is saved. Avantiqo is completing the remaining setup; reconnecting is not required.</div>
              </div>
            </div>
          ) : (
            <div className="mt-5 flex items-center gap-2 text-sm text-emerald-200">
              <CheckCircle2 className="h-4 w-4" />
              Google Business Profile is ready.
            </div>
          )}

          {googleConnected ? (
            <button type="button" onClick={discoverGoogle} disabled={googleWorking} className="mt-5 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs font-medium text-white/70 disabled:opacity-50">
              <RefreshCw className={`h-3.5 w-3.5 ${googleWorking ? "animate-spin" : ""}`} />
              {googleWorking ? "Checking…" : "Refresh connection"}
            </button>
          ) : null}

          {!googleLoading && googleSnapshot.locations.length > 0 ? (
            <div className="mt-7 border-t border-white/10 pt-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] text-white/30">Locations</div>
                  <h3 className="mt-1 text-lg font-medium">Business location mapping</h3>
                </div>
                <div className={`text-xs ${allLocationsMapped ? "text-emerald-300" : "text-amber-200"}`}>{allLocationsMapped ? "Complete" : "Action required"}</div>
              </div>

              <div className="space-y-3">
                {googleSnapshot.locations.map((location) => (
                  <div key={location.id} className="grid gap-4 rounded-2xl border border-white/10 bg-black/25 p-4 lg:grid-cols-[1fr_320px] lg:items-center">
                    <div className="flex items-start gap-3">
                      <MapPin className="mt-0.5 h-4 w-4 text-[#D6A66A]" />
                      <div>
                        <div className="font-medium text-white">{location.name || "Google Business location"}</div>
                        <div className="mt-1 text-xs text-white/35">Map this external location to the correct business entity.</div>
                      </div>
                    </div>
                    <select value={location.entity_id || ""} onChange={(event) => mapLocation(location.id, event.target.value)} disabled={googleWorking} className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none disabled:opacity-50">
                      <option value="">Select business entity</option>
                      {googleSnapshot.entities.map((entity) => (
                        <option key={entity.id} value={entity.id}>{entity.display_name || entity.legal_name || entity.code}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <GoogleAdsIntegrationCard
          organizationId={organizationId}
          onNotice={(message) => {
            setNotice(message);
            loadCatalog();
          }}
          onError={setError}
        />
      </div>
    </main>
  );
}
