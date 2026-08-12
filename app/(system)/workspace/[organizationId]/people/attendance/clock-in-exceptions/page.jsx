"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  KeyRound,
  MapPin,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function targetLabel(targets = []) {
  const labels = [];
  if (targets.includes("passkey")) labels.push("Passkey");
  if (targets.includes("gps")) labels.push("GPS");
  return labels.join(" + ") || "Verification";
}

function statusClass(status) {
  const value = String(status || "").toLowerCase();
  if (value === "approved") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-200";
  if (value === "consumed") return "border-cyan-500/20 bg-cyan-500/10 text-cyan-200";
  if (value === "rejected") return "border-red-500/20 bg-red-500/10 text-red-200";
  if (value === "expired") return "border-zinc-500/20 bg-zinc-500/10 text-zinc-300";
  return "border-amber-500/20 bg-amber-500/10 text-amber-200";
}

export default function ClockInExceptionReviewPage() {
  const params = useParams();
  const organizationId = String(params?.organizationId || "").trim();
  const [data, setData] = useState({ pending: [], recent: [] });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(
        `/api/people/workforce/clock-in-exceptions?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: "no-store" }
      );
      const payload = await response.json();

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Unable to load clock-in exceptions");
      }

      setData({
        pending: payload.pending || [],
        recent: payload.recent || [],
      });
    } catch (error) {
      setMessage(error?.message || "Unable to load clock-in exceptions");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (organizationId) load();
  }, [organizationId]);

  const counts = useMemo(() => ({
    pending: data.pending.length,
    approved: data.recent.filter((item) => item.status === "approved").length,
    consumed: data.recent.filter((item) => item.status === "consumed").length,
    rejected: data.recent.filter((item) => item.status === "rejected").length,
  }), [data]);

  async function review(request, decision) {
    const verb = decision === "approved" ? "Approval" : "Rejection";
    const note = window.prompt(`${verb} note (required):`, "");
    if (note === null) return;
    if (note.trim().length < 3) {
      setMessage("A manager review note of at least 3 characters is required.");
      return;
    }

    setBusyId(request.id);
    setMessage("");

    try {
      const response = await fetch("/api/people/workforce/clock-in-exceptions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          requestId: request.id,
          decision,
          notes: note.trim(),
        }),
      });
      const payload = await response.json();

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Unable to review clock-in exception");
      }

      setMessage(
        decision === "approved"
          ? "Exception approved for one clock-in and 10 minutes."
          : "Exception request rejected."
      );
      await load();
    } catch (error) {
      setMessage(error?.message || "Unable to review clock-in exception");
    } finally {
      setBusyId("");
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 p-5 text-white lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link
              href={`/workspace/${organizationId}/people/attendance`}
              className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-zinc-500 hover:text-white"
            >
              <ArrowLeft size={15} /> Attendance
            </Link>
            <p className="mt-4 text-xs uppercase tracking-[0.28em] text-zinc-500">
              People · Workforce · Verification
            </p>
            <h1 className="mt-2 text-4xl font-black">Clock-in Exceptions</h1>
            <p className="mt-2 max-w-3xl text-zinc-400">
              Review temporary staff requests when normal passkey or GPS verification cannot be completed. Approval is target-specific, expires after 10 minutes, and is consumed by one successful clock-in.
            </p>
          </div>

          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="flex h-12 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-xs font-black uppercase tracking-[0.14em] text-zinc-300 disabled:opacity-40"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric icon={<Clock3 size={18} />} label="Pending" value={counts.pending} />
          <Metric icon={<CheckCircle2 size={18} />} label="Approved" value={counts.approved} />
          <Metric icon={<ShieldCheck size={18} />} label="Consumed" value={counts.consumed} />
          <Metric icon={<XCircle size={18} />} label="Rejected" value={counts.rejected} />
        </section>

        <div className="rounded-2xl border border-amber-500/15 bg-amber-500/[0.06] p-4 text-xs leading-5 text-amber-100/70">
          Managers cannot approve their own request. An approval never disables organization security policy and never creates fake GPS or biometric evidence.
        </div>

        {message ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-zinc-300">
            {message}
          </div>
        ) : null}

        <WorkspaceSection
          title="Pending Review"
          eyebrow="Staff requests"
          empty="No clock-in exception requests are waiting for review."
          loading={loading}
        >
          {(data.pending || []).map((request) => (
            <div
              key={request.id}
              className="grid gap-4 border-t border-white/5 px-5 py-5 lg:grid-cols-[1.3fr_1fr_1.5fr_auto] lg:items-center"
            >
              <div>
                <div className="font-bold">
                  {request.staff?.name || request.staff?.email || "Staff member"}
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  {request.staff?.role || request.staff?.position || "Staff"}
                  {request.staff?.department ? ` · ${request.staff.department}` : ""}
                </div>
              </div>

              <div>
                <TargetBadge targets={request.targets || []} />
                <div className="mt-2 text-xs text-zinc-500">
                  Requested {formatDateTime(request.createdAt)}
                </div>
              </div>

              <div>
                <div className="text-sm text-zinc-300">{request.reason || "No reason provided"}</div>
                {request.failureCode ? (
                  <div className="mt-1 font-mono text-[10px] text-zinc-600">{request.failureCode}</div>
                ) : null}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busyId === request.id}
                  onClick={() => review(request, "approved")}
                  className="action action-ok"
                >
                  <CheckCircle2 size={16} /> Approve
                </button>
                <button
                  type="button"
                  disabled={busyId === request.id}
                  onClick={() => review(request, "rejected")}
                  className="action action-bad"
                >
                  <XCircle size={16} /> Reject
                </button>
              </div>
            </div>
          ))}
        </WorkspaceSection>

        <WorkspaceSection
          title="Recent Decisions"
          eyebrow="Audit trail"
          empty="No reviewed clock-in exceptions yet."
          loading={loading}
        >
          {(data.recent || []).map((request) => (
            <div
              key={request.id}
              className="grid gap-4 border-t border-white/5 px-5 py-5 lg:grid-cols-[1.3fr_1fr_1fr_1.5fr] lg:items-center"
            >
              <div>
                <div className="font-bold">
                  {request.staff?.name || request.staff?.email || "Staff member"}
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  {formatDateTime(request.createdAt)}
                </div>
              </div>

              <div>
                <TargetBadge targets={request.targets || []} />
              </div>

              <div>
                <span className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${statusClass(request.status)}`}>
                  {request.status}
                </span>
                {request.status === "approved" && request.expiresAt ? (
                  <div className="mt-2 text-xs text-zinc-500">
                    Expires {formatDateTime(request.expiresAt)}
                  </div>
                ) : null}
              </div>

              <div className="text-sm text-zinc-400">
                {request.rejectionReason || request.reason || "Recorded"}
              </div>
            </div>
          ))}
        </WorkspaceSection>
      </div>

      <style jsx>{`
        .action { display: inline-flex; align-items: center; justify-content: center; gap: .4rem; border-radius: .7rem; border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.05); padding: .55rem .8rem; font-size: .8rem; font-weight: 800; }
        .action:disabled { opacity: .4; }
        .action-ok { border-color: rgba(16,185,129,.25); background: rgba(16,185,129,.1); color: rgb(110,231,183); }
        .action-bad { border-color: rgba(239,68,68,.25); background: rgba(239,68,68,.1); color: rgb(252,165,165); }
      `}</style>
    </main>
  );
}

function TargetBadge({ targets }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-400/[0.08] px-3 py-1 text-xs font-bold text-violet-200">
      {targets.includes("passkey") ? <KeyRound size={14} /> : null}
      {targets.includes("gps") ? <MapPin size={14} /> : null}
      {targetLabel(targets)}
    </span>
  );
}

function WorkspaceSection({ title, eyebrow, empty, loading, children }) {
  const rows = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];

  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
      <div className="p-5">
        <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">{eyebrow}</p>
        <h2 className="mt-1 text-2xl font-black">{title}</h2>
      </div>
      {loading ? (
        <div className="border-t border-white/5 px-5 py-10 text-center text-zinc-500">Loading...</div>
      ) : rows.length ? (
        rows
      ) : (
        <div className="border-t border-white/5 px-5 py-10 text-center text-zinc-500">{empty}</div>
      )}
    </section>
  );
}

function Metric({ icon, label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <div className="flex items-center gap-2 text-zinc-500">
        {icon}
        <span className="text-xs uppercase tracking-wider">{label}</span>
      </div>
      <div className="mt-3 text-3xl font-black">{value}</div>
    </div>
  );
}
