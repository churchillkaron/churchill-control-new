"use client";

import { useCallback, useEffect, useState } from "react";
import { Award, RefreshCw, ShieldCheck } from "lucide-react";

function tone(item) {
  if (item?.expiry?.state === "EXPIRED") return "border-red-300 bg-red-50 text-[#984C43]";
  if (item?.expiry?.state === "EXPIRING_SOON") return "border-amber-300 bg-amber-50 text-[#76583A]";
  if (String(item?.status || "").toLowerCase() === "verified") return "border-emerald-300 bg-emerald-50 text-[#5E6D58]";
  return "border-black/[0.08] bg-[#FCFBF9] text-[#817B73]";
}

export default function StaffTrainingPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/staff/training", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to load qualifications");
      setData(payload);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load qualifications");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  const items = data?.qualifications || [];
  const summary = data?.summary || { total: 0, verified: 0, expiring_or_expired: 0 };

  return (
    <main className="min-h-screen bg-[#F7F6F3] p-4 text-[#1B1A18] sm:p-5 lg:p-10">
      <div className="mx-auto max-w-5xl space-y-5">
        <section className="rounded-[30px] border border-black/[0.075] bg-white p-5 shadow-[0_12px_34px_rgba(55,47,38,0.05)] sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-[#D6A66A]"><Award className="h-4 w-4" /> People authority</div>
              <h1 className="mt-3 text-3xl font-black tracking-[-0.03em]">Training & Qualifications</h1>
              <p className="mt-2 text-sm text-[#817B73]">Your qualifications, verification state, validity and expiry. People/HR remains authoritative.</p>
            </div>
            <button type="button" onClick={load} disabled={loading} aria-label="Refresh qualifications" className="grid h-11 w-11 place-items-center rounded-2xl border border-black/[0.08] bg-[#FCFBF9] text-[#817B73] disabled:opacity-40"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2">
            {[['Total', summary.total], ['Verified', summary.verified], ['Attention', summary.expiring_or_expired]].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-black/[0.065] bg-[#FCFBF9] p-3"><div className="text-[9px] uppercase tracking-[0.15em] text-[#AAA49C]">{label}</div><div className="mt-1 text-2xl font-black">{value}</div></div>
            ))}
          </div>
        </section>

        {error ? <div className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-[#984C43]">{error}</div> : null}

        {!loading && data?.configured === false ? (
          <section className="rounded-[26px] border border-amber-300 bg-amber-50 p-5 text-[#76583A]">
            <div className="font-black">Qualification authority is not provisioned in this environment yet</div>
            <p className="mt-2 text-sm leading-6">The Staff Portal is ready for qualifications, but the governed People qualification tables must be provisioned before HR can assign or verify credentials.</p>
          </section>
        ) : !loading && !items.length ? (
          <section className="rounded-[26px] border border-dashed border-black/[0.09] bg-white p-8 text-center"><Award className="mx-auto h-7 w-7 text-[#B4AEA6]" /><div className="mt-3 font-black">No qualifications recorded yet</div><p className="mt-1 text-sm text-[#948E86]">Qualifications assigned by People/HR will appear here.</p></section>
        ) : null}

        <section className="space-y-3">
          {items.map((item) => (
            <article key={item.id} className="rounded-[26px] border border-black/[0.075] bg-white p-4 sm:p-5">
              <div className="flex items-start justify-between gap-4">
                <div><div className="text-lg font-black">{item.name}</div><div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-[#AAA49C]">{item.code || "Qualification"}</div></div>
                <div className={`rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-[0.12em] ${tone(item)}`}>{item.expiry?.state === "EXPIRING_SOON" ? "Expiring" : item.expiry?.state === "EXPIRED" ? "Expired" : item.status || "Unknown"}</div>
              </div>
              {item.description ? <p className="mt-3 text-sm text-[#817B73]">{item.description}</p> : null}
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl bg-[#FCFBF9] p-3"><div className="text-[9px] uppercase tracking-[0.14em] text-[#AAA49C]">Valid from</div><div className="mt-1 text-[#67615A]">{item.valid_from || "—"}</div></div>
                <div className="rounded-xl bg-[#FCFBF9] p-3"><div className="text-[9px] uppercase tracking-[0.14em] text-[#AAA49C]">Valid until</div><div className="mt-1 text-[#67615A]">{item.valid_until || "No expiry"}</div></div>
              </div>
            </article>
          ))}
        </section>

        <div className="flex items-start gap-3 rounded-[22px] border border-[#D6A66A]/20 bg-[#D6A66A]/[0.07] p-4 text-sm text-[#76583A]"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" /> Staff can view qualification status here, but cannot self-verify credentials.</div>
      </div>
    </main>
  );
}
