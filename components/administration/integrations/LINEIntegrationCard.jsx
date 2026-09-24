"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck } from "lucide-react";

export default function LINEIntegrationCard({ organizationId, onboarding = false }) {
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!organizationId) return;
    const response = await fetch(
      `/api/administration/integrations/line?organizationId=${encodeURIComponent(organizationId)}`,
      { cache: "no-store" },
    );
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || "Unable to load LINE integration");
    }
    setSnapshot(data);
  }, [organizationId]);

  useEffect(() => {
    load().catch((loadError) =>
      setError(loadError?.message || "Unable to load LINE integration"),
    );
  }, [load]);

  const connected = snapshot?.connection?.status === "ACTIVE";
  const webhookActive = snapshot?.connection?.webhookActive === true;
  const account = snapshot?.accounts?.[0] || null;

  if (onboarding) {
    return (
      <main className="min-h-screen bg-[#F7F6F3] p-6 text-[#2D2822] lg:p-10">
        <div className="mx-auto max-w-4xl">
          <a href={`/workspace/${encodeURIComponent(organizationId)}/administration/communications-setup?onboarding=1`} className="text-[9px] font-semibold text-[#8A633C]">← Communication setup</a>
          <section className="mt-5 rounded-[24px] border border-black/[0.07] bg-white p-6 lg:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#A37849]">Messaging</div>
                <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.04em]">LINE</h1>
                <p className="mt-2 max-w-2xl text-[10px] leading-5 text-[#777169]">Connect the organization’s LINE Official Account. Avantiqo owns the technical partner setup; the customer only authorizes its account when the provider flow is available.</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[8px] font-semibold ${connected && webhookActive ? "bg-emerald-50 text-emerald-700" : connected ? "bg-amber-50 text-amber-700" : "bg-[#F0E7DA] text-[#8A633C]"}`}>{connected && webhookActive ? "Operational" : connected ? "Setup in progress" : "Avantiqo setup"}</span>
            </div>
            {error ? <div className="mt-4 rounded-xl border border-red-700/15 bg-red-50 px-4 py-3 text-[10px] text-red-800">{error}</div> : null}
            {connected ? (
              <div className={`mt-5 rounded-2xl border p-5 ${webhookActive ? "border-emerald-700/15 bg-emerald-50" : "border-amber-700/15 bg-amber-50"}`}>
                <div className={`flex items-center gap-2 text-[10px] font-semibold ${webhookActive ? "text-emerald-800" : "text-amber-800"}`}>{webhookActive ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}{webhookActive ? "LINE messaging is operational" : "Avantiqo is completing the LINE connection"}</div>
                <div className="mt-2 text-[10px] text-[#5F5850]">{account?.name || snapshot?.connection?.accountLabel || "Connected LINE Official Account"}</div>
                {account?.basicId ? <div className="mt-1 text-[9px] text-[#8B837A]">{account.basicId}</div> : null}
                <button type="button" onClick={() => load().catch((e) => setError(e?.message || "Refresh failed"))} className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-xl border border-black/[0.08] bg-white px-3 text-[9px] font-semibold text-[#655D54]"><RefreshCw size={10} />Refresh connection</button>
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-[#C9AD89]/20 bg-[#FBF6EF] p-5">
                <div className="flex items-center gap-2 text-[10px] font-semibold text-[#6D5134]"><ShieldCheck size={13} />No technical customer setup required</div>
                <p className="mt-2 text-[9px] leading-5 text-[#7E7468]">Avantiqo is preparing the shared LINE partner connection. When LINE enables the provider authorization flow, the organization will only sign in and attach its Official Account—no channel IDs, secrets, tokens or webhook configuration.</p>
              </div>
            )}
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F7F6F3] p-6 text-[#191919] lg:p-10">
      <div className="mx-auto max-w-4xl">
        <a
          href={`/workspace/${encodeURIComponent(organizationId)}/administration/integrations`}
          className="text-sm text-[#D6A66A]"
        >
          ← Integrations
        </a>

        <div className="mt-8 rounded-[30px] border border-black/[0.08] bg-[#FBF8F3] p-6 lg:p-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <div className="text-xs uppercase tracking-[0.22em] text-[#A19A92]">Messaging</div>
              <h1 className="mt-2 text-4xl font-light">LINE</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#746E66]">
                Connect the LINE Official Account this organization uses for customer communication.
              </p>
            </div>
            <div className={`rounded-full border px-3 py-1 text-xs ${connected && webhookActive ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200" : connected ? "border-amber-400/20 bg-amber-400/10 text-amber-100" : "border-black/[0.08] bg-[#FBF8F3] text-[#746E66]"}`}>
              {connected && webhookActive ? "Operational" : connected ? "Setup in progress" : "Avantiqo setup"}
            </div>
          </div>

          {error ? (
            <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          ) : null}

          {connected ? (
            <div className={`mt-6 rounded-2xl border p-5 ${webhookActive ? "border-emerald-400/15 bg-emerald-400/[0.06]" : "border-amber-400/20 bg-amber-400/[0.06]"}`}>
              <div className={`flex items-center gap-2 ${webhookActive ? "text-emerald-200" : "text-amber-100"}`}>
                {webhookActive ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                <span className="font-medium">
                  {webhookActive ? "LINE messaging is operational" : "Avantiqo is completing the LINE connection"}
                </span>
              </div>
              <div className="mt-3 text-sm text-[#5F5A54]">
                {account?.name || snapshot?.connection?.accountLabel || "Connected LINE Official Account"}
              </div>
              {account?.basicId ? <div className="mt-1 text-xs text-[#918B83]">{account.basicId}</div> : null}
              <button
                type="button"
                onClick={() => load().catch((e) => setError(e?.message || "Refresh failed"))}
                className="mt-5 inline-flex items-center gap-2 rounded-xl border border-black/[0.08] bg-[#FBF8F3] px-4 py-2.5 text-xs font-medium text-[#5F5A54]"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh connection
              </button>
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-[#D6A66A]/20 bg-[#D6A66A]/[0.06] p-5">
              <div className="flex items-center gap-2 text-[#E5C18D]">
                <ShieldCheck className="h-4 w-4" />
                <span className="font-medium">No technical setup is required from the customer</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-[#5F5A54]">
                Avantiqo is preparing the shared LINE partner connection. When it is approved and ready, this page will show a simple LINE authorization flow for the Official Account administrator.
              </p>
              <p className="mt-3 text-xs leading-5 text-[#918B83]">
                Customers will not enter Channel IDs, Channel secrets, access tokens, webhook URLs, or LINE Developers settings in Avantiqo.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
