"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  MapPin,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
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

function statusClass(status) {
  if (status === "approved") return "border-emerald-400/15 bg-emerald-400/[0.06] text-emerald-100";
  if (status === "pending") return "border-amber-400/15 bg-amber-400/[0.06] text-amber-100";
  if (status === "rejected") return "border-red-400/15 bg-red-400/[0.06] text-red-100";
  return "border-white/10 bg-white/[0.04] text-white/60";
}

export default function ProfilePage() {
  const [passkeys, setPasskeys] = useState([]);
  const [runtime, setRuntime] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [reason, setReason] = useState("");
  const [selectedTargets, setSelectedTargets] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadSecurity() {
    setLoading(true);
    setError("");

    try {
      const [passkeyResult, runtimeResponse] = await Promise.all([
        supabaseClient.auth.passkey.list(),
        fetch("/api/staff/runtime", { cache: "no-store" }),
      ]);

      if (passkeyResult.error) throw passkeyResult.error;
      const runtimeResult = await runtimeResponse.json();
      if (!runtimeResponse.ok || !runtimeResult?.success) {
        throw new Error(runtimeResult?.error || "Unable to load clock-in security");
      }

      setPasskeys(
        Array.isArray(passkeyResult.data)
          ? passkeyResult.data
          : passkeyResult.data?.passkeys || []
      );
      setRuntime(runtimeResult);

      const requirements = runtimeResult?.clockInRequirements || {};
      const suggested = [];
      if (requirements.passkeyRequired) suggested.push("passkey");
      if (requirements.gpsRequired) suggested.push("gps");
      setSelectedTargets((current) => current.length ? current : suggested);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load security settings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSecurity();
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
      await loadSecurity();
    } catch (registrationError) {
      setError(
        registrationError?.message ||
          "Unable to register passkey on this device"
      );
    } finally {
      setWorking(false);
    }
  }

  function toggleTarget(target) {
    setSelectedTargets((current) =>
      current.includes(target)
        ? current.filter((item) => item !== target)
        : [...current, target]
    );
  }

  async function requestException() {
    setRequesting(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/staff/clock-in-exception", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason,
          targets: selectedTargets,
        }),
      });
      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Unable to request clock-in exception");
      }

      setReason("");
      setMessage(
        result.created
          ? "Clock-in exception sent for manager review."
          : `An existing ${result.request?.status || "active"} request already covers this verification.`
      );
      await loadSecurity();
    } catch (requestError) {
      setError(requestError?.message || "Unable to request clock-in exception");
    } finally {
      setRequesting(false);
    }
  }

  const requirements = runtime?.clockInRequirements || {};
  const exception = requirements?.exception || {};
  const latestException = exception.latest || null;
  const requiredTargets = useMemo(() => {
    const values = [];
    if (requirements.passkeyRequired) values.push("passkey");
    if (requirements.gpsRequired) values.push("gps");
    return values;
  }, [requirements.passkeyRequired, requirements.gpsRequired]);

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
              onClick={loadSecurity}
              disabled={loading || working || requesting}
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
            disabled={loading || working || requesting}
            className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 text-xs font-black uppercase tracking-[0.14em] text-white disabled:opacity-40"
          >
            <KeyRound className="h-4 w-4" />
            {working ? "Registering..." : "Register passkey"}
          </button>
        </section>

        <section className="rounded-[30px] border border-white/10 bg-white/[0.04] p-5">
          <div className="flex items-center gap-2 text-sm font-black">
            <AlertTriangle className="h-5 w-5 text-amber-300" /> Clock-in exception
          </div>
          <p className="mt-2 text-xs leading-5 text-white/40">
            If your approved device or GPS cannot verify at shift start, request a
            one-time manager exception. Approval never changes organization policy,
            expires after 10 minutes, and is consumed by the next successful clock-in.
          </p>

          {latestException ? (
            <div className={`mt-4 rounded-2xl border p-4 ${statusClass(latestException.status)}`}>
              <div className="flex items-center gap-2 text-sm font-black capitalize">
                {latestException.status === "approved" ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <AlertTriangle className="h-4 w-4" />
                )}
                {latestException.status}
              </div>
              <div className="mt-2 text-xs opacity-70">
                {latestException.targets?.join(" + ") || "Verification"}
                {latestException.expiresAt && latestException.status === "approved"
                  ? ` · expires ${dateTime(latestException.expiresAt)}`
                  : ""}
              </div>
              {latestException.rejectionReason ? (
                <div className="mt-2 text-xs opacity-80">
                  Manager note: {latestException.rejectionReason}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <TargetToggle
              icon={<KeyRound className="h-4 w-4" />}
              label="Passkey"
              active={selectedTargets.includes("passkey")}
              required={requirements.passkeyRequired}
              onClick={() => toggleTarget("passkey")}
            />
            <TargetToggle
              icon={<MapPin className="h-4 w-4" />}
              label="GPS"
              active={selectedTargets.includes("gps")}
              required={requirements.gpsRequired}
              onClick={() => toggleTarget("gps")}
            />
          </div>

          {!requiredTargets.length ? (
            <div className="mt-3 text-xs text-white/30">
              Your organization does not currently require passkey or GPS verification for clock-in.
            </div>
          ) : null}

          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            rows={4}
            placeholder="Explain why normal verification cannot be completed..."
            className="mt-4 w-full rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-white outline-none placeholder:text-white/25"
          />

          <button
            type="button"
            onClick={requestException}
            disabled={
              loading ||
              working ||
              requesting ||
              selectedTargets.length === 0 ||
              reason.trim().length < 5
            }
            className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 text-xs font-black uppercase tracking-[0.14em] text-amber-100 disabled:opacity-40"
          >
            <AlertTriangle className="h-4 w-4" />
            {requesting ? "Sending request..." : "Request manager exception"}
          </button>
        </section>
      </div>
    </main>
  );
}

function TargetToggle({ icon, label, active, required, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-between rounded-2xl border p-4 text-left transition ${
        active
          ? "border-violet-400/30 bg-violet-400/10 text-violet-100"
          : "border-white/10 bg-black/20 text-white/45"
      }`}
    >
      <span className="flex items-center gap-2 text-sm font-black">
        {icon} {label}
      </span>
      <span className="text-[9px] font-black uppercase tracking-[0.14em]">
        {required ? "Required" : active ? "Selected" : "Optional"}
      </span>
    </button>
  );
}
