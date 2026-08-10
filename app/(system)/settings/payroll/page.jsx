"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, RefreshCw, Save, Settings2, TriangleAlert } from "lucide-react";

const DEFAULT_SETTINGS = {
  country: "",
  currency: "",
  tax_rate: "",
  social_security_rate: "",
  max_social_security: "",
  payroll_frequency: "MONTHLY",
  overtime_multiplier: "",
  standard_work_hours: "",
  pension_rate: "",
  payroll_approval_required: true,
  payroll_auto_lock: true,
  allow_manual_adjustments: false,
};

function normalizeSettings(settings = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    country: settings.country || "",
    currency: settings.currency || "",
    tax_rate: settings.tax_rate ?? "",
    social_security_rate: settings.social_security_rate ?? "",
    max_social_security: settings.max_social_security ?? "",
    payroll_frequency: settings.payroll_frequency || "MONTHLY",
    overtime_multiplier: settings.overtime_multiplier ?? "",
    standard_work_hours: settings.standard_work_hours ?? "",
    pension_rate: settings.pension_rate ?? "",
  };
}

export default function PayrollSettingsPage() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
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

    if (!String(settings.country || "").trim()) missing.push("Country");
    if (!/^[A-Z]{3}$/.test(String(settings.currency || "").trim().toUpperCase())) {
      missing.push("Currency");
    }

    return { missing, ready: missing.length === 0 };
  }, [settings]);

  function update(key, value) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function optionalNumber(value, label) {
    if (value === "" || value === null || typeof value === "undefined") return undefined;
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) {
      throw new Error(`${label} must be a non-negative number.`);
    }
    return number;
  }

  async function saveSettings() {
    setError("");
    setMessage("");

    const country = String(settings.country || "").trim();
    const currency = String(settings.currency || "").trim().toUpperCase();

    if (!country) {
      setError("Payroll country is required before payroll can run.");
      return;
    }

    if (!/^[A-Z]{3}$/.test(currency)) {
      setError("Currency must be a 3-letter code.");
      return;
    }

    try {
      setSaving(true);

      const payload = {
        ...settings,
        country,
        currency,
      };

      const numericFields = [
        ["tax_rate", "Tax rate"],
        ["social_security_rate", "Social security rate"],
        ["max_social_security", "Maximum social security"],
        ["overtime_multiplier", "Overtime multiplier"],
        ["standard_work_hours", "Standard work hours"],
        ["pension_rate", "Pension rate"],
      ];

      for (const [key, label] of numericFields) {
        const number = optionalNumber(settings[key], label);
        if (number === undefined) delete payload[key];
        else payload[key] = number;
      }

      const response = await fetch("/api/settings/payroll/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: payload }),
      });
      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Unable to save payroll settings");
      }

      setSettings(normalizeSettings(result.settings || payload));
      setMessage("Payroll settings saved.");
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
              <div className="text-[10px] uppercase tracking-[0.34em] text-[#D6A66A]">
                People · Payroll
              </div>
              <h1 className="mt-3 text-4xl font-black">Payroll Configuration</h1>
              <p className="mt-2 max-w-3xl text-sm text-white/45">
                Configure organization payroll policy. No jurisdiction, currency,
                tax rate or statutory contribution is assumed by the platform.
              </p>
            </div>

            <button
              type="button"
              onClick={loadSettings}
              disabled={loading}
              className="flex h-12 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-xs font-black uppercase tracking-[0.16em] text-white/70 disabled:opacity-40"
            >
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2">
          <Metric
            label="Configuration"
            value={readiness.ready ? "Ready" : "Setup required"}
            icon={
              readiness.ready ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <TriangleAlert className="h-4 w-4" />
              )
            }
          />
          <Metric
            label="Required fields missing"
            value={readiness.missing.length}
            icon={<Settings2 className="h-4 w-4" />}
          />
        </section>

        {readiness.missing.length ? (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            Required before payroll can generate: {readiness.missing.join(", ")}.
          </div>
        ) : null}

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

        <section className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 lg:p-6">
          {loading ? (
            <div className="text-sm text-white/45">Loading payroll settings...</div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Payroll country" required>
                <input
                  value={settings.country}
                  onChange={(event) => update("country", event.target.value)}
                  placeholder="Enter configured payroll country"
                  className="input"
                />
              </Field>

              <Field label="Currency" required>
                <input
                  value={settings.currency}
                  maxLength={3}
                  onChange={(event) =>
                    update("currency", event.target.value.toUpperCase())
                  }
                  placeholder="3-letter currency code"
                  className="input uppercase"
                />
              </Field>

              <Field label="Payroll frequency">
                <select
                  value={settings.payroll_frequency}
                  onChange={(event) =>
                    update("payroll_frequency", event.target.value)
                  }
                  className="input"
                >
                  <option value="MONTHLY">Monthly</option>
                  <option value="WEEKLY">Weekly</option>
                  <option value="BIWEEKLY">Biweekly</option>
                </select>
              </Field>

              <Field label="Standard work hours">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={settings.standard_work_hours}
                  onChange={(event) =>
                    update("standard_work_hours", event.target.value)
                  }
                  placeholder="Optional"
                  className="input"
                />
              </Field>

              <Field label="Tax rate">
                <NumberField
                  value={settings.tax_rate}
                  onChange={(value) => update("tax_rate", value)}
                />
              </Field>

              <Field label="Social security rate">
                <NumberField
                  value={settings.social_security_rate}
                  onChange={(value) => update("social_security_rate", value)}
                />
              </Field>

              <Field label="Maximum social security">
                <NumberField
                  value={settings.max_social_security}
                  onChange={(value) => update("max_social_security", value)}
                />
              </Field>

              <Field label="Pension rate">
                <NumberField
                  value={settings.pension_rate}
                  onChange={(value) => update("pension_rate", value)}
                />
              </Field>

              <Field label="Overtime multiplier">
                <NumberField
                  value={settings.overtime_multiplier}
                  onChange={(value) => update("overtime_multiplier", value)}
                />
              </Field>

              <div className="grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 md:col-span-2 lg:grid-cols-3">
                <Toggle
                  label="Manager approval required"
                  checked={Boolean(settings.payroll_approval_required)}
                  onChange={(value) => update("payroll_approval_required", value)}
                />
                <Toggle
                  label="Auto-lock approved payroll"
                  checked={Boolean(settings.payroll_auto_lock)}
                  onChange={(value) => update("payroll_auto_lock", value)}
                />
                <Toggle
                  label="Allow manual adjustments"
                  checked={Boolean(settings.allow_manual_adjustments)}
                  onChange={(value) => update("allow_manual_adjustments", value)}
                />
              </div>
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={saveSettings}
              disabled={loading || saving}
              className="flex h-12 items-center gap-2 rounded-xl bg-[#D6A66A] px-5 text-xs font-black uppercase tracking-[0.16em] text-black disabled:opacity-40"
            >
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : "Save Payroll Settings"}
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

function NumberField({ value, onChange }) {
  return (
    <input
      type="number"
      min="0"
      step="0.01"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder="Optional"
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

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/65">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4"
      />
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
