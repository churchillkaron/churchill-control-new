"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  RefreshCw,
  ShieldAlert,
  Users,
} from "lucide-react";

function dateTime(value) {
  if (!value) return "Not yet verified";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not yet verified";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function PasskeyReadinessPage() {
  const params = useParams();
  const organizationId = String(params?.organizationId || "");
  const [readiness, setReadiness] = useState(null);
  const [required, setRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadReadiness() {
    if (!organizationId) return;
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/administration/access-policy?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: "no-store" }
      );
      const result = await response.json();
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Unable to load passkey rollout readiness");
      }

      setReadiness(result.passkeyReadiness || null);
      setRequired(result?.policy?.workforce?.passkey_clock_in_required === true);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load passkey rollout readiness");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReadiness();
  }, [organizationId]);

  const ready = readiness?.activationReady === true;

  return (
    <main className="min-h-screen bg-[#030303] p-6 text-white lg:p-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <Link
            href={`/workspace/${organizationId}/administration/access-policy`}
            className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-white/45"
          >
            <ArrowLeft className="h-4 w-4" /> Access & Workforce
          </Link>
          <button
            type="button"
            onClick={loadReadiness}
            disabled={loading}
            className="flex h-10 items-center gap-2 rounded-xl border border-white/10 px-3 text-[10px] font-black uppercase tracking-[0.12em] text-white/55 disabled:opacity-40"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        <section className="rounded-[32px] border border-white/10 bg-white/[0.045] p-6">
          <div className="text-[10px] uppercase tracking-[0.32em] text-violet-300">
            Administration · Workforce Security
          </div>
          <h1 className="mt-3 text-4xl font-black">Passkey rollout readiness</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/45">
            Mandatory passkey clock-in is blocked until the organization is fully prepared. Enrollment alone is not enough: active members must be linked to Supabase Auth, every active member must have a passkey, and at least one real verification must have succeeded recently.
          </p>
        </section>

        {error ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/40">
            Checking rollout readiness...
          </div>
        ) : readiness ? (
          <>
            <section className={`rounded-[28px] border p-5 ${ready ? "border-emerald-400/20 bg-emerald-400/[0.06]" : "border-amber-400/20 bg-amber-400/[0.06]"}`}>
              <div className="flex items-start gap-3">
                {ready ? (
                  <CheckCircle2 className="mt-0.5 h-6 w-6 text-emerald-300" />
                ) : (
                  <ShieldAlert className="mt-0.5 h-6 w-6 text-amber-300" />
                )}
                <div>
                  <div className="text-lg font-black">
                    {ready ? "Ready to enable mandatory passkeys" : "Mandatory passkeys remain locked"}
                  </div>
                  <div className="mt-1 text-sm text-white/50">
                    Current policy: {required ? "passkey verification required" : "passkey verification not required"}.
                  </div>
                </div>
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-3">
              <Metric
                icon={<Users className="h-5 w-5" />}
                label="Active members"
                value={readiness.activeMemberCount}
                detail={`${readiness.authLinkedMemberCount} linked to Supabase Auth`}
                good={readiness.fullAuthCoverage}
              />
              <Metric
                icon={<KeyRound className="h-5 w-5" />}
                label="Passkey enrollment"
                value={`${readiness.enrolledMemberCount}/${readiness.activeMemberCount}`}
                detail={`${readiness.missingEnrollmentCount} still missing enrollment`}
                good={readiness.fullEnrollmentCoverage}
              />
              <Metric
                icon={<CheckCircle2 className="h-5 w-5" />}
                label="Verification proof"
                value={readiness.recentVerificationProven ? "Passed" : "Missing"}
                detail={`Latest: ${dateTime(readiness.latestVerifiedAt)}`}
                good={readiness.recentVerificationProven}
              />
            </section>

            <section className="rounded-[28px] border border-white/10 bg-white/[0.035] p-5">
              <div className="text-sm font-black uppercase tracking-[0.14em] text-white/70">
                Hosted Passkey configuration
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <StatusRow
                  label="Provider check"
                  value={readiness.providerAvailable ? "Available" : "Not verified"}
                  good={readiness.providerAvailable}
                />
                <StatusRow
                  label="Canonical Workforce origin"
                  value={readiness.canonicalOrigin || "https://avantiqo.ai"}
                  good
                />
                <StatusRow
                  label="Required RP ID"
                  value="avantiqo.ai"
                  good
                />
                <StatusRow
                  label="Verification freshness"
                  value={`${readiness.verificationWindowMinutes || 30} minutes`}
                  good={readiness.recentVerificationProven}
                />
              </div>
            </section>

            <section className="rounded-[28px] border border-white/10 bg-white/[0.035] p-5">
              <div className="text-sm font-black uppercase tracking-[0.14em] text-white/70">
                Rollout blockers
              </div>
              {readiness.blockers?.length ? (
                <div className="mt-4 space-y-2">
                  {readiness.blockers.map((blocker) => (
                    <div
                      key={blocker}
                      className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.05] px-4 py-3 text-sm text-amber-100/75"
                    >
                      {blocker}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.05] px-4 py-3 text-sm text-emerald-100/75">
                  No rollout blockers remain. The server will allow the organization policy to enable mandatory passkey clock-in.
                </div>
              )}
            </section>

            <section className="rounded-[28px] border border-violet-400/15 bg-violet-400/[0.05] p-5 text-sm leading-6 text-violet-100/70">
              Staff enroll and test their passkey from <strong>Workforce → Profile → Identity verification</strong>. The new Test passkey verification action performs the same identity ceremony used immediately before Start Shift. Biometric templates remain on the employee device.
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}

function Metric({ icon, label, value, detail, good }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.035] p-5">
      <div className={`flex items-center gap-2 ${good ? "text-emerald-300" : "text-amber-300"}`}>
        {icon}
        <span className="text-[10px] font-black uppercase tracking-[0.14em]">{label}</span>
      </div>
      <div className="mt-3 text-2xl font-black">{value}</div>
      <div className="mt-1 text-xs text-white/35">{detail}</div>
    </div>
  );
}

function StatusRow({ label, value, good }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-xs text-white/35">{label}</div>
      <div className={`mt-1 text-sm font-semibold ${good ? "text-emerald-200" : "text-amber-200"}`}>
        {value}
      </div>
    </div>
  );
}
