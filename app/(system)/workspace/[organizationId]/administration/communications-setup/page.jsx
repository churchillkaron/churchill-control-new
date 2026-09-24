"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Check,
  ExternalLink,
  LoaderCircle,
  MessageCircleMore,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import Image from "next/image";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

const GROUPS = [
  {
    id: "messaging",
    label: "Messaging & inbox",
    detail: "Customer conversations and direct messaging channels.",
    providers: ["meta", "whatsapp", "line", "telegram", "sms", "email", "push"],
  },
  {
    id: "social",
    label: "Social publishing",
    detail: "Business social identities used for publishing, replies and insights.",
    providers: ["threads", "tiktok", "youtube", "pinterest", "linkedin", "x"],
  },
  {
    id: "presence",
    label: "Business presence & reviews",
    detail: "Public locations, reputation and review-source connections.",
    providers: ["google-business", "tripadvisor", "yelp"],
  },
  {
    id: "reservations",
    label: "Reservations & hospitality",
    detail: "Restaurant reservation networks and hospitality partner connections.",
    providers: ["opentable"],
  },
  {
    id: "advertising",
    label: "Advertising",
    detail: "Paid media accounts used by Avantiqo marketing capabilities.",
    providers: ["google-ads"],
  },
  {
    id: "commerce",
    label: "Commerce",
    detail: "Storefronts and commerce platforms connected to canonical orders, products and inventory.",
    providers: ["shopify"],
  },
];

const PROVIDER_LOGOS = {
  meta: "/brand-icons/meta.svg",
  whatsapp: "/brand-icons/whatsapp.svg",
  line: "/brand-icons/line.svg",
  telegram: "/brand-icons/telegram.svg",
  email: "/icons/email.png",
  threads: "/brand-icons/threads.svg",
  tiktok: "/brand-icons/tiktok.svg",
  youtube: "/brand-icons/youtube.svg",
  pinterest: "/brand-icons/pinterest.svg",
  linkedin: "/brand-icons/linkedin.svg",
  x: "/brand-icons/x.svg",
  "google-business": "/brand-icons/google.svg",
  "google-ads": "/brand-icons/googleads.svg",
  shopify: "/brand-icons/shopify.svg",
  tripadvisor: "/brand-icons/tripadvisor.svg",
};

const PROVIDER_FALLBACKS = {
  sms: "SMS",
  push: "PN",
  yelp: "Y",
  opentable: "OT",
};

function stateLabel(row) {
  if (row?.state === "CONNECTED") return "Connected";
  if (row?.state === "SETUP_IN_PROGRESS") return "Finish setup";
  if (row?.state === "PLATFORM_SETUP") return "Avantiqo setup";
  if (row?.state === "COMING_SOON") return "Coming soon";
  return "Not connected";
}

function stateTone(row) {
  if (row?.state === "CONNECTED") return "bg-emerald-50 text-emerald-700";
  if (row?.state === "SETUP_IN_PROGRESS") return "bg-amber-50 text-amber-700";
  if (row?.state === "PLATFORM_SETUP") return "bg-[#F7EFE5] text-[#8A633C]";
  return "bg-[#F0E7DA] text-[#8A633C]";
}

function capabilityLabel(status) {
  if (status === "READY") return "Ready";
  if (status === "SETUP_REQUIRED") return "Setup";
  return "Unavailable";
}

