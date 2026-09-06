"use client";

import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";

function clean(value, limit = 1600) {
  return String(value ?? "").trim().slice(0, limit);
}

function safeFinanceReturnPath(value, organizationId) {
  const path = clean(value);
  const prefix = `/workspace/${organizationId}/finance`;
  return path.startsWith(prefix) ? path : null;
}

export default function FinanceSourceReturnRail({ organizationId, capability }) {
  const searchParams = useSearchParams();
  const source = clean(searchParams?.get("source"), 80);
  const returnPath = safeFinanceReturnPath(searchParams?.get("returnTo"), organizationId);
  const filingId = clean(searchParams?.get("returnVatReturnId"), 160);
  const dependencyCode = clean(searchParams?.get("returnDependencyCode"), 120).toUpperCase();
  const focusRecordId = clean(searchParams?.get("focusRecordId"), 240);

  if (source !== "tax-evidence" || !returnPath || !filingId) return null;

  const dependencyLabel = dependencyCode
    ? dependencyCode.replaceAll("_", " ").toLowerCase()
    : "VAT evidence";

  return <div className="mx-auto mb-3 max-w-[1760px] px-4 sm:px-5 lg:px-6">
    <div className="flex flex-col gap-3 rounded-2xl border border-[#A37849]/15 bg-[#FFF9F0] px-3.5 py-3 text-[#493D31] shadow-[0_6px_22px_rgba(35,31,27,0.025)] sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-[#8A633C]"><ShieldCheck size={10} /> VAT source repair context</div>
        <div className="mt-1 text-[10px] font-semibold">Work only on the exact source record, then return to the filing.</div>
        <div className="mt-0.5 text-[8px] leading-4 text-[#81766B]">{capability?.name || "Finance source"}{focusRecordId ? ` · source ${focusRecordId}` : ""} · return to {dependencyLabel}. Fixing this record does not clear Tax by itself; the filing re-runs live preflight when you return.</div>
      </div>
      <Link href={returnPath} className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#3F352A] px-3 text-[8px] font-semibold text-white"><ArrowLeft size={10} /> Back to VAT evidence</Link>
    </div>
  </div>;
}
