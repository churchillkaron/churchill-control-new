"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

function currentPayrollMonth() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function money(value) {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function peopleRoute(organizationId, suffix = "") {
  if (!organizationId) return "#";
  return `/workspace/${encodeURIComponent(organizationId)}/people${suffix}`;
}

export default function PayrollPreviewPage() {
  const params = useParams();
  const organizationId = String(params?.organizationId || "").trim();
  const [payrollMonth, setPayrollMonth] = useState(currentPayrollMonth());
  const [preview, setPreview] = useState(null);
  const [readiness, setReadiness] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function runPreview() {
    if (!organizationId || !/^\d{4}-\d{2}$/.test(payrollMonth)) return;

    setLoading(true);
    setError("");
    setPreview(null);

    try {
      const response = await fetch("/api/payroll/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, payrollMonth }),
      });
      const result = await response.json();

      if (result?.readiness) setReadiness(result.readiness);

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Unable to preview payroll");
      }

      setPreview(result.preview || null);
    } catch (previewError) {
      setError(previewError?.message || "Unable to preview payroll");
    } finally {
      setLoading(false);
    }
  }

  const records = preview?.records || [];
  const summary = preview?.summary || null;
  const blockers = useMemo(
    () => (readiness?.blockers || []).filter((item) => item.code !== "PAYROLL_PERIOD_OPEN"),
    [readiness]
  );

  return (
    <main className="min-h-screen bg-[#030303] p-6 text-white lg:p-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-[34px] border border-white/10 bg-white/[0.045] backdrop-blur-3xl">
          <div className="h-px bg-gradient-to-r from-transparent via-[#D6A66A] to-transparent" />
          <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.34em] text-[#D6A66A]">
                <ShieldCheck className="h-4 w-4" /> People · Payroll
              </div>
              <h1 className="mt-3 text-4xl font-black">Payroll Preview</h1>
              <p className="mt-2 max-w-3xl text-sm text-white/45">
                Calculate the payroll result using the same compensation, schedule, attendance, overtime, service-charge, tax and deduction rules as generation without creating or changing payroll records.
              </p>
            </div>
            <Link
              href={peopleRoute(organizationId, "/payroll")}
              className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-white/65"
            >
              Payroll Control
            </Link>
          </div>
        </section>

        <section className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 lg:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">Non-posting preflight</div>
              <h2 className="mt-1 text-2xl font-black">Calculate payroll without persistence</h2>
              <p className="mt-2 text-sm text-white/40">
                Current and closed months may be previewed. Future months, unresolved attendance reviews, missing compensation, missing payroll configuration and locked payroll remain blocked.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="month"
                value={payrollMonth}
                onChange={(event) => setPayrollMonth(event.target.value)}
                className="h-12 rounded-xl border border-white/10 bg-[#111] px-4 text-sm outline-none"
              />
              <button
                type="button"
                onClick={runPreview}
                disabled={loading}
                className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#D6A66A] px-6 text-xs font-black uppercase tracking-[0.16em] text-black disabled:opacity-40"
              >
                {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
                {loading ? "Calculating" : "Run preview"}
              </button>
            </div>
          </div>
        </section>

        {error ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        {blockers.length ? (
          <section className="rounded-[30px] border border-red-500/15 bg-red-500/[0.05] p-5 lg:p-6">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-red-300">
              <AlertTriangle className="h-4 w-4" /> Preview blockers
            </div>
            <div className="mt-4 space-y-2">
              {blockers.map((item) => (
                <div key={item.code} className="rounded-2xl border border-red-400/10 bg-black/20 p-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.14em] text-red-300">
                    {item.code.replaceAll("_", " ")}
                  </div>
                  <div className="mt-1 text-sm text-red-100/70">{item.message}</div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {preview ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Staff" value={summary?.staffCount || 0} />
              <Metric label="Gross Payroll" value={money(summary?.grossSalary)} />
              <Metric label="Deductions" value={money(summary?.deductions)} />
              <Metric label="Net Payroll" value={money(summary?.finalSalary)} accent />
            </section>

            <section className="rounded-[30px] border border-emerald-500/15 bg-emerald-500/[0.05] p-5 lg:p-6">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
                <div>
                  <div className="text-sm font-black text-emerald-200">Preview calculated successfully</div>
                  <div className="mt-1 text-xs leading-5 text-emerald-100/55">
                    This result was not persisted. No payroll rows, approvals, payment records or accounting entries were created or changed.
                  </div>
                </div>
              </div>
            </section>

            <section className="overflow-hidden rounded-[30px] border border-white/10 bg-white/[0.035]">
              <div className="flex flex-col gap-2 p-5 lg:flex-row lg:items-end lg:justify-between lg:p-6">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">Calculated records</div>
                  <h2 className="mt-1 text-2xl font-black">{payrollMonth}</h2>
                </div>
                <div className="text-xs text-white/35">
                  Service charge {money(preview.totalServiceCharge)} · {preview.timezone || "Timezone"}
                </div>
              </div>

              <div className="overflow-x-auto border-t border-white/5">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-black/20 text-[10px] uppercase tracking-[0.14em] text-white/35">
                    <tr>
                      <th className="px-5 py-3">Employee</th>
                      <th className="px-5 py-3">Hours</th>
                      <th className="px-5 py-3">Gross</th>
                      <th className="px-5 py-3">Deductions</th>
                      <th className="px-5 py-3">Net</th>
                      <th className="px-5 py-3">Review</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((row) => (
                      <tr key={row.staff_id} className="border-t border-white/5">
                        <td className="px-5 py-4">
                          <div className="font-bold">{row.staff_name}</div>
                          <div className="mt-1 text-xs text-white/30">{row.role || row.department_cost_center || "Staff"}</div>
                        </td>
                        <td className="px-5 py-4 text-white/65">
                          {Number(row.worked_hours || 0).toFixed(2)} / {Number(row.expected_hours || 0).toFixed(2)}
                        </td>
                        <td className="px-5 py-4 text-white/65">{money(row.gross_salary)}</td>
                        <td className="px-5 py-4 text-white/65">{money(row.deductions)}</td>
                        <td className="px-5 py-4 font-black text-[#D6A66A]">{money(row.final_salary)}</td>
                        <td className="px-5 py-4 text-white/50">{row.review_required ? "Required" : "Clear"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}

function Metric({ label, value, accent = false }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.035] p-5">
      <div className="text-[10px] uppercase tracking-[0.2em] text-white/35">{label}</div>
      <div className={`mt-3 text-3xl font-black ${accent ? "text-[#D6A66A]" : ""}`}>{value}</div>
    </div>
  );
}
