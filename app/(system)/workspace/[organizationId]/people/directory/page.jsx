"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Banknote,
  CircleAlert,
  KeyRound,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  UserRound,
  UsersRound,
} from "lucide-react";

function money(value, currency = "") {
  const amount = Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return currency ? `${currency} ${amount}` : amount;
}

function dateTime(value) {
  if (!value) return "Never";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function accessLabel(status) {
  if (status === "ACTIVE") return "Active";
  if (status === "ACCOUNT_LINKED") return "Account linked";
  return "Setup required";
}

function accessClass(status) {
  if (status === "ACTIVE") {
    return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
  }

  if (status === "ACCOUNT_LINKED") {
    return "border-cyan-400/20 bg-cyan-400/10 text-cyan-100";
  }

  return "border-amber-400/20 bg-amber-400/10 text-amber-100";
}

function compensationAmount(compensation) {
  if (!compensation) return "Not configured";

  const currency = compensation.currency || "";
  const salaryType = String(compensation.salary_type || "").toUpperCase();

  if (salaryType === "HOURLY") {
    return `${money(compensation.hourly_rate, currency)} / hour`;
  }

  return `${money(compensation.monthly_salary, currency)} / month`;
}

export default function PeopleDirectoryPage({ params }) {
  const organizationId = params?.organizationId || "";
  const [employees, setEmployees] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    salaryType: "MONTHLY",
    payrollFrequency: "MONTHLY",
    currency: "THB",
    monthlySalary: "",
    hourlyRate: "",
    bankName: "",
    bankAccount: "",
  });

  async function load() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/people/directory?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: "no-store" }
      );
      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Unable to load staff directory");
      }

      setEmployees(result.employees || []);
      setSummary(result.summary || null);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load staff directory");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (organizationId) load();
  }, [organizationId]);

  const filteredEmployees = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return employees;

    return employees.filter((employee) =>
      [
        employee.name,
        employee.email,
        employee.role,
        employee.position,
        employee.department,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [employees, query]);

  function editCompensation(employee) {
    const compensation = employee.compensation || {};

    setEditingId(employee.id);
    setMessage("");
    setError("");
    setForm({
      salaryType: compensation.salary_type || "MONTHLY",
      payrollFrequency: compensation.payroll_frequency || "MONTHLY",
      currency: compensation.currency || "THB",
      monthlySalary:
        compensation.monthly_salary === null ||
        typeof compensation.monthly_salary === "undefined"
          ? ""
          : String(compensation.monthly_salary),
      hourlyRate:
        compensation.hourly_rate === null ||
        typeof compensation.hourly_rate === "undefined"
          ? ""
          : String(compensation.hourly_rate),
      bankName: compensation.bank_name || "",
      bankAccount: compensation.bank_account || "",
    });
  }

  async function sendActivation(employee) {
    setWorkingId(employee.id);
    setMessage("");
    setError("");

    try {
      const response = await fetch(
        `/api/people/directory?organizationId=${encodeURIComponent(organizationId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            staffId: employee.id,
            action: "send_activation",
          }),
        }
      );
      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Unable to send setup link");
      }

      setMessage(`Secure setup link sent to ${employee.email}.`);
      await load();
    } catch (actionError) {
      setError(actionError?.message || "Unable to send setup link");
    } finally {
      setWorkingId("");
    }
  }

  async function saveCompensation(employee) {
    setWorkingId(employee.id);
    setMessage("");
    setError("");

    try {
      const response = await fetch(
        `/api/people/compensation?organizationId=${encodeURIComponent(organizationId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            staffId: employee.id,
            salaryType: form.salaryType,
            payrollFrequency: form.payrollFrequency,
            currency: form.currency,
            monthlySalary: form.monthlySalary,
            hourlyRate: form.hourlyRate,
            bankName: form.bankName,
            bankAccount: form.bankAccount,
          }),
        }
      );
      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Unable to save compensation");
      }

      setMessage(`Compensation saved for ${employee.name}.`);
      setEditingId("");
      await load();
    } catch (saveError) {
      setError(saveError?.message || "Unable to save compensation");
    } finally {
      setWorkingId("");
    }
  }

  return (
    <main className="min-h-screen bg-[#030303] p-5 text-white lg:p-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-[34px] border border-white/10 bg-white/[0.045] backdrop-blur-3xl">
          <div className="h-px bg-gradient-to-r from-transparent via-[#D6A66A] to-transparent" />
          <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.34em] text-[#D6A66A]">
                <UsersRound className="h-4 w-4" /> People · Staff Directory
              </div>
              <h1 className="mt-3 text-4xl font-black">Staff Management</h1>
              <p className="mt-2 max-w-2xl text-sm text-white/45">
                Manage portal access and the approved compensation profile linked to each employee Party and legal entity.
              </p>
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

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Metric label="Active staff" value={summary?.activeStaff ?? "-"} icon={UsersRound} />
          <Metric label="Setup required" value={summary?.setupRequired ?? "-"} icon={CircleAlert} />
          <Metric label="Account linked" value={summary?.accountLinked ?? "-"} icon={KeyRound} />
          <Metric label="Portal active" value={summary?.activePortal ?? "-"} icon={BadgeCheck} />
          <Metric label="Pay not configured" value={summary?.compensationUnconfigured ?? "-"} icon={Banknote} />
        </section>

        <section className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 lg:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-white/35">
                <ShieldCheck className="h-4 w-4" /> Canonical employee records
              </div>
              <h2 className="mt-2 text-2xl font-black">Directory</h2>
            </div>

            <label className="flex h-12 w-full items-center gap-3 rounded-2xl border border-white/10 bg-black/30 px-4 lg:max-w-sm">
              <Search className="h-4 w-4 text-white/30" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search staff"
                className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/25"
              />
            </label>
          </div>

          {loading ? (
            <div className="mt-5 rounded-2xl border border-white/[0.07] bg-black/20 p-5 text-sm text-white/35">
              Loading staff directory...
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {filteredEmployees.map((employee) => {
                const accessStatus = employee.portalAccess?.status || "SETUP_REQUIRED";
                const isEditing = editingId === employee.id;
                const configured = Boolean(employee.compensation?.configured);

                return (
                  <article
                    key={employee.id}
                    className="rounded-[26px] border border-white/[0.08] bg-black/25 p-5"
                  >
                    <div className="grid gap-5 xl:grid-cols-[1.2fr_.9fr_.9fr_auto] xl:items-center">
                      <div className="min-w-0">
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05]">
                            <UserRound className="h-5 w-5 text-[#D6A66A]" />
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-lg font-black">{employee.name || "Unnamed staff"}</div>
                            <div className="mt-1 truncate text-xs text-white/35">{employee.email || "No email"}</div>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.12em] text-white/40">
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
                            {employee.role || "Staff"}
                          </span>
                          {(employee.position || employee.department) && (
                            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
                              {employee.position || employee.department}
                            </span>
                          )}
                        </div>
                      </div>

                      <div>
                        <div className="text-[9px] uppercase tracking-[0.2em] text-white/25">Portal access</div>
                        <div className={`mt-2 inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${accessClass(accessStatus)}`}>
                          {accessLabel(accessStatus)}
                        </div>
                        <div className="mt-2 text-xs text-white/30">
                          Last sign-in: {dateTime(employee.portalAccess?.lastSignInAt)}
                        </div>
                      </div>

                      <div>
                        <div className="text-[9px] uppercase tracking-[0.2em] text-white/25">Compensation</div>
                        <div className={`mt-2 text-sm font-black ${configured ? "text-white" : "text-amber-100"}`}>
                          {compensationAmount(employee.compensation)}
                        </div>
                        <div className="mt-2 text-xs text-white/30">
                          {employee.compensation?.payroll_frequency || "Payroll frequency not set"}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 sm:flex-row xl:flex-col">
                        <button
                          type="button"
                          disabled={workingId === employee.id || !employee.email}
                          onClick={() => sendActivation(employee)}
                          className="flex h-10 items-center justify-center gap-2 rounded-xl border border-[#D6A66A]/25 bg-[#D6A66A]/10 px-4 text-[10px] font-black uppercase tracking-[0.12em] text-[#E8C18C] disabled:opacity-35"
                        >
                          <KeyRound className="h-4 w-4" />
                          {workingId === employee.id
                            ? "Sending..."
                            : accessStatus === "SETUP_REQUIRED"
                              ? "Send setup link"
                              : "Resend setup link"}
                        </button>

                        <button
                          type="button"
                          onClick={() => (isEditing ? setEditingId("") : editCompensation(employee))}
                          className="flex h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 text-[10px] font-black uppercase tracking-[0.12em] text-white/65"
                        >
                          <Banknote className="h-4 w-4" /> {isEditing ? "Cancel" : "Edit pay"}
                        </button>
                      </div>
                    </div>

                    {isEditing ? (
                      <div className="mt-5 border-t border-white/[0.07] pt-5">
                        {!employee.compensation ? (
                          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-4 text-sm text-amber-100">
                            No active compensation profile exists for this employee. Create the canonical profile before entering pay.
                          </div>
                        ) : (
                          <>
                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                              <Field label="Salary type">
                                <select
                                  value={form.salaryType}
                                  onChange={(event) => setForm((current) => ({ ...current, salaryType: event.target.value }))}
                                  className="input-control"
                                >
                                  <option value="MONTHLY">Monthly</option>
                                  <option value="HOURLY">Hourly</option>
                                </select>
                              </Field>

                              <Field label="Payroll frequency">
                                <input
                                  value={form.payrollFrequency}
                                  onChange={(event) => setForm((current) => ({ ...current, payrollFrequency: event.target.value.toUpperCase() }))}
                                  className="input-control"
                                />
                              </Field>

                              <Field label="Currency">
                                <input
                                  value={form.currency}
                                  maxLength={3}
                                  onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value.toUpperCase() }))}
                                  className="input-control"
                                />
                              </Field>

                              <Field label={form.salaryType === "HOURLY" ? "Hourly rate" : "Monthly salary"}>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={form.salaryType === "HOURLY" ? form.hourlyRate : form.monthlySalary}
                                  onChange={(event) =>
                                    setForm((current) =>
                                      form.salaryType === "HOURLY"
                                        ? { ...current, hourlyRate: event.target.value }
                                        : { ...current, monthlySalary: event.target.value }
                                    )
                                  }
                                  className="input-control"
                                />
                              </Field>

                              <Field label="Bank name">
                                <input
                                  value={form.bankName}
                                  onChange={(event) => setForm((current) => ({ ...current, bankName: event.target.value }))}
                                  className="input-control"
                                />
                              </Field>

                              <Field label="Bank account">
                                <input
                                  value={form.bankAccount}
                                  onChange={(event) => setForm((current) => ({ ...current, bankAccount: event.target.value }))}
                                  className="input-control"
                                />
                              </Field>
                            </div>

                            <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 lg:flex-row lg:items-center lg:justify-between">
                              <div className="text-xs leading-5 text-white/35">
                                Party and legal-entity scope are preserved from the employee's existing active compensation profile. Saving does not create a second payroll identity.
                              </div>
                              <button
                                type="button"
                                disabled={workingId === employee.id}
                                onClick={() => saveCompensation(employee)}
                                className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#D6A66A] px-5 text-[10px] font-black uppercase tracking-[0.14em] text-black disabled:opacity-40"
                              >
                                <Save className="h-4 w-4" />
                                {workingId === employee.id ? "Saving..." : "Save compensation"}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ) : null}
                  </article>
                );
              })}

              {!filteredEmployees.length ? (
                <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-5 text-sm text-white/35">
                  No staff match this search.
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>

      <style jsx>{`
        :global(.input-control) {
          width: 100%;
          height: 44px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(0, 0, 0, 0.35);
          padding: 0 12px;
          color: white;
          outline: none;
          font-size: 13px;
        }
        :global(.input-control:focus) {
          border-color: rgba(214, 166, 106, 0.45);
        }
        :global(.input-control option) {
          background: #111;
        }
      `}</style>
    </main>
  );
}

function Metric({ label, value, icon: Icon }) {
  return (
    <article className="rounded-[24px] border border-white/10 bg-white/[0.035] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[9px] uppercase tracking-[0.18em] text-white/30">{label}</div>
        <Icon className="h-4 w-4 text-[#D6A66A]" />
      </div>
      <div className="mt-3 text-2xl font-black">{value}</div>
    </article>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[9px] font-black uppercase tracking-[0.16em] text-white/30">
        {label}
      </span>
      {children}
    </label>
  );
}
