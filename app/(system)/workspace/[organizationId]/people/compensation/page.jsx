"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import {
  Banknote,
  CheckCircle2,
  CirclePlus,
  RefreshCw,
  Save,
  TriangleAlert,
  Users,
} from "lucide-react";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function money(value, currency = "") {
  const amount = Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency ? `${currency} ${amount}` : amount;
}

function draftFromEmployee(employee) {
  const profile = employee?.compensation || null;
  return {
    salaryType: profile?.salary_type || "",
    payrollFrequency: profile?.payroll_frequency || "",
    currency: profile?.currency || "",
    monthlySalary: profile ? String(profile.monthly_salary ?? 0) : "",
    hourlyRate: profile ? String(profile.hourly_rate ?? 0) : "",
    bankName: profile?.bank_name || "",
    bankAccount: profile?.bank_account || "",
    effectiveFrom: profile?.effective_from || today(),
  };
}

function isPayConfigured(profile) {
  return Boolean(
    profile &&
      (Number(profile.monthly_salary || 0) > 0 ||
        Number(profile.hourly_rate || 0) > 0)
  );
}

function isEmployeeReady(employee) {
  return Boolean(employee?.compensation && isPayConfigured(employee.compensation));
}

export default function CompensationPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState("");
  const [drafts, setDrafts] = useState({});
  const [showIncompleteOnly, setShowIncompleteOnly] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/people/compensation", {
        cache: "no-store",
      });
      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Unable to load compensation profiles");
      }

      setData(result);
      setDrafts(
        Object.fromEntries(
          (result.employees || []).map((employee) => [
            employee.id,
            draftFromEmployee(employee),
          ])
        )
      );
    } catch (loadError) {
      setError(loadError?.message || "Unable to load compensation profiles");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const summary = useMemo(() => {
    const employees = data?.employees || [];
    const withProfile = employees.filter((employee) => employee.compensation).length;
    const payConfigured = employees.filter((employee) =>
      isPayConfigured(employee.compensation)
    ).length;
    const bankReady = employees.filter(
      (employee) =>
        employee.compensation?.bank_name && employee.compensation?.bank_account
    ).length;

    return {
      employees: employees.length,
      withProfile,
      payConfigured,
      bankReady,
      missingProfile: Math.max(employees.length - withProfile, 0),
      missingPay: Math.max(employees.length - payConfigured, 0),
    };
  }, [data]);

  const visibleEmployees = useMemo(() => {
    const employees = [...(data?.employees || [])].sort((left, right) => {
      const readyDifference = Number(isEmployeeReady(left)) - Number(isEmployeeReady(right));
      if (readyDifference !== 0) return readyDifference;
      return String(left.name || "").localeCompare(String(right.name || ""));
    });

    return showIncompleteOnly
      ? employees.filter((employee) => !isEmployeeReady(employee))
      : employees;
  }, [data, showIncompleteOnly]);

  function updateDraft(employeeId, key, value) {
    setDrafts((current) => ({
      ...current,
      [employeeId]: {
        ...(current[employeeId] || {}),
        [key]: value,
      },
    }));
  }

  async function save(employee) {
    const draft = drafts[employee.id] || draftFromEmployee(employee);
    const salaryType = String(draft.salaryType || "").trim().toUpperCase();
    const payrollFrequency = String(draft.payrollFrequency || "").trim().toUpperCase();
    const currency = String(draft.currency || "").trim().toUpperCase();
    const monthlySalary = Number(draft.monthlySalary || 0);
    const hourlyRate = Number(draft.hourlyRate || 0);

    if (!["MONTHLY", "HOURLY"].includes(salaryType)) {
      setError(`Choose a salary type for ${employee.name}.`);
      return;
    }
    if (!["MONTHLY", "WEEKLY", "BIWEEKLY"].includes(payrollFrequency)) {
      setError(`Choose a payroll frequency for ${employee.name}.`);
      return;
    }
    if (!/^[A-Z]{3}$/.test(currency)) {
      setError(`Enter a valid 3-letter currency code for ${employee.name}.`);
      return;
    }
    if (salaryType === "MONTHLY" && monthlySalary <= 0) {
      setError(`Enter a monthly salary for ${employee.name}.`);
      return;
    }
    if (salaryType === "HOURLY" && hourlyRate <= 0) {
      setError(`Enter an hourly rate for ${employee.name}.`);
      return;
    }
    if (!employee.compensation && !/^\d{4}-\d{2}-\d{2}$/.test(draft.effectiveFrom || "")) {
      setError(`Choose an effective date for ${employee.name}.`);
      return;
    }

    setWorkingId(employee.id);
    setError("");
    setMessage("");

    try {
      const creating = !employee.compensation;
      const response = await fetch("/api/people/compensation", {
        method: creating ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId: employee.id,
          entityId: data?.entity?.id || null,
          effectiveFrom: creating ? draft.effectiveFrom : undefined,
          salaryType,
          payrollFrequency,
          currency,
          monthlySalary: salaryType === "MONTHLY" ? monthlySalary : 0,
          hourlyRate: salaryType === "HOURLY" ? hourlyRate : 0,
          bankName: String(draft.bankName || "").trim(),
          bankAccount: String(draft.bankAccount || "").trim(),
        }),
      });
      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Unable to save compensation profile");
      }

      setMessage(
        creating
          ? `Compensation profile created for ${employee.name}.`
          : `Compensation saved for ${employee.name}.`
      );
      await load();
    } catch (saveError) {
      setError(saveError?.message || "Unable to save compensation profile");
    } finally {
      setWorkingId("");
    }
  }

  return (
    <main className="min-h-screen bg-[#030303] p-6 text-white lg:p-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-[34px] border border-white/10 bg-white/[0.045] backdrop-blur-3xl">
          <div className="h-px bg-gradient-to-r from-transparent via-[#D6A66A] to-transparent" />
          <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.34em] text-[#D6A66A]">
                People · Compensation
              </div>
              <h1 className="mt-3 text-4xl font-black">Compensation Onboarding</h1>
              <p className="mt-2 max-w-3xl text-sm text-white/45">
                Create and maintain the canonical compensation profile used by Payroll for each active employee. Pay terms remain employee-specific and are scoped to the selected legal entity.
              </p>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[10px] uppercase tracking-[0.18em] text-white/30">
                <span>{data?.role || "Role"}</span>
                <span>
                  Entity: {data?.entity?.display_name || data?.entity?.legal_name || "Not configured"}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowIncompleteOnly((current) => !current)}
                className={`h-12 rounded-2xl border px-4 text-xs font-black uppercase tracking-[0.14em] transition ${
                  showIncompleteOnly
                    ? "border-[#D6A66A]/40 bg-[#D6A66A]/10 text-[#D6A66A]"
                    : "border-white/10 bg-white/[0.05] text-white/60"
                }`}
              >
                {showIncompleteOnly ? "Showing incomplete" : "Show incomplete"}
              </button>
              <button
                type="button"
                onClick={load}
                disabled={loading}
                className="flex h-12 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-xs font-black uppercase tracking-[0.16em] text-white/70 disabled:opacity-40"
              >
                <RefreshCw className="h-4 w-4" /> Refresh
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <Metric label="Active Employees" value={summary.employees} icon={<Users className="h-4 w-4" />} />
          <Metric label="Profiles" value={summary.withProfile} icon={<CheckCircle2 className="h-4 w-4" />} />
          <Metric label="Missing Profiles" value={summary.missingProfile} icon={<CirclePlus className="h-4 w-4" />} />
          <Metric label="Pay Configured" value={summary.payConfigured} icon={<Banknote className="h-4 w-4" />} />
          <Metric label="Missing Pay" value={summary.missingPay} icon={<TriangleAlert className="h-4 w-4" />} />
          <Metric label="Bank Ready" value={summary.bankReady} icon={<CheckCircle2 className="h-4 w-4" />} />
        </section>

        {error ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
        ) : null}
        {message ? (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{message}</div>
        ) : null}

        {loading ? (
          <section className="rounded-[30px] border border-white/10 bg-white/[0.035] p-6 text-sm text-white/45">
            Loading compensation profiles...
          </section>
        ) : visibleEmployees.length === 0 ? (
          <section className="rounded-[30px] border border-emerald-500/20 bg-emerald-500/[0.07] p-6 text-sm text-emerald-200">
            All active employees have a configured compensation profile for this legal entity.
          </section>
        ) : (
          <section className="space-y-4">
            {visibleEmployees.map((employee) => {
              const profile = employee.compensation;
              const draft = drafts[employee.id] || draftFromEmployee(employee);
              const configured = isPayConfigured(profile);
              const bankReady = Boolean(profile?.bank_name && profile?.bank_account);
              const creating = !profile;

              return (
                <article key={employee.id} className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 lg:p-6">
                  <div className="flex flex-col gap-5">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <h2 className="text-xl font-black">{employee.name}</h2>
                          <StatusBadge good={Boolean(profile)} goodLabel="Profile active" badLabel="Profile required" />
                          <StatusBadge good={configured} goodLabel="Pay configured" badLabel="Pay required" />
                          <StatusBadge good={bankReady} goodLabel="Bank ready" badLabel="Bank optional" neutral={!bankReady} />
                        </div>
                        <div className="mt-2 text-xs text-white/35">
                          {employee.role || "-"} · {employee.position || employee.department || "-"}
                        </div>
                      </div>

                      <div className="text-right text-sm text-white/55">
                        {profile
                          ? `${profile.salary_type || "-"} · ${
                              profile.salary_type === "HOURLY"
                                ? `${money(profile.hourly_rate, profile.currency)} / hour`
                                : money(profile.monthly_salary, profile.currency)
                            }`
                          : "New payroll profile"}
                      </div>
                    </div>

                    {creating ? (
                      <div className="rounded-2xl border border-amber-500/15 bg-amber-500/[0.06] p-4 text-xs leading-5 text-amber-100/70">
                        This employee has no effective compensation profile for the payroll legal entity. Complete the required fields below to onboard them.
                      </div>
                    ) : null}

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                      <Field label="Salary type">
                        <select value={draft.salaryType} onChange={(event) => updateDraft(employee.id, "salaryType", event.target.value)} className="input">
                          <option value="">Select type</option>
                          <option value="MONTHLY">Monthly</option>
                          <option value="HOURLY">Hourly</option>
                        </select>
                      </Field>

                      <Field label="Payroll frequency">
                        <select value={draft.payrollFrequency} onChange={(event) => updateDraft(employee.id, "payrollFrequency", event.target.value)} className="input">
                          <option value="">Select frequency</option>
                          <option value="MONTHLY">Monthly</option>
                          <option value="WEEKLY">Weekly</option>
                          <option value="BIWEEKLY">Biweekly</option>
                        </select>
                      </Field>

                      <Field label="Currency">
                        <input value={draft.currency} maxLength={3} onChange={(event) => updateDraft(employee.id, "currency", event.target.value.toUpperCase())} placeholder="3-letter code" className="input uppercase" />
                      </Field>

                      <Field label={draft.salaryType === "HOURLY" ? "Hourly rate" : "Monthly salary"}>
                        <input type="number" min="0" step="0.01" value={draft.salaryType === "HOURLY" ? draft.hourlyRate : draft.monthlySalary} onChange={(event) => updateDraft(employee.id, draft.salaryType === "HOURLY" ? "hourlyRate" : "monthlySalary", event.target.value)} className="input" />
                      </Field>

                      <Field label="Effective from">
                        <input type="date" value={draft.effectiveFrom} disabled={!creating} onChange={(event) => updateDraft(employee.id, "effectiveFrom", event.target.value)} className="input" />
                      </Field>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1.2fr_auto] xl:items-end">
                      <Field label="Bank name">
                        <input value={draft.bankName} onChange={(event) => updateDraft(employee.id, "bankName", event.target.value)} placeholder="Optional until payment setup" className="input" />
                      </Field>
                      <Field label="Account number">
                        <input value={draft.bankAccount} onChange={(event) => updateDraft(employee.id, "bankAccount", event.target.value)} placeholder="Optional until payment setup" className="input" />
                      </Field>
                      <button
                        type="button"
                        onClick={() => save(employee)}
                        disabled={workingId === employee.id}
                        className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#D6A66A] px-5 text-xs font-black uppercase tracking-[0.16em] text-black disabled:opacity-40"
                      >
                        {creating ? <CirclePlus className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                        {workingId === employee.id ? "Saving..." : creating ? "Create Profile" : "Save Profile"}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}
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
        .input:disabled {
          opacity: 0.45;
        }
      `}</style>
    </main>
  );
}

function Field({ label, children }) {
  return (
    <label>
      <span className="mb-2 block text-[9px] uppercase tracking-[0.18em] text-white/35">{label}</span>
      {children}
    </label>
  );
}

function StatusBadge({ good, goodLabel, badLabel, neutral = false }) {
  const classes = good
    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
    : neutral
      ? "border-white/10 bg-white/[0.04] text-white/40"
      : "border-amber-500/20 bg-amber-500/10 text-amber-300";

  return (
    <span className={`rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-[0.14em] ${classes}`}>
      {good ? goodLabel : badLabel}
    </span>
  );
}

function Metric({ label, value, icon }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <div className="flex items-center gap-2 text-white/35">{icon}<span className="text-[9px] uppercase tracking-[0.16em]">{label}</span></div>
      <div className="mt-2 text-2xl font-black text-white">{value}</div>
    </div>
  );
}
