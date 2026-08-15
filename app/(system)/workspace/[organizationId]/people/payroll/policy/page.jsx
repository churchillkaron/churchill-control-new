"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, RefreshCw, Save, Settings2, TriangleAlert } from "lucide-react";

const DEFAULT_SETTINGS = {
  manager_approval_required: true,
  use_schedule_expected_hours: true,
  variance_threshold_hours: "",
  default_hours_per_shift: "",
  default_working_days_per_week: "",
  salary_proration_enabled: false,
  lateness_deduction_enabled: false,
  training_counts_as_worked: false,
  sick_leave_counts_as_worked: false,
  approved_leave_counts_as_worked: false,
  public_holiday_counts_as_worked: false,
};

function normalizeSettings(settings = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    variance_threshold_hours: settings.variance_threshold_hours ?? "",
    default_hours_per_shift: settings.default_hours_per_shift ?? "",
    default_working_days_per_week: settings.default_working_days_per_week ?? "",
  };
}

export default function PayrollSettingsPage() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [legalEntity, setLegalEntity] = useState(null);
  const [jurisdiction, setJurisdiction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadSettings() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/settings/payroll/load", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Unable to load payroll settings");
      }

      setSettings(normalizeSettings(data.settings || {}));
      setLegalEntity(data.legalEntity || null);
      setJurisdiction(data.jurisdiction || null);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load payroll settings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSettings();
  }, []);

  const readiness = useMemo(() => {
    const missing = [];

    if (!legalEntity?.id) missing.push("Default legal entity");
    if (!String(jurisdiction?.country || "").trim()) missing.push("Payroll jurisdiction");
    if (!/^[A-Z]{3}$/.test(String(jurisdiction?.currency || "").trim().toUpperCase())) {
      missing.push("Legal entity currency");
    }
    if (!Number(settings.default_hours_per_shift || 0)) missing.push("Hours per shift");
    if (!Number(settings.default_working_days_per_week || 0)) missing.push("Working days per week");

    return { missing, ready: missing.length === 0 };
  }, [jurisdiction, legalEntity, settings]);

  function update(key, value) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function requiredPositiveNumber(value, label, { max = null } = {}) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) {
      throw new Error(`${label} must be greater than zero.`);
    }
    if (max !== null && number > max) {
      throw new Error(`${label} must not exceed ${max}.`);
    }
    return number;
  }

  function optionalNonNegativeNumber(value, label) {
    if (value === "" || value === null || typeof value === "undefined") return 0;
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) {
      throw new Error(`${label} must be a non-negative number.`);
    }
    return number;
  }

  async function saveSettings() {
    setError("");
    setMessage("");

    if (!legalEntity?.id || !jurisdiction?.country || !jurisdiction?.currency) {
      setError("Configure the default legal entity jurisdiction and currency before payroll can run.");
      return;
    }

    try {
      const defaultHoursPerShift = requiredPositiveNumber(
        settings.default_hours_per_shift,
        "Default hours per shift",
        { max: 24 }
      );
      const defaultWorkingDaysPerWeek = requiredPositiveNumber(
        settings.default_working_days_per_week,
        "Default working days per week",
        { max: 7 }
      );
      const varianceThresholdHours = optionalNonNegativeNumber(
        settings.variance_threshold_hours,
        "Variance threshold hours"
      );

      setSaving(true);

      const payload = {
        manager_approval_required: Boolean(settings.manager_approval_required),
        use_schedule_expected_hours: Boolean(settings.use_schedule_expected_hours),
        variance_threshold_hours: varianceThresholdHours,
        default_hours_per_shift: defaultHoursPerShift,
        default_working_days_per_week: defaultWorkingDaysPerWeek,
        lateness_deduction_enabled: Boolean(settings.lateness_deduction_enabled),
        training_counts_as_worked: Boolean(settings.training_counts_as_worked),
        sick_leave_counts_as_worked: Boolean(settings.sick_leave_counts_as_worked),
        approved_leave_counts_as_worked: Boolean(settings.approved_leave_counts_as_worked),
        public_holiday_counts_as_worked: Boolean(settings.public_holiday_counts_as_worked),
      };

      const response = await fetch("/api/settings/payroll/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: payload }),
      });
      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Unable to save payroll settings");
      }

      setSettings((current) =>
        normalizeSettings({
          ...current,
          ...(result.settings || payload),
        })
      );
      setMessage("Operational payroll policy saved. Jurisdiction and currency remain owned by the legal entity.");
    } catch (saveError) {
      setError(saveError?.message || "Unable to save payroll settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#030303] p-6 text-white lg:p-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="overflow-hidden rounded-[34px] border border-white/10 bg-white/[0.045] backdrop-blur-3xl">
          <div className="h-px bg-gradient-to-r from-transparent via-[#D6A66A] to-transparent" />
          <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.34em] text-[#D6A66A]">People · Payroll</div>
              <h1 className="mt-3 text-4xl font-black">Payroll Policy</h1>
              <p className="mt-2 max-w-3xl text-sm text-white/45">
                Configure operational payroll rules. Payroll jurisdiction and currency are inherited from the legal entity and cannot be duplicated or overridden here.
              </p>
            </div>

            <button
              type="button"
              onClick={loadSettings}
              disabled={loading}
              className="flex h-12 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-xs font-black uppercase tracking-[0.16em] text-white/70 disabled:opacity-40"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2">
          <Metric
            label="Configuration"
            value={readiness.ready ? "Ready" : "Setup required"}
            icon={readiness.ready ? <CheckCircle2 className="h-4 w-4" /> : <TriangleAlert className="h-4 w-4" />}
          />
          <Metric label="Required fields missing" value={readiness.missing.length} icon={<Settings2 className="h-4 w-4" />} />
        </section>

        {readiness.missing.length ? (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            Required for a complete payroll policy: {readiness.missing.join(", ")}.
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
        ) : null}

        {message ? (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{message}</div>
        ) : null}

        <section className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 lg:p-6">
          {loading ? (
            <div className="text-sm text-white/45">Loading payroll policy...</div>
          ) : (
            <div className="space-y-6">
              <div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">Legal payroll context</div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <ReadOnly label="Legal entity" value={legalEntity?.name || "Not configured"} />
                  <ReadOnly label="Payroll country" value={jurisdiction?.country || "Not configured"} />
                  <ReadOnly label="Currency" value={jurisdiction?.currency || "Not configured"} />
                  <ReadOnly label="Timezone" value={jurisdiction?.timezone || "Organization timezone"} />
                </div>
                <div className="mt-3 rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.05] px-4 py-3 text-xs leading-5 text-cyan-100/65">
                  These values come from Legal Entity setup. Change legal jurisdiction or accounting currency there so Payroll, Finance and statutory logic stay aligned.
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">Work expectations</div>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <Field label="Default hours per shift" required>
                    <NumberField value={settings.default_hours_per_shift} min="0.01" max="24" onChange={(value) => update("default_hours_per_shift", value)} />
                  </Field>
                  <Field label="Working days per week" required>
                    <NumberField value={settings.default_working_days_per_week} min="0.01" max="7" onChange={(value) => update("default_working_days_per_week", value)} />
                  </Field>
                  <Field label="Variance review threshold (hours)">
                    <NumberField value={settings.variance_threshold_hours} min="0" onChange={(value) => update("variance_threshold_hours", value)} />
                  </Field>
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">Payroll runtime rules</div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <Toggle label="Manager approval required" description="Flag meaningful hours variance for manager review." checked={Boolean(settings.manager_approval_required)} onChange={(value) => update("manager_approval_required", value)} />
                  <Toggle label="Use scheduled expected hours" description="Use published schedules as the expected-hours source when available." checked={Boolean(settings.use_schedule_expected_hours)} onChange={(value) => update("use_schedule_expected_hours", value)} />
                  <Toggle label="Reviewed lateness deductions" description="Propose minute-for-minute deductions only for lateness above the configured Workforce grace threshold. Every proposal requires manager review before the employee can acknowledge payroll." checked={Boolean(settings.lateness_deduction_enabled)} onChange={(value) => update("lateness_deduction_enabled", value)} />
                  <Toggle label="Training counts as worked" checked={Boolean(settings.training_counts_as_worked)} onChange={(value) => update("training_counts_as_worked", value)} />
                  <Toggle label="Sick leave counts as worked" checked={Boolean(settings.sick_leave_counts_as_worked)} onChange={(value) => update("sick_leave_counts_as_worked", value)} />
                  <Toggle label="Approved leave counts as worked" checked={Boolean(settings.approved_leave_counts_as_worked)} onChange={(value) => update("approved_leave_counts_as_worked", value)} />
                  <Toggle label="Public holiday counts as worked" checked={Boolean(settings.public_holiday_counts_as_worked)} onChange={(value) => update("public_holiday_counts_as_worked", value)} />
                </div>

                <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs leading-5 text-white/45">
                  Salary proration is reserved and is not an active generic attendance deduction. Monthly base salary is not automatically reduced from attendance variance; any payroll deduction must follow an explicit supported rule and review path.
                </div>

                {settings.lateness_deduction_enabled ? (
                  <div className="mt-3 rounded-2xl border border-amber-400/15 bg-amber-400/[0.06] px-4 py-3 text-xs leading-5 text-amber-100/70">
                    Lateness deductions remain inactive when Workforce has no late threshold configured. The payroll engine uses the employee compensation profile and only deducts minutes above that threshold; it never invents a fixed fine.
                  </div>
                ) : null}
              </div>
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={saveSettings}
              disabled={loading || saving || !readiness.ready}
              className="flex h-12 items-center gap-2 rounded-xl bg-[#D6A66A] px-5 text-xs font-black uppercase tracking-[0.16em] text-black disabled:opacity-40"
            >
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : "Save Payroll Policy"}
            </button>
          </div>
        </section>
      </div>

      <style jsx>{`
        .input {
          height: 3rem;
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(0, 0, 0, 0.25);
          padding: 0 1rem;
          font-size: 0.875rem;
          outline: none;
        }
      `}</style>
    </main>
  );
}

function NumberField({ value, onChange, min = "0", max }) {
  return (
    <input
      type="number"
      min={min}
      max={max}
      step="0.01"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder="Enter value"
      className="input"
    />
  );
}

function Field({ label, required = false, children }) {
  return (
    <label>
      <span className="mb-2 block text-[9px] uppercase tracking-[0.18em] text-white/35">
        {label} {required ? <span className="text-[#D6A66A]">*</span> : null}
      </span>
      {children}
    </label>
  );
}

function ReadOnly({ label, value }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="text-[9px] uppercase tracking-[0.16em] text-white/30">{label}</div>
      <div className="mt-2 text-sm font-black text-white/75">{value}</div>
    </div>
  );
}

function Toggle({ label, description = "", checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/65">
      <span>
        <span className="block font-semibold text-white/75">{label}</span>
        {description ? <span className="mt-1 block text-xs leading-5 text-white/35">{description}</span> : null}
      </span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 shrink-0" />
    </label>
  );
}

function Metric({ label, value, icon }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.035] p-5">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-white/35">
        {icon}
        {label}
      </div>
      <div className="mt-3 text-2xl font-black">{value}</div>
    </div>
  );
}
