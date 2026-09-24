"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  Mail,
  RefreshCw,
  Send,
  ShieldAlert,
  Users,
} from "lucide-react";

const PASSKEY_IDENTITY_ORIGIN = "https://auth.avantiqo.ai";

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

function supabaseProjectRef() {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
    return String(url.hostname.split(".")[0] || "").trim();
  } catch {
    return "";
  }
}

function hostedPasskeyState(hostedConfiguration) {
  if (hostedConfiguration?.enabled === true) return "Enabled";
  if (hostedConfiguration?.enabled === false) return "Disabled";
  return "Not verified";
}

export default function PasskeyReadinessPage() {
  const params = useParams();
  const organizationId = String(params?.organizationId || "");
  const [readiness, setReadiness] = useState(null);
  const [required, setRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sendingStaffId, setSendingStaffId] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadReadiness = useCallback(async ({ preserveMessage = false } = {}) => {
    if (!organizationId) return;
    setLoading(true);
    setError("");
    if (!preserveMessage) setMessage("");

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
  }, [organizationId]);

  useEffect(() => {
    loadReadiness();
  }, [loadReadiness]);

  async function sendEnrollmentAccess(staff) {
    if (!staff?.staffId) return;

    setSendingStaffId(staff.staffId);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/people/workforce/passkey-enrollment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          staffId: staff.staffId,
        }),
      });
      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Unable to send enrollment access");
      }

      setMessage(result.message || `Enrollment access sent to ${staff.email}.`);
      await loadReadiness({ preserveMessage: true });
    } catch (sendError) {
      setError(sendError?.message || "Unable to send enrollment access");
    } finally {
      setSendingStaffId(null);
    }
  }

  const ready = readiness?.activationReady === true;
  const staff = Array.isArray(readiness?.staff) ? readiness.staff : [];
  const hostedConfiguration = readiness?.hostedConfiguration || null;
  const projectRef = supabaseProjectRef();
  const passkeySettingsUrl = projectRef
    ? `https://supabase.com/dashboard/project/${projectRef}/auth/passkeys`
    : null;
  const urlConfigurationUrl = projectRef
    ? `https://supabase.com/dashboard/project/${projectRef}/auth/url-configuration`
    : null;

  return (
    <main className="min-h-screen bg-[#F7F6F3] p-6 text-[#191919] lg:p-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <Link
            href={`/workspace/${organizationId}/administration/access-policy`}
            className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[#746E66]"
          >
            <ArrowLeft className="h-4 w-4" /> Access & Workforce
          </Link>
          <button
            type="button"
            onClick={() => loadReadiness()}
            disabled={loading || Boolean(sendingStaffId)}
            className="flex h-10 items-center gap-2 rounded-xl border border-black/[0.08] px-3 text-[10px] font-black uppercase tracking-[0.12em] text-[#5F5A54] disabled:opacity-40"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        <section className="rounded-[32px] border border-black/[0.08] bg-white p-6">
          <div className="text-[10px] uppercase tracking-[0.32em] text-[#9B6F3F]">
            Administration · Workforce Security
          </div>
          <h1 className="mt-3 text-4xl font-black">Passkey rollout readiness</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#746E66]">
            Prepare clock-in staff for passwordless identity verification before mandatory passkeys are enabled. Staff enter through their organization’s own Staff Portal; passkey creation and verification are brokered securely through https://auth.avantiqo.ai, then the staff member returns to the organization portal.
          </p>
        </section>

        {error ? (
          <div className="rounded-2xl border border-red-700/15 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        {message ? (
          <div className="rounded-2xl border border-emerald-700/15 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {message}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-2xl border border-black/[0.08] bg-[#FBF8F3] p-5 text-sm text-[#817A72]">
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
                  <div className="mt-1 text-sm text-[#746E66]">
                    Current policy: {required ? "passkey verification required" : "passkey verification not required"}.
                  </div>
                </div>
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-3">
              <Metric
                icon={<Users className="h-5 w-5" />}
                label="Clock-in staff"
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

            <section className="rounded-[28px] border border-black/[0.08] bg-white p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="text-sm font-black uppercase tracking-[0.14em] text-[#5F5A54]">
                    Clock-in staff enrollment
                  </div>
                  <p className="mt-2 max-w-3xl text-xs leading-5 text-[#817A72]">
                    New identities receive a Supabase invitation. Existing identities receive a passwordless sign-in link. No temporary or manager-created staff password is used. Access returns staff to the organization&apos;s own Staff Portal. Passkey creation and verification are brokered through https://auth.avantiqo.ai.
                  </p>
                </div>
                <div className="text-[10px] font-black uppercase tracking-[0.12em] text-[#A19A92]">
                  {staff.length} staff
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {staff.length ? (
                  staff.map((person) => (
                    <StaffEnrollmentRow
                      key={person.staffId}
                      staff={person}
                      sending={sendingStaffId === person.staffId}
                      disabled={Boolean(sendingStaffId)}
                      onSend={() => sendEnrollmentAccess(person)}
                    />
                  ))
                ) : (
                  <div className="rounded-2xl border border-black/[0.08] bg-[#FBF8F3] p-4 text-sm text-[#817A72]">
                    No active clock-in staff are available for passkey enrollment.
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-[28px] border border-black/[0.08] bg-white p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="text-sm font-black uppercase tracking-[0.14em] text-[#5F5A54]">
                    Hosted Passkey configuration
                  </div>
                  <p className="mt-2 max-w-2xl text-xs leading-5 text-[#817A72]">
                    Avantiqo checks the live Supabase Auth challenge before mandatory clock-in can be enabled. Configure the hosted Auth project once, then refresh this page to verify it.
                  </p>
                </div>
                {passkeySettingsUrl ? (
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={passkeySettingsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-10 items-center rounded-xl border border-[#D6A66A]/35 bg-[#FBF3E8] px-3 text-[10px] font-black uppercase tracking-[0.12em] text-[#76583A]"
                    >
                      Open Passkey settings ↗
                    </a>
                    <a
                      href={urlConfigurationUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-10 items-center rounded-xl border border-black/[0.08] px-3 text-[10px] font-black uppercase tracking-[0.12em] text-[#5F5A54]"
                    >
                      Open URL configuration ↗
                    </a>
                  </div>
                ) : null}
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                <StatusRow
                  label="Hosted Passkeys"
                  value={hostedPasskeyState(hostedConfiguration)}
                  good={hostedConfiguration?.enabled === true}
                />
                <StatusRow
                  label="Observed RP ID"
                  value={hostedConfiguration?.rpId || "Not available"}
                  good={hostedConfiguration?.rpIdMatches === true}
                />
                <StatusRow
                  label="Required RP ID"
                  value={readiness.requiredRpId || "avantiqo.ai"}
                  good
                />
                <StatusRow
                  label="Canonical Workforce origin"
                  value={readiness.canonicalOrigin || PASSKEY_IDENTITY_ORIGIN}
                  good
                />
                <StatusRow
                  label="Passkey admin API"
                  value={readiness.providerAvailable ? "Reachable" : "Not verified"}
                  good={readiness.providerAvailable}
                />
                <StatusRow
                  label="Real origin verification"
                  value={readiness.recentVerificationProven ? "Recent verification passed" : "Still required"}
                  good={readiness.recentVerificationProven}
                />
              </div>

              <div className="mt-5 rounded-2xl border border-[#D6A66A]/30 bg-[#FBF3E8] p-4">
                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-[#9B6F3F]">
                  Required hosted values
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <SetupValue label="Enable Passkey authentication" value="On" />
                  <SetupValue label="Relying Party Display Name" value="Avantiqo" />
                  <SetupValue label="Relying Party ID" value={readiness.requiredRpId || "avantiqo.ai"} />
                  <SetupValue label="Relying Party Origin" value={readiness.canonicalOrigin || PASSKEY_IDENTITY_ORIGIN} />
                  <SetupValue label="Identity broker" value={PASSKEY_IDENTITY_ORIGIN} />
                </div>
                <p className="mt-3 text-xs leading-5 text-[#76583A]">
                  Keep the RP ID stable after staff begin enrolling. The production redirect should be explicitly allowed for the passwordless enrollment flow.
                </p>
              </div>
            </section>

            <section className="rounded-[28px] border border-black/[0.08] bg-white p-5">
              <div className="text-sm font-black uppercase tracking-[0.14em] text-[#5F5A54]">
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

            <section className="rounded-[28px] border border-[#D6A66A]/30 bg-[#FBF3E8] p-5 text-sm leading-6 text-[#76583A]">
              Enrollment sequence: manager sends access → staff opens the email and signs in on <strong>avantiqo.ai</strong> → Workforce Profile → <strong>Register passkey</strong> → <strong>Test passkey verification</strong>. A recent successful test proves the hosted Passkey configuration and canonical Workforce origin work together. Biometric templates remain on the employee device.
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}

function StaffEnrollmentRow({ staff, sending, disabled, onSend }) {
  const enrolled = staff.enrolled === true;
  const authLinked = staff.authLinked === true;
  const hasEmail = Boolean(String(staff.email || "").trim());

  let actionLabel = "Send enrollment invite";
  if (authLinked) actionLabel = "Send sign-in link";
  if (enrolled) actionLabel = "Enrolled";
  if (!hasEmail) actionLabel = "Email required";

  return (
    <div className="rounded-2xl border border-black/[0.08] bg-[#FBF8F3] p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-black text-[#2F2C28]">{staff.name}</span>
            <span className="rounded-lg border border-black/[0.08] px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-[#817A72]">
              {staff.role}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-[#918B83]">
            <Mail className="h-3.5 w-3.5" /> {hasEmail ? staff.email : "No email configured"}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.1em]">
            <StatusPill good={authLinked} label={authLinked ? "Auth linked" : "Auth missing"} />
            <StatusPill good={enrolled} label={enrolled ? `${staff.passkeyCount || 1} passkey${Number(staff.passkeyCount || 0) === 1 ? "" : "s"}` : "Passkey missing"} />
            {enrolled ? (
              <StatusPill good={Boolean(staff.lastUsedAt)} label={staff.lastUsedAt ? `Verified ${dateTime(staff.lastUsedAt)}` : "Verification not tested"} />
            ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={onSend}
          disabled={disabled || sending || enrolled || !hasEmail}
          className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-[#D6A66A]/35 bg-[#FBF3E8] px-4 text-[10px] font-black uppercase tracking-[0.12em] text-[#76583A] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {enrolled ? <CheckCircle2 className="h-4 w-4" /> : <Send className={`h-4 w-4 ${sending ? "animate-pulse" : ""}`} />}
          {sending ? "Sending..." : actionLabel}
        </button>
      </div>
    </div>
  );
}

function StatusPill({ good, label }) {
  return (
    <span className={`rounded-lg border px-2 py-1 ${good ? "border-emerald-700/15 bg-emerald-50 text-emerald-800" : "border-amber-700/15 bg-amber-50 text-amber-800"}`}>
      {label}
    </span>
  );
}

function Metric({ icon, label, value, detail, good }) {
  return (
    <div className="rounded-[24px] border border-black/[0.08] bg-white p-5">
      <div className={`flex items-center gap-2 ${good ? "text-emerald-300" : "text-amber-300"}`}>
        {icon}
        <span className="text-[10px] font-black uppercase tracking-[0.14em]">{label}</span>
      </div>
      <div className="mt-3 text-2xl font-black">{value}</div>
      <div className="mt-1 text-xs text-[#918B83]">{detail}</div>
    </div>
  );
}

function StatusRow({ label, value, good }) {
  return (
    <div className="rounded-2xl border border-black/[0.08] bg-[#FBF8F3] p-4">
      <div className="text-xs text-[#918B83]">{label}</div>
      <div className={`mt-1 break-words text-sm font-semibold ${good ? "text-emerald-800" : "text-amber-800"}`}>
        {value}
      </div>
    </div>
  );
}

function SetupValue({ label, value }) {
  return (
    <div className="rounded-xl border border-[#D6A66A]/25 bg-[#FBF8F3] p-3">
      <div className="text-[10px] uppercase tracking-[0.12em] text-[#9B6F3F]">{label}</div>
      <div className="mt-1 break-all text-xs font-semibold text-[#5F5A54]">{value}</div>
    </div>
  );
}
