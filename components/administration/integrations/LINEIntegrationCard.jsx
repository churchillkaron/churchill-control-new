"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, RefreshCw } from "lucide-react";

export default function LINEIntegrationCard({ organizationId }) {
  const [snapshot, setSnapshot] = useState(null);
  const [channelId, setChannelId] = useState("");
  const [channelSecret, setChannelSecret] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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

  async function connect() {
    if (!channelId.trim() || !channelSecret.trim()) {
      setError("Enter the Messaging API Channel ID and Channel secret from LINE Developers.");
      return;
    }

    setWorking(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/administration/integrations/line", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          action: "connect",
          channelId: channelId.trim(),
          channelSecret: channelSecret.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "LINE connection failed");
      }

      setSnapshot(data);
      setChannelSecret("");
      setNotice("LINE Official Account connected.");
    } catch (actionError) {
      setError(actionError?.message || "LINE connection failed");
    } finally {
      setWorking(false);
    }
  }

  const connected = snapshot?.connection?.status === "ACTIVE";
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
            <div className={`rounded-full border px-3 py-1 text-xs ${connected ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200" : "border-white/10 bg-white/[0.04] text-white/50"}`}>
              {connected ? "Connected" : "Not connected"}
            </div>
          </div>

          {(error || notice) && (
            <div className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${error ? "border-red-400/20 bg-red-400/10 text-red-100" : "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"}`}>
              {error || notice}
            </div>
          )}

          {connected ? (
            <div className="mt-6 rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.06] p-5">
              <div className="flex items-center gap-2 text-emerald-200">
                <CheckCircle2 className="h-4 w-4" />
                <span className="font-medium">LINE Official Account is connected</span>
              </div>
              <div className="mt-3 text-sm text-white/55">
                {account?.name || snapshot?.connection?.accountLabel || "Connected LINE Official Account"}
              </div>
              {account?.basicId ? (
                <div className="mt-1 text-xs text-white/35">{account.basicId}</div>
              ) : null}
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
            <div className="mt-6 space-y-4">
              <div className="rounded-2xl border border-white/10 bg-black/25 p-5">
                <div className="text-sm font-medium text-white">LINE Messaging API credentials</div>
                <p className="mt-2 text-xs leading-5 text-white/40">
                  Use the Messaging API channel connected to the business LINE Official Account. LINE Login credentials are not used for this connection.
                </p>

                <label className="mt-5 block text-xs text-white/45">Channel ID</label>
                <input
                  value={channelId}
                  onChange={(event) => setChannelId(event.target.value)}
                  autoComplete="off"
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none"
                  placeholder="Messaging API Channel ID"
                />

                <label className="mt-4 block text-xs text-white/45">Channel secret</label>
                <input
                  type="password"
                  value={channelSecret}
                  onChange={(event) => setChannelSecret(event.target.value)}
                  autoComplete="new-password"
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none"
                  placeholder="Messaging API Channel secret"
                />
              </div>

              <button
                type="button"
                onClick={connect}
                disabled={working}
                className="inline-flex items-center gap-2 rounded-2xl bg-[#D6A66A] px-5 py-3 text-sm font-semibold text-black disabled:opacity-50"
              >
                {working ? "Connecting…" : "Connect LINE Official Account"}
                <ExternalLink className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
