"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, KeyRound, RefreshCw, ShieldCheck } from "lucide-react";
import { supabaseClient } from "@/lib/shared/supabase/client";

function dateTime(value) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function ProfilePage() {
  const [passkeys, setPasskeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadPasskeys() {
    setLoading(true);
    setError("");

    try {
      const { data, error: listError } = await supabaseClient.auth.passkey.list();
      if (listError) throw listError;
      setPasskeys(Array.isArray(data) ? data : data?.passkeys || []);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load passkeys");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPasskeys();
  }, []);

  async function registerPasskey() {
    setWorking(true);
    setError("");
    setMessage("");

    try {
      const { data, error: registrationError } =
        await supabaseClient.auth.registerPasskey();

      if (registrationError) throw registrationError;

      setMessage(
        `Passkey registered${data?.friendly_name ? ` · ${data.friendly_name}` : ""}.`
      );
      await loadPasskeys();
    } catch (registrationError) {
      setError(
        registrationError?.message ||
          "Unable to register passkey on this device"
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <main className="min-h-screen text-white">
      <div className="mx-auto max-w-3xl space-y-5 p-5">
        <Link
          href="/workforce"
          className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-white/45"
        >
          <ArrowLeft className="h-4 w-4" /> Workforce
        </Link>

        <section className="rounded-[32px] border border-white/10 bg-white/[0.055] p-5 backdrop-blur-3xl">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-violet-300">
            <ShieldCheck className="h-4 w-4" /> Profile · Security
          </div>
          <h1 className="mt-3 text-3xl font-black">Identity verification</h1>
          <p className="mt-2 text-sm leading-6 text-white/45">
            Register a passkey for secure shift verification. Your device may use
            Face ID, Touch ID, Windows Hello, a device PIN, or a hardware security
            key. Avantiqo never receives or stores your biometric template.
          </p>
        </section>

        {error ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        {message ? (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {message}
          </div>
        ) : null}

        <section className="rounded-[30px] border border-white/10 bg-white/[0.04] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-black">
                <KeyRound className="h-5 w-5 text-violet-300" /> Passkeys
              </div>
              <p className="mt-2 text-xs leading-5 text-white/40">
                A passkey is bound to your Supabase staff identity. When required
                by your organization, Start Shift asks you to verify this passkey
                before GPS and attendance are recorded.
              </p>
            </div>

            <button
              type="button"
              onClick={loadPasskeys}
              disabled={loading || working}
              className="flex h-10 items-center gap-2 rounded-xl border border-white/10 px-3 text-[10px] font-black uppercase tracking-[0.12em] text-white/55 disabled:opacity-40"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {loading ? (
              <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-4 text-sm text-white/35">
                Loading passkeys...
              </div>
            ) : passkeys.length ? (
              passkeys.map((passkey) => (
                <div
                  key={passkey.id}
                  className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.06] p-4"
                >
                  <div className="text-sm font-black text-emerald-100">
                    {passkey.friendly_name || "Registered passkey"}
                  </div>
                  <div className="mt-2 text-xs text-white/35">
                    Registered {dateTime(passkey.created_at)} · Last used {dateTime(passkey.last_used_at)}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.06] p-4 text-sm text-amber-100/75">
                No passkey is registered yet. Register one before your organization
                enables passkey-required clock-in.
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={registerPasskey}
            disabled={loading || working}
            className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 text-xs font-black uppercase tracking-[0.14em] text-white disabled:opacity-40"
          >
            <KeyRound className="h-4 w-4" />
            {working ? "Registering..." : "Register passkey"}
          </button>
        </section>
      </div>
    </main>
  );
}
