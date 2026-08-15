"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck } from "lucide-react";

export default function LINEIntegrationCard({ organizationId }) {
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState("");

  async function load() {
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
  }

  useEffect(() => {
    load().catch((loadError) =>
      setError(loadError?.message || "Unable to load LINE integration"),
    );
  }, [organizationId]);

  const connected = snapshot?.connection?.status === "ACTIVE";
  const webhookActive = snapshot?.connection?.webhookActive === true;
  const account = snapshot?.accounts?.[0] || null;

  return (
    <main className="min-h-screen bg-black p-6 text-white lg:p-10">
      <div className="mx-auto max-w-4xl">
        <a
          href={`/workspace/${encodeURIComponent(organizationId)}/administration/integrations`}
          className="text-sm text-[#D6A66A]"
        >
          ← Integrations
        </a>

        <div className="mt-8 rounded-[30px] border border-white/10 bg-white/[0.025] p-6 lg:p-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <div className="text-xs uppercase tracking-[0.22em] text-white/30">Messaging</div>
              <h1 className="mt-2 text-4xl font-light">LINE</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/45">
                Connect the LINE Official Account this organization uses for customer communication.
              </p>
            </div>
            <div className={`rounded-full border px-3 py-1 text-xs ${connected && webhookActive ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200" : connected ? "border-amber-400/20 bg-amber-400/10 text-amber-100" : "border-white/10 bg-white/[0.04] text-white/50"}`}>
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
              <div className="mt-3 text-sm text-white/55">
                {account?.name || snapshot?.connection?.accountLabel || "Connected LINE Official Account"}
              </div>
              {account?.basicId ? <div className="mt-1 text-xs text-white/35">{account.basicId}</div> : null}
              <button
                type="button"
                onClick={() => load().catch((e) => setError(e?.message || "Refresh failed"))}
                className="mt-5 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs font-medium text-white/70"
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
              <p className="mt-3 text-sm leading-6 text-white/55">
                Avantiqo is preparing the shared LINE partner connection. When it is approved and ready, this page will show a simple LINE authorization flow for the Official Account administrator.
              </p>
              <p className="mt-3 text-xs leading-5 text-white/35">
                Customers will not enter Channel IDs, Channel secrets, access tokens, webhook URLs, or LINE Developers settings in Avantiqo.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
