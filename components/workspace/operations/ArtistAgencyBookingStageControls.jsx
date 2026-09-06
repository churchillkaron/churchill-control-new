"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";

const TRANSITIONS = Object.freeze({
  inquiry: ["hold", "offer", "lost", "cancelled"],
  hold: ["inquiry", "offer", "lost", "cancelled"],
  offer: ["hold", "contract", "lost", "cancelled"],
  contract: ["offer", "confirmed", "lost", "cancelled"],
  confirmed: ["settled", "cancelled"],
  settled: [],
  lost: [],
  cancelled: [],
});

const EVIDENCE_REQUIRED = new Set(["confirmed", "settled", "lost", "cancelled"]);

function label(value) {
  const text = String(value || "").toLowerCase();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

function actionCopy(target) {
  if (target === "hold") return "Place hold";
  if (target === "offer") return "Move to offer";
  if (target === "contract") return "Move to contract";
  if (target === "confirmed") return "Confirm booking";
  if (target === "settled") return "Mark settled";
  if (target === "lost") return "Mark lost";
  if (target === "cancelled") return "Cancel booking";
  if (target === "inquiry") return "Return to inquiry";
  return `Move to ${label(target)}`;
}

export default function ArtistAgencyBookingStageControls({ booking, organizationId, onChanged }) {
  const currentStage = String(booking?.raw?.attributes?.booking_stage || booking?.stage || "inquiry").toLowerCase();
  const options = useMemo(() => TRANSITIONS[currentStage] || [], [currentStage]);
  const [target, setTarget] = useState(options[0] || "");
  const [evidence, setEvidence] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selectedTarget = options.includes(target) ? target : (options[0] || "");
  const needsEvidence = EVIDENCE_REQUIRED.has(selectedTarget);

  if (!booking?.recordId || options.length === 0) {
    return (
      <section className="mt-4 rounded-[20px] border border-black/[0.07] bg-white p-5">
        <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.13em] text-[#8A633C]"><Check size={11} strokeWidth={1.7} /> Lifecycle</div>
        <p className="mt-3 text-[9px] leading-5 text-[#827B73]">{currentStage === "settled" ? "This booking is settled and terminal." : "This booking has no further governed lifecycle transition."}</p>
      </section>
    );
  }

  const submit = async () => {
    if (!selectedTarget || !organizationId || saving) return;
    if (needsEvidence && !evidence.trim()) {
      setError("Evidence or a human reason is required for this move.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/operations/artist-agency/bookings/${encodeURIComponent(booking.recordId)}/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: organizationId,
          to_stage: selectedTarget,
          evidence: evidence.trim(),
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        if (payload?.error === "BOOKING_CHANGED_RELOAD_REQUIRED") {
          setError("This booking changed elsewhere. Close and reopen it to load authoritative state before making another decision.");
          return;
        }
        if (payload?.error === "TRANSITION_EVIDENCE_REQUIRED") throw new Error("Evidence or a human reason is required for this move.");
        throw new Error(payload?.error || "Booking stage could not be changed");
      }
      setSuccess(`${label(payload?.transition?.from)} → ${label(payload?.transition?.to)} recorded.`);
      setEvidence("");
      await onChanged?.(payload?.booking || null, { reload: true });
    } catch (cause) {
      setError(cause?.message || "Booking stage could not be changed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mt-4 rounded-[20px] border border-[#A37849]/14 bg-[#FFFDF9] p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.13em] text-[#8A633C]"><ShieldCheck size={11} strokeWidth={1.7} /> Governed lifecycle</div>
        <span className="text-[8px] font-semibold text-[#8D867E]">{label(currentStage)}</span>
      </div>
      <p className="mt-2 text-[9px] leading-5 text-[#827B73]">Move only the booking lifecycle here. Commercial documents and Finance settlement remain authoritative in their own domains.</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <label className="block">
          <span className="text-[7px] font-semibold uppercase tracking-[0.08em] text-[#8F8880]">Next stage</span>
          <select value={selectedTarget} onChange={(event) => { setTarget(event.target.value); setError(""); setSuccess(""); }} className="mt-1.5 h-9 w-full rounded-xl border border-black/[0.08] bg-white px-3 text-[9px] font-semibold text-[#4F4943] outline-none focus:border-[#9A744B]/50">
            {options.map((item) => <option key={item} value={item}>{actionCopy(item)}</option>)}
          </select>
        </label>
        <button type="button" onClick={submit} disabled={saving || (needsEvidence && !evidence.trim())} className="mt-auto inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-[#25231F] px-4 text-[9px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{saving ? "Recording…" : actionCopy(selectedTarget)} <ArrowRight size={10} /></button>
      </div>

      <label className="mt-3 block">
        <span className="text-[7px] font-semibold uppercase tracking-[0.08em] text-[#8F8880]">Evidence / reason {needsEvidence ? "· required" : "· optional"}</span>
        <textarea value={evidence} onChange={(event) => { setEvidence(event.target.value); setError(""); setSuccess(""); }} placeholder={needsEvidence ? "Reference the acceptance, settlement proof, cancellation instruction, or reason." : "Add the commercial reason, buyer instruction, or source reference when useful."} className="mt-1.5 min-h-20 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-[9px] leading-5 outline-none focus:border-[#9A744B]/50" />
      </label>

      {error ? <div className="mt-3 rounded-xl border border-red-800/10 bg-red-50 px-3 py-2 text-[8px] text-red-700">{error}</div> : null}
      {success ? <div className="mt-3 rounded-xl border border-emerald-800/10 bg-emerald-50 px-3 py-2 text-[8px] text-emerald-800">{success}</div> : null}
    </section>
  );
}
