"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { Banknote, CheckCircle2, RefreshCw, Save, Users } from "lucide-react";

function money(value, currency = "") {
  const amount = Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return currency ? `${currency} ${amount}` : amount;
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
      const response = await fetch("/api/people/compensation", { cache: "no-store" });
      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Unable to load compensation profiles");
      }

      setData(result);
      setDrafts(
        Object.fromEntries(
          (result.employees || []).map((employee) => [
            employee.id,
            {
              bankName: employee.compensation?.bank_name || "",
              bankAccount: employee.compensation?.bank_account || "",
            },
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
    const ready = employees.filter(
      (employee) => employee.compensation?.bank_name && employee.compensation?.bank_account
    ).length;

    return {
      employees: employees.length,
      ready,
      missing: Math.max(employees.length - ready, 0),
    };
  }, [data]);

  async function save(employee) {
    const draft = drafts[employee.id] || {};

    if (!draft.bankName?.trim() || !draft.bankAccount?.trim()) {
      setError("Bank name and account number are required.");
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
          bankName: draft.bankName.trim(),
          bankAccount: draft.bankAccount.trim(),
        }),
      });
      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Unable to save payment details");
      }

      setMessage(`Payment details saved for ${employee.name}.`);
      await load();
    } catch (saveError) {
      setError(saveError?.message || "Unable to save payment details");
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
              <div className="text-[10px] uppercase tracking-[0.34em] text-[#D6A66A]">People · Compensation</div>
              <h1 className="mt-3 text-4xl font-black">Compensation & Payment Profiles</h1>
              <p className="mt-2 max-w-3xl text-sm text-white/45">
                Maintain the canonical employee compensation profile used by Payroll. Bank details saved here are snapshotted into payroll payout lines when a payment batch is prepared.
              </p>
              <div className="mt-3 text-[10px] uppercase tracking-[0.18em] text-white/25">{data?.role || "Role"}</div>
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

        <section className="grid gap-3 sm:grid-cols-3">
          <Metric label="Active Employees" value={summary.employees} icon={<Users className="h-4 w-4" />} />
          <Metric label="Bank Ready" value={summary.ready} icon={<CheckCircle2 className="h-4 w-4" />} />
          <Metric label="Missing Bank Details" value={summary.missing} icon={<Banknote className="h-4 w-4" />} />
        </section>

        {error ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
        ) : null}

        {message ? (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{message}</div>
        ) : null}

        {loading ? (
          <section className="rounded-[30px] border border-white/10 bg-white/[0.035] p-6 text-sm text-white/45">Loading compensation profiles...</section>
        ) : (
          <section className="space-y-4">
            {(data?.employees || []).map((employee) => {
              const profile = employee.compensation;
              const draft = drafts[employee.id] || { bankName: "", bankAccount: "" };
              const ready = Boolean(profile?.bank_name && profile?.bank_account);

              return (
                <article key={employee.id} className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 lg:p-6">
                  <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[1.1fr_.8fr_1.35fr] lg:items-end">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-xl font-black">{employee.name}</h2>
                        <span className={`rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-[0.14em] ${ready ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : "border-amber-500/20 bg-amber-500/10 text-amber-300"}`}>
                          {ready ? "Bank ready" : "Setup required"}
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-white/35">{employee.role || "-"} · {employee.position || employee.department || "-"}</div>
                      <div className="mt-4 text-sm text-white/55">
                        {profile ? `${profile.salary_type || "Salary"} · ${money(profile.monthly_salary, profile.currency)}` : "No active compensation profile"}
                      </div>
                    </div>

                    <label>
                      <span className="mb-2 block text-[9px] uppercase tracking-[0.18em] text-white/35">Bank name</span>
                      <input
                        value={draft.bankName}
                        onChange={(event) => setDrafts((current) => ({ ...current, [employee.id]: { ...draft, bankName: event.target.value } }))}
                        placeholder="Bank name"
                        disabled={!profile}
                        className="h-12 w-full rounded-xl border border-white/10 bg-black/25 px-4 text-sm outline-none placeholder:text-white/20 disabled:opacity-35"
                      />
                    </label>

                    <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                      <label>
                        <span className="mb-2 block text-[9px] uppercase tracking-[0.18em] text-white/35">Account number</span>
                        <input
                          value={draft.bankAccount}
                          onChange={(event) => setDrafts((current) => ({ ...current, [employee.id]: { ...draft, bankAccount: event.target.value } }))}
                          placeholder="Account number"
                          disabled={!profile}
                          className="h-12 w-full rounded-xl border border-white/10 bg-black/25 px-4 text-sm outline-none placeholder:text-white/20 disabled:opacity-35"
                        />
                      </label>

                      <button
                        type="button"
                        onClick={() => save(employee)}
                        disabled={!profile || workingId === employee.id}
                        className="mt-auto flex h-12 items-center justify-center gap-2 rounded-xl bg-[#D6A66A] px-5 text-xs font-black uppercase tracking-[0.16em] text-black disabled:opacity-40"
                      >
                        <Save className="h-4 w-4" />
                        {workingId === employee.id ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}

function Metric({ label, value, icon }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.035] p-5">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-white/35">{icon}{label}</div>
      <div className="mt-3 text-3xl font-black">{value}</div>
    </div>
  );
}