export default function CommunicationSetupPage() {
  const business = useBusinessContext();
  const organizationId = business?.organization_id || business?.organization?.id || null;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!organizationId) return;
    try {
      if (quiet) setRefreshing(true);
      else setLoading(true);
      setError("");
      const response = await fetch(
        `/api/administration/integrations/catalog?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: "no-store" },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) {
        throw new Error(body?.error || "Unable to load business connections");
      }
      setRows(Array.isArray(body.rows) ? body.rows : []);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load business connections");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [organizationId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const message = params.get("message");
    const meta = params.get("meta");
    const google = params.get("google");
    const googleAds = params.get("googleAds");
    if (message) setNotice(message);
    else if (meta === "connected") setNotice("Meta connected. Avantiqo is verifying the enabled Facebook and Instagram capabilities.");
    else if (meta === "error") setNotice("Meta authorization did not complete. Review the provider state below and retry if needed.");
    else if (google) setNotice("Google Business authorization returned. Avantiqo is refreshing the business-location connection.");
    else if (googleAds) setNotice("Google Ads authorization returned. Avantiqo is refreshing the advertiser connection.");
  }, []);

  useEffect(() => {
    if (business?.ready) load();
  }, [business?.ready, load]);

  const indexed = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
  const visibleGroups = useMemo(() => GROUPS.map((group) => ({
    ...group,
    rows: group.providers.map((id) => indexed.get(id)).filter(Boolean),
  })).filter((group) => group.rows.length > 0), [indexed]);
  const connected = useMemo(() => rows.filter((row) => row.state === "CONNECTED").length, [rows]);
  const actionRequired = useMemo(() => rows.filter((row) => row.state === "ACTION_REQUIRED" || row.state === "SETUP_IN_PROGRESS").length, [rows]);
  const platformPending = useMemo(() => rows.filter((row) => row.state === "PLATFORM_SETUP").length, [rows]);

  if (loading || !business?.ready) {
    return (
      <div className="flex min-h-[460px] items-center justify-center bg-[#F7F6F3] text-[10px] text-[#817B73]">
        <LoaderCircle size={14} className="mr-2 animate-spin" />
        Loading channels & connections…
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-90px)] bg-[#F7F6F3] px-4 py-5 text-[#28231E] md:px-6">
      <div className="mx-auto max-w-[1180px]">
        <header className="flex flex-col gap-4 border-b border-black/[0.07] pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.17em] text-[#A37849]">
              <MessageCircleMore size={12} />Administration · Channels & connections
            </div>
            <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.04em]">Connect the company</h1>
            <p className="mt-2 max-w-3xl text-[11px] leading-5 text-[#777169]">
              Connect only the business accounts this organization actually uses. Avantiqo manages the technical integration; the company authorizes and owns its provider accounts, identities and merchant relationships.
            </p>
          </div>
          <button
            type="button"
            onClick={() => load({ quiet: true })}
            disabled={refreshing}
            className="inline-flex h-9 items-center gap-2 self-start rounded-xl border border-black/[0.07] bg-white px-3 text-[9px] font-semibold text-[#655D54] disabled:opacity-50 md:self-auto"
          >
            <RefreshCw size={10} className={refreshing ? "animate-spin" : ""} />
            Refresh status
          </button>
        </header>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-black/[0.07] bg-white px-4 py-3">
            <div className="text-[20px] font-semibold">{connected}/{rows.length}</div>
            <div className="mt-1 text-[8px] uppercase tracking-[0.11em] text-[#938B82]">Connected</div>
          </div>
          <div className="rounded-2xl border border-black/[0.07] bg-white px-4 py-3">
            <div className="text-[20px] font-semibold">{actionRequired}</div>
            <div className="mt-1 text-[8px] uppercase tracking-[0.11em] text-[#938B82]">Customer action</div>
          </div>
          <div className="rounded-2xl border border-black/[0.07] bg-white px-4 py-3">
            <div className="text-[20px] font-semibold">{platformPending}</div>
            <div className="mt-1 text-[8px] uppercase tracking-[0.11em] text-[#938B82]">Avantiqo/provider setup</div>
          </div>
        </div>

        {error ? <div className="mt-4 rounded-xl border border-red-700/15 bg-red-50 px-4 py-3 text-[10px] text-red-800">{error}</div> : null}
        {notice ? <div className="mt-4 rounded-xl border border-emerald-700/15 bg-emerald-50 px-4 py-3 text-[10px] text-emerald-800">{notice}</div> : null}

        <div className="mt-5 space-y-5">
          {visibleGroups.map((group) => (
            <section key={group.id}>
              <div className="mb-2.5 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 className="text-[12px] font-semibold text-[#433B33]">{group.label}</h2>
                  <p className="mt-0.5 text-[9px] text-[#8A837A]">{group.detail}</p>
                </div>
                <div className="text-[8px] text-[#A09990]">{group.rows.filter((row) => row.state === "CONNECTED").length}/{group.rows.length} connected</div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {group.rows.map((row) => {
                  const connectedRow = row.state === "CONNECTED";
                  const canConnect = row.action === "CONNECT" && row.connectPath;
                  const connectHref = canConnect
                    ? `${row.connectPath}${row.connectPath.includes("?") ? "&" : "?"}organizationId=${encodeURIComponent(organizationId)}&onboarding=1`
                    : null;
                  const dedicatedManage = {
                    whatsapp: `/workspace/${encodeURIComponent(organizationId)}/administration/integrations/whatsapp-connect?onboarding=1`,
                    line: `/workspace/${encodeURIComponent(organizationId)}/administration/integrations/line-connect?onboarding=1`,
                    email: `/workspace/${encodeURIComponent(organizationId)}/administration/integrations/email-connect?onboarding=1`,
                    sms: `/workspace/${encodeURIComponent(organizationId)}/administration/sms-setup?onboarding=1`,
                    telegram: `/workspace/${encodeURIComponent(organizationId)}/administration/telegram-setup?onboarding=1`,
                    "google-business": `/workspace/${encodeURIComponent(organizationId)}/administration/google-business-setup?onboarding=1`,
                    "google-ads": `/workspace/${encodeURIComponent(organizationId)}/administration/google-ads-setup?onboarding=1`,
                    tripadvisor: `/workspace/${encodeURIComponent(organizationId)}/administration/integrations/tripadvisor-connect?onboarding=1`,
                    shopify: `/workspace/${encodeURIComponent(organizationId)}/administration/integrations/shopify-connect?onboarding=1`,
                  }[row.id] || null;
                  const manageHref = dedicatedManage
                    || (connectedRow || row.state === "SETUP_IN_PROGRESS"
                      ? `/workspace/${encodeURIComponent(organizationId)}/administration/channel-settings/${encodeURIComponent(row.id)}?onboarding=1`
                      : row.action === "MANAGE" && row.detailAnchor
                        ? `/workspace/${encodeURIComponent(organizationId)}/administration/integrations?onboarding=1#${encodeURIComponent(row.detailAnchor)}`
                        : null);
                  const capabilities = Array.isArray(row.capabilities) ? row.capabilities : [];
                  return (
                    <article key={row.id} className="flex min-h-[210px] flex-col rounded-[20px] border border-black/[0.07] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#D9C7B0] bg-[#FBF5EC] p-1.5 text-[9px] font-semibold text-[#8A633C]">
                            {PROVIDER_LOGOS[row.id] ? (
                              <Image src={PROVIDER_LOGOS[row.id]} alt="" width={24} height={24} className="h-full w-full object-contain" />
                            ) : (
                              PROVIDER_FALLBACKS[row.id] || row.name?.slice(0, 2) || "•"
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-[12px] font-semibold text-[#3A332B]">{row.name}</div>
                            <div className="mt-0.5 text-[8px] uppercase tracking-[0.1em] text-[#9A9288]">{row.category}</div>
                          </div>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.08em] ${stateTone(row)}`}>{stateLabel(row)}</span>
                      </div>

                      <div className="mt-3 text-[9px] leading-5 text-[#817B73]">{row.detail || row.description}</div>
                      {row.account ? <div className="mt-2 truncate text-[9px] font-medium text-[#5F554B]">{row.account}</div> : null}

                      {capabilities.length ? (
                        <div className="mt-3 space-y-1.5 border-t border-black/[0.06] pt-3">
                          {capabilities.slice(0, 6).map((capability) => (
                            <div key={capability.id} className="flex items-center justify-between gap-3 text-[8px]">
                              <span className="min-w-0 truncate text-[#6F6860]">{capability.label}</span>
                              <span className={capability.status === "READY" ? "text-emerald-700" : capability.status === "SETUP_REQUIRED" ? "text-amber-700" : "text-[#AAA39A]"}>{capabilityLabel(capability.status)}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      <div className="mt-auto pt-4">
                        {connectHref ? (
                          <a href={connectHref} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#B98A52]/25 bg-[#D6A66A] px-3 text-[9px] font-semibold text-[#2C2117] hover:bg-[#C99A5E]">
                            {row.actionLabel || "Connect"}<ExternalLink size={9} />
                          </a>
                        ) : manageHref ? (
                          <a href={manageHref} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-black/[0.08] bg-white px-3 text-[9px] font-semibold text-[#5A5249]">
                            {row.state === "SETUP_IN_PROGRESS" ? "Finish setup" : "Manage"}<ExternalLink size={9} />
                          </a>
                        ) : connectedRow ? (
                          <span className="inline-flex items-center gap-1.5 text-[9px] font-semibold text-emerald-700"><Check size={10} />Ready</span>
                        ) : row.state === "PLATFORM_SETUP" ? (
                          <span className="inline-flex items-center gap-1.5 text-[9px] font-semibold text-[#8A633C]"><ShieldCheck size={10} />No customer action yet</span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-[9px] text-[#9A9188]"><BadgeCheck size={10} />Optional</span>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
