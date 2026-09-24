"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Check, ExternalLink, LoaderCircle, RefreshCw, ShieldCheck, Unplug } from "lucide-react";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

const PROVIDER_LOGOS = {
  meta: "/brand-icons/meta.svg",
  threads: "/brand-icons/threads.svg",
  tiktok: "/brand-icons/tiktok.svg",
  youtube: "/brand-icons/youtube.svg",
  pinterest: "/brand-icons/pinterest.svg",
  linkedin: "/brand-icons/linkedin.svg",
  x: "/brand-icons/x.svg",
};

function clean(value) { return String(value ?? "").trim(); }

export default function ChannelSettingsPage({ params }) {
  const business = useBusinessContext();
  const organizationId = business?.organization_id || business?.organization?.id || null;
  const provider = clean(params?.provider).toLowerCase();
  const [row, setRow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [onboarding, setOnboarding] = useState(false);

  const load = useCallback(async () => {
    if (!organizationId || !provider) return;
    try {
      setLoading(true);
      setError("");
      const response = await fetch(`/api/administration/integrations/catalog?organizationId=${encodeURIComponent(organizationId)}`, { cache:"no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to load channel settings");
      const match = (body.rows || []).find((item) => item.id === provider) || null;
      if (!match) throw new Error("Channel is not available for this organization");
      setRow(match);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load channel settings");
    } finally {
      setLoading(false);
    }
  }, [organizationId, provider]);

  useEffect(() => {
    setOnboarding(new URLSearchParams(window.location.search).get("onboarding") === "1");
  }, []);
  useEffect(() => { if (business?.ready) load(); }, [business?.ready, load]);

  const backHref = onboarding
    ? `/workspace/${encodeURIComponent(organizationId || "")}/administration/communications-setup?onboarding=1`
    : `/workspace/${encodeURIComponent(organizationId || "")}/administration/integrations`;
  const connected = row?.state === "CONNECTED" || row?.state === "SETUP_IN_PROGRESS";
  const connectHref = row?.connectPath
    ? `${row.connectPath}${row.connectPath.includes("?") ? "&" : "?"}organizationId=${encodeURIComponent(organizationId || "")}${onboarding ? "&onboarding=1" : ""}`
    : null;
  const capabilities = useMemo(() => Array.isArray(row?.capabilities) ? row.capabilities : [], [row]);

  async function disconnect() {
    if (!organizationId || !provider || working) return;
    if (!window.confirm(`Disconnect ${row?.name || provider} from this organization?`)) return;
    try {
      setWorking(true);
      setError("");
      setNotice("");
      const response = await fetch("/api/platform/channels/disconnect", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body:JSON.stringify({ organizationId, provider }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Channel disconnect failed");
      setNotice("Channel disconnected and its active provider credential was deactivated.");
      await load();
    } catch (actionError) {
      setError(actionError?.message || "Channel disconnect failed");
    } finally {
      setWorking(false);
    }
  }

  if (loading || !business?.ready) {
    return <div className="flex min-h-[460px] items-center justify-center bg-[#F7F6F3] text-[10px] text-[#817B73]"><LoaderCircle size={14} className="mr-2 animate-spin" />Loading channel settings…</div>;
  }

  return (
    <main className="min-h-screen bg-[#F7F6F3] p-6 text-[#2D2822] lg:p-10">
      <div className="mx-auto max-w-4xl">
        <a href={backHref} className="text-[9px] font-semibold text-[#8A633C]">← {onboarding ? "Channels & connections" : "Integrations"}</a>
        <section className="mt-5 rounded-[24px] border border-black/[0.07] bg-white p-6 lg:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#D9C7B0] bg-[#FBF5EC] p-2">
                {PROVIDER_LOGOS[provider] ? <Image src={PROVIDER_LOGOS[provider]} alt="" width={28} height={28} className="h-full w-full object-contain" /> : <span className="text-[10px] font-semibold text-[#8A633C]">{provider.slice(0,2).toUpperCase()}</span>}
              </div>
              <div>
                <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#A37849]">{row?.category || "Business channel"}</div>
                <h1 className="mt-1 text-[28px] font-semibold tracking-[-0.04em]">{row?.name || provider}</h1>
                <p className="mt-2 max-w-2xl text-[10px] leading-5 text-[#777169]">{row?.detail || row?.description}</p>
              </div>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-[8px] font-semibold ${row?.state === "CONNECTED" ? "bg-emerald-50 text-emerald-700" : row?.state === "SETUP_IN_PROGRESS" ? "bg-amber-50 text-amber-700" : "bg-[#F0E7DA] text-[#8A633C]"}`}>{row?.label || row?.state || "Not connected"}</span>
          </div>

          {error ? <div className="mt-4 rounded-xl border border-red-700/15 bg-red-50 px-4 py-3 text-[10px] text-red-800">{error}</div> : null}
          {notice ? <div className="mt-4 rounded-xl border border-emerald-700/15 bg-emerald-50 px-4 py-3 text-[10px] text-emerald-800">{notice}</div> : null}

          {row?.account ? (
            <div className="mt-5 rounded-2xl border border-black/[0.07] bg-[#FCFBF8] p-4">
              <div className="text-[8px] uppercase tracking-[0.1em] text-[#938B82]">Connected identity</div>
              <div className="mt-1 text-[11px] font-semibold text-[#40382F]">{row.account}</div>
            </div>
          ) : null}

          {capabilities.length ? (
            <div className="mt-5 rounded-2xl border border-black/[0.07] bg-[#FCFBF8] p-4">
              <div className="text-[9px] font-semibold text-[#4C443B]">Capabilities</div>
              <div className="mt-3 space-y-2">
                {capabilities.map((capability) => (
                  <div key={capability.id} className="flex items-start justify-between gap-3 border-t border-black/[0.05] pt-2 first:border-t-0 first:pt-0">
                    <div className="min-w-0">
                      <div className="text-[9px] font-medium text-[#5F574F]">{capability.label}</div>
                      {capability.detail ? <div className="mt-0.5 text-[8px] leading-4 text-[#958D84]">{capability.detail}</div> : null}
                    </div>
                    <span className={`shrink-0 text-[8px] font-semibold ${capability.status === "READY" ? "text-emerald-700" : capability.status === "SETUP_REQUIRED" ? "text-amber-700" : "text-[#A29A91]"}`}>{capability.status === "READY" ? "Ready" : capability.status === "SETUP_REQUIRED" ? "Setup" : "Unavailable"}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-2">
            {connectHref ? <a href={connectHref} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#25231F] px-4 text-[10px] font-semibold text-white">{connected ? "Reconnect / reauthorize" : row?.actionLabel || "Connect"}<ExternalLink size={10} /></a> : null}
            <button type="button" onClick={() => load()} disabled={working} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-black/[0.08] bg-white px-4 text-[10px] font-semibold text-[#5E564E] disabled:opacity-40"><RefreshCw size={10} />Refresh</button>
            {connected ? <button type="button" onClick={disconnect} disabled={working} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-red-700/10 bg-red-50 px-4 text-[10px] font-semibold text-red-700 disabled:opacity-40"><Unplug size={10} />Disconnect</button> : null}
          </div>

          {row?.state === "PLATFORM_SETUP" ? <div className="mt-5 flex items-start gap-2 rounded-xl border border-[#C9AD89]/20 bg-[#FBF6EF] px-4 py-3 text-[9px] leading-5 text-[#715B42]"><ShieldCheck size={11} className="mt-1 shrink-0" />This provider still needs Avantiqo/provider-side approval or credentials. The customer does not need to enter technical platform credentials.</div> : null}
          {connected && capabilities.every((capability) => capability.status === "READY") ? <div className="mt-5 inline-flex items-center gap-1.5 text-[9px] font-semibold text-emerald-700"><Check size={10} />Channel is ready for its enabled capabilities</div> : null}
        </section>
      </div>
    </main>
  );
}
