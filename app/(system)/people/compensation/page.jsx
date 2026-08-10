"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import {
  Banknote,
  CheckCircle2,
  RefreshCw,
  Save,
  TriangleAlert,
  Users,
} from "lucide-react";

function money(value, currency = "") {
  const amount = Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return currency ? `${currency} ${amount}` : amount;
}

function draftFromEmployee(employee) {
  const profile = employee?.compensation || {};

  return {
    salaryType: profile.salary_type || "MONTHLY",
    payrollFrequency: profile.payroll_frequency || "MONTHLY",
    currency: profile.currency || "",
    monthlySalary: String(profile.monthly_salary ?? 0),
    hourlyRate: String(profile.hourly_rate ?? 0),
    bankName: profile.bank_name || "",
    bankAccount: profile.bank_account || "",
  };
}

function isPayConfigured(profile) {
  return Boolean(
    profile &&
      (Number(profile.monthly_salary || 0) > 0 ||
        Number(profile.hourly_rate || 0) > 0)
  );
}

export default function CompensationPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState("");
  const [drafts, setDrafts] = useState({});
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
      missingPay: Math.max(employees.length - payConfigured, 0),
    };
  }, [data]);

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
    const draft = drafts[employee.id] || {};

    if (!employee.compensation) {
      setError("This employee does not have an active compensation profile.");
      return;
    }

    const salaryType = String(draft.salaryType || "").toUpperCase();
    const monthlySalary = Number(draft.monthlySalary || 0);
    const hourlyRate = Number(draft.hourlyRate || 0);
    const currency = String(draft.currency || "").trim().toUpperCase();

    if (!["MONTHLY", "HOURLY"].includes(salaryType)) {
      setError("Salary type must be monthly or hourly.");
      return;
    }

    if (!currency || !/^[A-Z]{3}$/.test(currency)) {
      setError("Enter a valid 3-letter currency code.");
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

    setWorkingId(employee.id);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/people/compensation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId: employee.id,
          salaryType,
          payrollFrequency: String(draft.payrollFrequency || "MONTHLY")
            .trim()
            .toUpperCase(),
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

      setMessage(`Compensation saved for ${employee.name}.`);
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
              <h1 className="mt-3 text-4xl font-black">
                Compensation & Payment Profiles
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-white/45">
                Configure the canonical pay profile used by Payroll. Salary and
                hourly rates remain employee-specific; statutory payroll rules
                are configured separately in Payroll Settings.
              </p>
              <div className="mt-3 text-[10px] uppercase tracking-[0.18em] text-white/25">
                {data?.role || "Role"}
              </div>
            </div>

            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="flex h-12 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-xs font-black uppercase tracking-[0.16em] text-white/70 disabled:opacity-40"
            >
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Metric
            label="Active Employees"
            value={summary.employees}
            icon={<Users className="h-4 w-4" />}
          />
          <Metric
            label="Profiles"
            value={summary.withProfile}
            icon={<CheckCircle2 className="h-4 w-4" />}
          />
          <Metric
            label="Pay Configured"
            value={summary.payConfigured}
            icon={<Banknote className="h-4 w-4" />}
          />
          <Metric
            label="Missing Pay"
            value={summary.missingPay}
            icon={<TriangleAlert className="h-4 w-4" />}
          />
          <Metric
            label="Bank Ready"
            value={summary.bankReady}
            icon={<CheckCircle2 className="h-4 w-4" />}
          />
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

        {loading ? (
          <section className="rounded-[30px] border border-white/10 bg-white/[0.035] p-6 text-sm text-white/45">
            Loading compensation profiles...
          </section>
        ) : (
          <section className="space-y-4">
            {(data?.employees || []).map((employee) => {
              const profile = employee.compensation;
              const draft = drafts[employee.id] || draftFromEmployee(employee);
              const configured = isPayConfigured(profile);
              const bankReady = Boolean(profile?.bank_name && profile?.bank_account);

              return (
                <article
                  key={employee.id}
                  className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 lg:p-6"
                >
                  <div className="flex flex-col gap-5">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <h2 className="text-xl font-black">{employee.name}</h2>
                          <StatusBadge
                            good={configured}
                            goodLabel="Pay configured"
                            badLabel={profile ? "Pay required" : "Profile missing"}
                          />
                          <StatusBadge
                            good={bankReady}
                            goodLabel="Bank ready"
                            badLabel="Bank optional"
                            neutral={!bankReady}
                          />
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
                          : "No active compensation profile"}
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <Field label="Salary type">
                        <select
                          value={draft.salaryType}
                          disabled={!profile}
                          onChange={(event) =>
                            updateDraft(employee.id, "salaryType", event.target.value)
                          }
                          className="input"
                        >
                          <option value="MONTHLY">Monthly</option>
                          <option value="HOURLY">Hourly</option>
                        </select>
                      </Field>

                      <Field label="Payroll frequency">
                        <select
                          value={draft.payrollFrequency}
                          disabled={!profile}
                          onChange={(event) =>
                            updateDraft(
                              employee.id,
                              "payrollFrequency",
                              event.target.value
                            )
                          }
                          className="input"
                        >
                          <option value="MONTHLY">Monthly</option>
                          <option value="WEEKLY">Weekly</option>
                          <option value="BIWEEKLY">Biweekly</option>
                        </select>
                      </Field>

                      <Field label="Currency">
                        <input
                          value={draft.currency}
                          maxLength={3}
                          disabled={!profile}
                          onChange={(event) =>
                            updateDraft(
                              employee.id,
                              "currency",
                              event.target.value.toUpperCase()
                            )
                          }
                          placeholder="3-letter code"
                          className="input uppercase"
                        />
                      </Field>

                      <Field
                        label={
                          draft.salaryType === "HOURLY"
                            ? "Hourly rate"
                            : "Monthly salary"
                        }
                      >
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          disabled={!profile}
                          value={
                            draft.salaryType === "HOURLY"
                              ? draft.hourlyRate
                              : draft.monthlySalary
                          }
                          onChange={(event) =>
                            updateDraft(
                              employee.id,
                              draft.salaryType === "HOURLY"
                                ? "hourlyRate"
                                : "monthlySalary",
                              event.target.value
                            )
                          }
                          className="input"
                        />
                      </Field>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1.2fr_auto] xl:items-end">
                      <Field label="Bank name">
                        <input
                          value={draft.bankName}
                          disabled={!profile}
                          onChange={(event) =>
                            updateDraft(employee.id, "bankName", event.target.value)
                          }
                          placeholder="Optional until payment setup"
                          className="input"
                        />
                      </Field>

                      <Field label="Account number">
                        <input
                          value={draft.bankAccount}
                          disabled={!profile}
                          onChange={(event) =>
                            updateDraft(employee.id, "bankAccount", event.target.value)
                          }
                          placeholder="Optional until payment setup"
                          className="input"
                        />
                      </Field>

                      <button
                        type="button"
                        onClick={() => save(employee)}
                        disabled={!profile || workingId === employee.id}
                        className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#D6A66A] px-5 text-xs font-black uppercase tracking-[0.16em] text-black disabled:opacity-40"
                      >
                        <Save className="h-4 w-4" />
                        {workingId === employee.id ? "Saving..." : "Save Profile"}
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
          opacity: 0.35;
        }
      `}</style>
    </main>
  );
}

function Field({ label, children }) {
  return (
    <label>
      <span className="mb-2 block text-[9px] uppercase tracking-[0.18em] text-white/35">
        {label}
      </span>
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
    <span
      className={`rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-[0.14em] ${classes}`}
    >
      {good ? goodLabel : badLabel}
    </span>
  );
}

function Metric({ label, value, icon }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.035] p-5">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-white/35">
        {icon}
        {label}
      </div>
      <div className="mt-3 text-3xl font-black">{value}</div>
    </div>
  );
}
