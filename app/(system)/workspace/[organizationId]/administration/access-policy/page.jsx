"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { RefreshCw, Save, ShieldCheck, TimerReset } from "lucide-react";

const EMPTY_POLICY = {
  access: {
    organization_access_enabled: true,
    staff_portal_enabled: true,
  },
  workforce: {
    early_clock_in_minutes: "",
    late_threshold_minutes: "",
  },
};

function normalizePolicy(policy = {}) {
  return {
    access: {
      organization_access_enabled:
        policy?.access?.organization_access_enabled !== false,
      staff_portal_enabled: policy?.access?.staff_portal_enabled !== false,
    },
    workforce: {
      early_clock_in_minutes:
        policy?.workforce?.early_clock_in_minutes ?? "",
      late_threshold_minutes:
        policy?.workforce?.late_threshold_minutes ?? "",
    },
  };
}

export default function OrganizationAccessPolicyPage() {
  const params = useParams();
  const organizationId = String(params?.organizationId || "");
  const [policy, setPolicy] = useState(EMPTY_POLICY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadPolicy() {
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
        throw new Error(result?.error || "Unable to load organization policy");
      }

      setPolicy(normalizePolicy(result.policy));
    } catch (loadError) {
      setError(loadError?.message || "Unable to load organization policy");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPolicy();
  }, [organizationId]);

  function updateAccess(key, value) {
    setPolicy((current) => ({
      ...current,
      access: { ...current.access, [key]: value },
    }));
  }

  function updateWorkforce(key, value) {
    setPolicy((current) => ({
      ...current,
      workforce: { ...current.workforce, [key]: value },
    }));
  }

  async function savePolicy() {
    setError("");
    setMessage("");

    for (const [value, label] of [
      [policy.workforce.early_clock_in_minutes, "Early clock-in minutes"],
      [policy.workforce.late_threshold_minutes, "Late threshold minutes"],
    ]) {
      if (value !== "") {
        const number = Number(value);
        if (!Number.isInteger(number) || number < 0) {
          setError(`${label} must be a non-negative whole number or left blank.`);
          return;
        }
      }
    }

    try {
      setSaving(true);
      const response = await fetch("/api/administration/access-policy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          access: policy.access,
          workforce: {
            early_clock_in_minutes:
              policy.workforce.early_clock_in_minutes === ""
                ? null
                : Number(policy.workforce.early_clock_in_minutes),
            late_threshold_minutes:
              policy.workforce.late_threshold_minutes === ""
                ? null
                : Number(policy.workforce.late_threshold_minutes),
          },
        }),
      });
      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Unable to save organization policy");
      }

      setPolicy(normalizePolicy(result.policy));
      setMessage("Organization access and workforce policy saved.");
    } catch (saveError) {
      setError(saveError?.message || "Unable to save organization policy");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#030303] p-6 text-white lg:p-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="rounded-[32px] border border-white/10 bg-white/[0.045] p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.32em] text-[#D6A66A]">
                Administration · Access & Workforce
              </div>
              <h1 className="mt-3 text-4xl font-black">Organization Policy</h1>
              <p className="mt-2 max-w-3xl text-sm text-white/45">
                Control organization app entry and staff portal availability separately from authentication, and configure workforce timing rules without platform defaults.
              </p>
            </div>
            <button
              type="button"
              onClick={loadPolicy}
              disabled={loading}
              className="flex h-11 items-center gap-2 rounded-xl border border-white/10 px-4 text-xs font-bold uppercase tracking-[0.14em] text-white/70 disabled:opacity-40"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>
        </section>

        {error ? <Notice tone="error">{error}</Notice> : null}
        {message ? <Notice tone="success">{message}</Notice> : null}

        <section className="grid gap-5 lg:grid-cols-2">
          <PolicyCard icon={<ShieldCheck className="h-5 w-5" />} title="App access">
            <Toggle
              label="Organization app access"
              description="When disabled, normal users cannot enter this organization. Owners and recovery administrators retain access so the organization cannot lock itself out."
              checked={policy.access.organization_access_enabled}
              onChange={(value) => updateAccess("organization_access_enabled", value)}
            />
            <Toggle
              label="Staff portal access"
              description="Controls entry for staff-only roles. Workspace administrators are unaffected by this staff portal switch."
              checked={policy.access.staff_portal_enabled}
              onChange={(value) => updateAccess("staff_portal_enabled", value)}
            />
          </PolicyCard>

          <PolicyCard icon={<TimerReset className="h-5 w-5" />} title="Workforce timing">
            <NumberField
              label="Early clock-in minutes"
              value={policy.workforce.early_clock_in_minutes}
              onChange={(value) => updateWorkforce("early_clock_in_minutes", value)}
              description="Leave blank for no early clock-in restriction."
            />
            <NumberField
              label="Late threshold minutes"
              value={policy.workforce.late_threshold_minutes}
              onChange={(value) => updateWorkforce("late_threshold_minutes", value)}
              description="Leave blank to record minutes after scheduled start without classifying the shift as late."
            />
          </PolicyCard>
        </section>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={savePolicy}
            disabled={loading || saving}
            className="flex h-12 items-center gap-2 rounded-xl bg-[#D6A66A] px-5 text-xs font-black uppercase tracking-[0.16em] text-black disabled:opacity-40"
          >
            <Save className="h-4 w-4" /> {saving ? "Saving..." : "Save Policy"}
          </button>
        </div>
      </div>
    </main>
  );
}

function PolicyCard({ icon, title, children }) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-white/[0.035] p-5">
      <div className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.14em] text-white/75">
        {icon} {title}
      </div>
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

function Toggle({ label, description, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-2xl border border-white/10 bg-black/20 p-4">
      <span>
        <span className="block text-sm font-semibold text-white/80">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-white/35">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 shrink-0"
      />
    </label>
  );
}

function NumberField({ label, value, onChange, description }) {
  return (
    <label className="block rounded-2xl border border-white/10 bg-black/20 p-4">
      <span className="text-sm font-semibold text-white/80">{label}</span>
      <span className="mt-1 block text-xs leading-5 text-white/35">{description}</span>
      <input
        type="number"
        min="0"
        step="1"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Not configured"
        className="mt-3 h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm outline-none"
      />
    </label>
  );
}

function Notice({ tone, children }) {
  const classes =
    tone === "error"
      ? "border-red-500/20 bg-red-500/10 text-red-200"
      : "border-emerald-500/20 bg-emerald-500/10 text-emerald-200";
  return <div className={`rounded-2xl border px-4 py-3 text-sm ${classes}`}>{children}</div>;
}
