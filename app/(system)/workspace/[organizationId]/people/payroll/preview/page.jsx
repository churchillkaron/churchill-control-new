"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import { useOrganizationRuntime } from "@/lib/hooks/useOrganizationRuntime";

function currentPayrollMonth() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function money(value, currency = "") {
  const amount = Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency ? `${currency} ${amount}` : amount;
}

function peopleRoute(organizationId, suffix = "") {
  if (!organizationId) return "#";
  return `/workspace/${encodeURIComponent(organizationId)}/people${suffix}`;
}

function otherDeductions(row) {
  return Math.max(
    0,
    Number(row?.deductions || 0) -
      Number(row?.tax_amount || 0) -
      Number(row?.social_security || 0)
  );
}

export default function PayrollPreviewPage() {
  const params = useParams();
  const runtime = useOrganizationRuntime();
  const organizationId = String(params?.organizationId || "").trim();
  const entityId = String(runtime.entityId || "").trim();
  const entityName =
    runtime.entity?.display_name ||
    runtime.entity?.legal_name ||
    runtime.entity?.name ||
    runtime.entity?.code ||
    "Legal entity";
  const [payrollMonth, setPayrollMonth] = useState(currentPayrollMonth());
  const [preview, setPreview] = useState(null);
  const [readiness, setReadiness] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setPreview(null);
    setReadiness(null);
    setError("");
  }, [entityId]);

  async function runPreview() {
    if (!organizationId || !entityId || !/^\d{4}-\d{2}$/.test(payrollMonth)) return;

    setLoading(true);
    setError("");
    setPreview(null);

    try {
      const response = await fetch("/api/payroll/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, entityId, payrollMonth }),
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
  const currency = String(readiness?.jurisdiction?.currency || "").trim().toUpperCase();
  const blockers = useMemo(
    () => (readiness?.blockers || []).filter((item) => item.code !== "PAYROLL_PERIOD_OPEN"),
    [readiness]
  );
  const lifecycleBlockers = readiness?.lifecycleBlockers || [];

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
                Calculate the same canonical payroll result used by generation without creating payroll, payment or accounting records.
              </p>
              <div className="mt-3 text-[10px] uppercase tracking-[0.18em] text-white/25">
                {entityName}
              </div>
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
                Preview validates payroll inputs and calculates base pay, hours, overtime, leave, service charge, tax, social security, deductions and net pay using the same engine as generation.
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
                disabled={loading || !entityId}
                className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#D6A66A] px-6 text-xs font-black uppercase tracking-[0.16em] text-black disabled:opacity-40"
              >
                {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
                {loading ? "Calculating" : "Run preview"}
              </button>
            </div>
          </div>
        </section>

        {!entityId && runtime.ready ? (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            Select an active legal entity in the global header before running payroll preview.
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        {blockers.length ? (
          <IssueGroup title="Preview blockers" items={blockers} tone="red" />
        ) : null}

        {readiness && lifecycleBlockers.length ? (
          <IssueGroup
            title="Later lifecycle actions"
            items={lifecycleBlockers}
            tone="amber"
            description="These do not change the preview calculation, but must be resolved before payment and terminal payroll completion."
          />
        ) : null}

        {preview ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <Metric label="Staff" value={summary?.staffCount || 0} />
              <Metric label="Gross Payroll" value={money(summary?.grossSalary, currency)} />
              <Metric label="Overtime" value={money(summary?.overtimePay, currency)} />
              <Metric label="Service Charge" value={money(summary?.serviceCharge, currency)} />
              <Metric label="Deductions" value={money(summary?.deductions, currency)} />
              <Metric label="Net Payroll" value={money(summary?.finalSalary, currency)} accent />
            </section>

            <section className="rounded-[30px] border border-emerald-500/15 bg-emerald-500/[0.05] p-5 lg:p-6">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
                <div>
                  <div className="text-sm font-black text-emerald-200">Preview calculated successfully</div>
                  <div className="mt-1 text-xs leading-5 text-emerald-100/55">
                    No payroll rows, approvals, payment records or accounting entries were created or changed.
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
                  {currency || "Currency unavailable"} · Service charge {money(preview.totalServiceCharge, currency)} · {preview.timezone || "Timezone"}
                </div>
              </div>

              <div className="overflow-x-auto border-t border-white/5">
                <table className="min-w-[1280px] text-left text-sm">
                  <thead className="bg-black/20 text-[10px] uppercase tracking-[0.14em] text-white/35">
                    <tr>
                      <th className="px-4 py-3">Employee</th>
                      <th className="px-4 py-3">Approved Hours</th>
                      <th className="px-4 py-3">Base Pay</th>
                      <th className="px-4 py-3">Overtime</th>
                      <th className="px-4 py-3">Service</th>
                      <th className="px-4 py-3">Gross</th>
                      <th className="px-4 py-3">Tax</th>
                      <th className="px-4 py-3">Social</th>
                      <th className="px-4 py-3">Other Ded.</th>
                      <th className="px-4 py-3">Net</th>
                      <th className="px-4 py-3">Review</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((row) => (
                      <tr key={row.staff_id} className="border-t border-white/5">
                        <td className="px-4 py-4">
                          <div className="font-bold">{row.staff_name}</div>
                          <div className="mt-1 text-xs text-white/30">{row.role || row.department_cost_center || "Staff"}</div>
                        </td>
                        <td className="px-4 py-4 text-white/65">
                          {Number(row.approved_hours || 0).toFixed(2)}
                          <div className="mt-1 text-[10px] text-white/25">OT {Number(row.overtime_hours || 0).toFixed(2)}</div>
                        </td>
                        <td className="px-4 py-4 text-white/65">{money(row.base_salary, currency)}</td>
                        <td className="px-4 py-4 text-white/65">{money(row.overtime_pay, currency)}</td>
                        <td className="px-4 py-4 text-white/65">{money(row.service_charge_bonus, currency)}</td>
                        <td className="px-4 py-4 text-white/65">{money(row.gross_salary, currency)}</td>
                        <td className="px-4 py-4 text-white/65">{money(row.tax_amount, currency)}</td>
                        <td className="px-4 py-4 text-white/65">{money(row.social_security, currency)}</td>
                        <td className="px-4 py-4 text-white/65">{money(otherDeductions(row), currency)}</td>
                        <td className="px-4 py-4 font-black text-[#D6A66A]">{money(row.final_salary, currency)}</td>
                        <td className="px-4 py-4 text-white/50">{row.review_required ? "Required" : "Clear"}</td>
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

function IssueGroup({ title, items, tone, description = "" }) {
  const red = tone === "red";
  return (
    <section className={`rounded-[30px] border p-5 lg:p-6 ${red ? "border-red-500/15 bg-red-500/[0.05]" : "border-amber-400/15 bg-amber-400/[0.05]"}`}>
      <div className={`flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] ${red ? "text-red-300" : "text-amber-300"}`}>
        <AlertTriangle className="h-4 w-4" /> {title}
      </div>
      {description ? <div className="mt-2 text-xs text-white/40">{description}</div> : null}
      <div className="mt-4 space-y-2">
        {items.map((item) => (
          <div key={item.code} className="rounded-2xl border border-white/[0.07] bg-black/20 p-4">
            <div className={`text-[10px] font-black uppercase tracking-[0.14em] ${red ? "text-red-300" : "text-amber-300"}`}>
              {item.code.replaceAll("_", " ")}
            </div>
            <div className="mt-1 text-sm text-white/65">{item.message}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Metric({ label, value, accent = false }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.035] p-5">
      <div className="text-[10px] uppercase tracking-[0.2em] text-white/35">{label}</div>
      <div className={`mt-3 text-2xl font-black ${accent ? "text-[#D6A66A]" : ""}`}>{value}</div>
    </div>
  );
}
