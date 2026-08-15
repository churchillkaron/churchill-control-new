"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Banknote,
  CircleAlert,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  UserRoundCheck,
  UserRoundX,
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
  if (status === "ACTIVE") return "Portal active";
  if (status === "ACCOUNT_LINKED") return "Account linked";
  if (status === "INACTIVE") return "Employee inactive";
  return "Setup required";
}

function accessClass(status) {
  if (status === "ACTIVE") {
    return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
  }

  if (status === "ACCOUNT_LINKED") {
    return "border-cyan-400/20 bg-cyan-400/10 text-cyan-100";
  }

  if (status === "INACTIVE") {
    return "border-white/10 bg-white/[0.04] text-white/45";
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

  if (salaryType === "MONTHLY") {
    return `${money(compensation.monthly_salary, currency)} / month`;
  }

  return "Configuration incomplete";
}

function emptyEmployeeForm() {
  return {
    name: "",
    email: "",
    position: "",
    department: "",
  };
}

export default function PeopleDirectoryPage({ params }) {
  const organizationId = params?.organizationId || "";
  const [employees, setEmployees] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState(emptyEmployeeForm());

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
        throw new Error(result?.error || "Unable to load employee directory");
      }

      setEmployees(result.employees || []);
      setSummary(result.summary || null);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load employee directory");
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
        employee.accessRole,
        employee.position,
        employee.department,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [employees, query]);

  function beginCreate() {
    setEditingId("");
    setForm(emptyEmployeeForm());
    setShowCreate(true);
    setError("");
    setMessage("");
  }

  function beginEdit(employee) {
    setShowCreate(false);
    setEditingId(employee.id);
    setForm({
      name: employee.name || "",
      email: employee.email || "",
      position: employee.position || "",
      department: employee.department || "",
    });
    setError("");
    setMessage("");
  }

  function cancelForm() {
    setEditingId("");
    setShowCreate(false);
    setForm(emptyEmployeeForm());
  }

  async function createEmployee() {
    setWorkingId("CREATE");
    setMessage("");
    setError("");

    try {
      const response = await fetch(
        `/api/people/directory?organizationId=${encodeURIComponent(organizationId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "create_employee",
            ...form,
          }),
        }
      );
      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Unable to create employee");
      }

      setMessage(result.message || "Employee created.");
      cancelForm();
      await load();
    } catch (actionError) {
      setError(actionError?.message || "Unable to create employee");
    } finally {
      setWorkingId("");
    }
  }

  async function saveEmployee(employee) {
    setWorkingId(employee.id);
    setMessage("");
    setError("");

    try {
      const response = await fetch(
        `/api/people/directory?organizationId=${encodeURIComponent(organizationId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update_profile",
            staffId: employee.id,
            ...form,
          }),
        }
      );
      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Unable to update employee");
      }

      setMessage(result.message || "Employee profile updated.");
      cancelForm();
      await load();
    } catch (actionError) {
      setError(actionError?.message || "Unable to update employee");
    } finally {
      setWorkingId("");
    }
  }

  async function setActive(employee, active) {
    setWorkingId(employee.id);
    setMessage("");
    setError("");

    try {
      const response = await fetch(
        `/api/people/directory?organizationId=${encodeURIComponent(organizationId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "set_active",
            staffId: employee.id,
            active,
          }),
        }
      );
      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Unable to update employee status");
      }

      setMessage(result.message || "Employee status updated.");
      await load();
    } catch (actionError) {
      setError(actionError?.message || "Unable to update employee status");
    } finally {
      setWorkingId("");
    }
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

  const compensationHref = `/workspace/${encodeURIComponent(organizationId)}/people/compensation`;

  return (
    <main className="min-h-screen bg-[#030303] p-5 text-white lg:p-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-[34px] border border-white/10 bg-white/[0.045] backdrop-blur-3xl">
          <div className="h-px bg-gradient-to-r from-transparent via-[#D6A66A] to-transparent" />
          <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.34em] text-[#D6A66A]">
                <UsersRound className="h-4 w-4" /> People · Employees
              </div>
              <h1 className="mt-3 text-4xl font-black">Employee Directory</h1>
              <p className="mt-2 max-w-3xl text-sm text-white/45">
                Manage canonical employee identity, Party linkage, employment status and staff portal access. Compensation and domain permissions remain in their dedicated workspaces.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={beginCreate}
                className="flex h-12 items-center gap-2 rounded-2xl bg-[#D6A66A] px-4 text-xs font-black uppercase tracking-[0.16em] text-black"
              >
                <Plus className="h-4 w-4" /> New employee
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

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <Metric label="Total employees" value={summary?.totalStaff ?? "-"} icon={UsersRound} />
          <Metric label="Active" value={summary?.activeStaff ?? "-"} icon={UserRoundCheck} />
          <Metric label="Inactive" value={summary?.inactiveStaff ?? "-"} icon={UserRoundX} />
          <Metric label="Setup required" value={summary?.setupRequired ?? "-"} icon={CircleAlert} />
          <Metric label="Portal active" value={summary?.activePortal ?? "-"} icon={BadgeCheck} />
          <Metric label="Pay not configured" value={summary?.compensationUnconfigured ?? "-"} icon={Banknote} />
        </section>

        {showCreate ? (
          <section className="rounded-[30px] border border-[#D6A66A]/20 bg-[#D6A66A]/[0.05] p-5 lg:p-6">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-[#D6A66A]/10 p-3 text-[#D6A66A]">
                <Plus className="h-5 w-5" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-[#D6A66A]">Employee master</div>
                <h2 className="mt-1 text-2xl font-black">Create employee</h2>
                <p className="mt-2 text-sm text-white/40">
                  Creates the employee Party, employee relationship and organization membership. Portal activation and compensation are separate controlled steps.
                </p>
              </div>
            </div>

            <EmployeeFields form={form} setForm={setForm} />

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={cancelForm}
                className="h-11 rounded-xl border border-white/10 bg-white/[0.04] px-5 text-xs font-black uppercase tracking-[0.14em]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={workingId === "CREATE" || !form.name.trim() || !form.email.trim()}
                onClick={createEmployee}
                className="h-11 rounded-xl bg-[#D6A66A] px-5 text-xs font-black uppercase tracking-[0.14em] text-black disabled:opacity-40"
              >
                {workingId === "CREATE" ? "Creating..." : "Create employee"}
              </button>
            </div>
          </section>
        ) : null}

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
                placeholder="Search employees"
                className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/25"
              />
            </label>
          </div>

          {loading ? (
            <div className="mt-5 rounded-2xl border border-white/[0.07] bg-black/20 p-5 text-sm text-white/35">
              Loading employee directory...
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {filteredEmployees.map((employee) => {
                const accessStatus = employee.portalAccess?.status || "SETUP_REQUIRED";
                const isEditing = editingId === employee.id;
                const configured = Boolean(employee.compensation?.configured);
                const active = employee.active !== false;

                return (
                  <article
                    key={employee.id}
                    className={`rounded-[26px] border p-5 ${
                      active
                        ? "border-white/[0.08] bg-black/25"
                        : "border-white/[0.06] bg-white/[0.02] opacity-75"
                    }`}
                  >
                    <div className="grid gap-5 xl:grid-cols-[1.25fr_.8fr_.9fr_auto] xl:items-center">
                      <div className="min-w-0">
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05]">
                            <UserRound className="h-5 w-5 text-[#D6A66A]" />
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-lg font-black">{employee.name || "Unnamed employee"}</div>
                            <div className="mt-1 truncate text-xs text-white/35">{employee.email || "No email"}</div>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.12em] text-white/40">
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
                            {employee.position || "Position not set"}
                          </span>
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
                            {employee.department || "Department not set"}
                          </span>
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
                            Access: {employee.accessRole || "STAFF"}
                          </span>
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
                          {employee.compensation?.payroll_frequency || "Payroll setup required"}
                        </div>
                        <Link
                          href={compensationHref}
                          className="mt-2 inline-flex text-[10px] font-black uppercase tracking-[0.12em] text-[#D6A66A]"
                        >
                          Open compensation
                        </Link>
                      </div>

                      <div className="flex flex-col gap-2 sm:flex-row xl:flex-col">
                        <button
                          type="button"
                          onClick={() => (isEditing ? cancelForm() : beginEdit(employee))}
                          className="flex h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 text-[10px] font-black uppercase tracking-[0.12em] text-white/65"
                        >
                          <Pencil className="h-4 w-4" /> {isEditing ? "Cancel edit" : "Edit profile"}
                        </button>

                        {active ? (
                          <>
                            <button
                              type="button"
                              disabled={workingId === employee.id || !employee.email}
                              onClick={() => sendActivation(employee)}
                              className="flex h-10 items-center justify-center gap-2 rounded-xl border border-[#D6A66A]/25 bg-[#D6A66A]/10 px-4 text-[10px] font-black uppercase tracking-[0.12em] text-[#E8C18C] disabled:opacity-35"
                            >
                              <KeyRound className="h-4 w-4" />
                              {workingId === employee.id
                                ? "Working..."
                                : accessStatus === "SETUP_REQUIRED"
                                  ? "Send setup link"
                                  : "Resend setup link"}
                            </button>
                            <button
                              type="button"
                              disabled={workingId === employee.id}
                              onClick={() => setActive(employee, false)}
                              className="flex h-10 items-center justify-center gap-2 rounded-xl border border-red-400/15 bg-red-400/[0.06] px-4 text-[10px] font-black uppercase tracking-[0.12em] text-red-200 disabled:opacity-35"
                            >
                              <UserRoundX className="h-4 w-4" /> Deactivate
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            disabled={workingId === employee.id}
                            onClick={() => setActive(employee, true)}
                            className="flex h-10 items-center justify-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-200 disabled:opacity-35"
                          >
                            <UserRoundCheck className="h-4 w-4" /> Reactivate
                          </button>
                        )}
                      </div>
                    </div>

                    {isEditing ? (
                      <div className="mt-5 border-t border-white/[0.07] pt-5">
                        <div className="flex items-start gap-3">
                          <div>
                            <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">Employee profile</div>
                            <div className="mt-1 text-sm text-white/45">
                              Position and department describe the employee's job. Access roles and domain permissions are managed separately.
                            </div>
                          </div>
                        </div>

                        <EmployeeFields form={form} setForm={setForm} />

                        {employee.auth_user_id && form.email.trim().toLowerCase() !== String(employee.email || "").trim().toLowerCase() ? (
                          <div className="mt-3 rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-4 text-sm text-amber-100/80">
                            This employee already has portal access. Login-email changes require the identity email-change workflow and cannot be performed from Employee Directory.
                          </div>
                        ) : null}

                        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-end">
                          <button
                            type="button"
                            onClick={cancelForm}
                            className="h-11 rounded-xl border border-white/10 bg-white/[0.04] px-5 text-xs font-black uppercase tracking-[0.14em]"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={workingId === employee.id || !form.name.trim() || !form.email.trim()}
                            onClick={() => saveEmployee(employee)}
                            className="h-11 rounded-xl bg-[#D6A66A] px-5 text-xs font-black uppercase tracking-[0.14em] text-black disabled:opacity-40"
                          >
                            {workingId === employee.id ? "Saving..." : "Save employee"}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}

              {!filteredEmployees.length ? (
                <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-5 text-sm text-white/35">
                  No employees match this search.
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
      `}</style>
    </main>
  );
}

function EmployeeFields({ form, setForm }) {
  return (
    <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <Field label="Name">
        <input
          value={form.name}
          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          className="input-control"
          autoComplete="name"
        />
      </Field>
      <Field label="Email">
        <input
          type="email"
          value={form.email}
          onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
          className="input-control"
          autoComplete="email"
        />
      </Field>
      <Field label="Position">
        <input
          value={form.position}
          onChange={(event) => setForm((current) => ({ ...current, position: event.target.value }))}
          placeholder="e.g. Supervisor, Technician, Accountant"
          className="input-control"
        />
      </Field>
      <Field label="Department">
        <input
          value={form.department}
          onChange={(event) => setForm((current) => ({ ...current, department: event.target.value }))}
          placeholder="e.g. Operations, Finance, Service"
          className="input-control"
        />
      </Field>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label>
      <div className="mb-2 text-[9px] uppercase tracking-[0.16em] text-white/30">{label}</div>
      {children}
    </label>
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
