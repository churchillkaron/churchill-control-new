"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

const inputClass = "h-11 w-full rounded-xl border border-black/[0.09] bg-white px-3 text-[13px] text-[#35312D] outline-none transition focus:border-[#A37849]/50 focus:ring-2 focus:ring-[#A37849]/10";

export default function HotelArrivalPage() {
  const params = useParams();
  const token = String(params?.token || "");
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ fullName: "", email: "", phone: "", preferredLanguage: "", estimatedArrivalAt: "", registrationConsent: false, marketingConsent: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/hotel/pre-arrival/public?token=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.success === false) throw new Error(payload.error || "Unable to open arrival link");
        return payload;
      })
      .then((payload) => {
        if (!active) return;
        setData(payload);
        setForm((current) => ({ ...current, fullName: payload.guest?.full_name || "", email: payload.guest?.email || "", phone: payload.guest?.phone || "", preferredLanguage: payload.guest?.preferred_language || "", estimatedArrivalAt: payload.stay?.estimatedArrivalAt ? String(payload.stay.estimatedArrivalAt).slice(0, 16) : "" }));
      })
      .catch((reason) => active && setError(reason.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [token]);

  async function submit(event) {
    event.preventDefault();
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/hotel/pre-arrival/public", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, ...form }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success === false) throw new Error(payload.error || "Unable to complete registration");
      setComplete(true);
    } catch (reason) { setError(reason.message); } finally { setSaving(false); }
  }

  if (loading) return <main className="min-h-screen bg-[#F7F6F3] p-6 text-[#36312C]"><div className="mx-auto max-w-xl rounded-[24px] border border-black/[0.07] bg-white p-6 text-sm">Opening your arrival details…</div></main>;

  if (complete) return (
    <main className="min-h-screen bg-[#F7F6F3] p-5 text-[#36312C] sm:p-8">
      <section className="mx-auto max-w-xl rounded-[28px] border border-black/[0.07] bg-white p-7 shadow-sm">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8A633C]">Arrival ready</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">Registration complete</h1>
        <p className="mt-3 text-sm leading-6 text-[#777168]">Your details are now with the front desk. The hotel will complete room-readiness and identity checks before check-in.</p>
      </section>
    </main>
  );

  return (
    <main className="min-h-screen bg-[#F7F6F3] p-4 text-[#36312C] sm:p-8">
      <section className="mx-auto max-w-xl overflow-hidden rounded-[28px] border border-black/[0.07] bg-white shadow-sm">
        <header className="border-b border-black/[0.06] bg-[#FBF8F3] p-6 sm:p-7">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8A633C]">Digital arrival</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">{data?.property?.name || "Your hotel stay"}</h1>
          <p className="mt-2 text-sm text-[#7B746C]">{data?.stay?.checkInDate} → {data?.stay?.checkOutDate}</p>
        </header>
        <form onSubmit={submit} className="space-y-5 p-6 sm:p-7">
          {error ? <div className="rounded-xl border border-red-700/15 bg-red-50 px-3 py-2.5 text-sm text-red-800">{error}</div> : null}
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8E877F]">Guest details</div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="sm:col-span-2"><span className="mb-1.5 block text-xs text-[#766F67]">Full name</span><input className={inputClass} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required /></label>
              <label><span className="mb-1.5 block text-xs text-[#766F67]">Email</span><input type="email" className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
              <label><span className="mb-1.5 block text-xs text-[#766F67]">Phone</span><input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
              <label><span className="mb-1.5 block text-xs text-[#766F67]">Preferred language</span><input className={inputClass} value={form.preferredLanguage} onChange={(e) => setForm({ ...form, preferredLanguage: e.target.value })} placeholder="English" /></label>
              <label><span className="mb-1.5 block text-xs text-[#766F67]">Estimated arrival</span><input type="datetime-local" className={inputClass} value={form.estimatedArrivalAt} onChange={(e) => setForm({ ...form, estimatedArrivalAt: e.target.value })} /></label>
            </div>
          </div>
          <div className="space-y-3 rounded-2xl border border-black/[0.06] bg-[#FBFAF7] p-4 text-xs leading-5 text-[#716B63]">
            <label className="flex items-start gap-2"><input className="mt-1" type="checkbox" checked={form.registrationConsent} onChange={(e) => setForm({ ...form, registrationConsent: e.target.checked })} required /><span>I confirm these registration details are correct and may be used by the hotel to prepare my stay.</span></label>
            <label className="flex items-start gap-2"><input className="mt-1" type="checkbox" checked={form.marketingConsent} onChange={(e) => setForm({ ...form, marketingConsent: e.target.checked })} /><span>I agree to receive optional hotel offers and stay enhancements.</span></label>
          </div>
          <button disabled={saving || !form.registrationConsent} className="h-11 w-full rounded-xl bg-[#25231F] text-sm font-semibold text-white disabled:opacity-45">{saving ? "Saving…" : "Complete pre-arrival"}</button>
          <p className="text-center text-[11px] leading-5 text-[#989188]">This does not bypass hotel identity, payment or room-readiness controls. Final check-in remains governed by the front desk.</p>
        </form>
      </section>
    </main>
  );
}
