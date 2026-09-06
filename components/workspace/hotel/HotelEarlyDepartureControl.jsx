"use client";

import { useEffect, useMemo, useState } from "react";

import {
  HotelField,
  HotelPrimaryAction,
  HotelSecondaryAction,
  HotelSection,
  HotelStatusPill,
  hotelInputClass,
  hotelTextareaClass,
  hotelWorkspaceHref,
} from "@/components/workspace/hotel/HotelWorkspaceUI";

const EARLY_DEPARTURE_REASONS = Object.freeze([
  ["GUEST_REQUEST", "Guest request"],
  ["TRAVEL_CHANGE", "Travel changed"],
  ["MEDICAL_OR_EMERGENCY", "Medical / emergency"],
  ["SERVICE_RECOVERY", "Service recovery"],
  ["PROPERTY_REQUEST", "Property request"],
  ["OTHER", "Other"],
]);

function clean(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return clean(value).toUpperCase();
}

function dateValue(value) {
  return clean(value).slice(0, 10);
}

async function postEarlyDeparture(body) {
  const response = await fetch("/api/hotel/bookings/early-departure", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(payload.error || "Early departure could not be updated");
  }
  return payload;
}

export default function HotelEarlyDepartureControl({ booking, organizationId, onChanged }) {
  const [reason, setReason] = useState("GUEST_REQUEST");
  const [detail, setDetail] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const today = new Date().toISOString().slice(0, 10);
  const reviewStatus = upper(booking?.early_departure_review_status);
  const eligible = upper(booking?.status) === "CHECKED_IN" && dateValue(booking?.check_out_date) > today;
  const stage = reviewStatus === "CONFIRMED" ? "CONFIRMED" : reviewStatus === "REVIEW_REQUIRED" ? "REVIEW" : "PREPARE";
  const paymentsHref = useMemo(() => {
    if (!booking?.id || !organizationId) return null;
    const query = new URLSearchParams({ bookingId: String(booking.id) });
    if (booking.property_id) query.set("propertyId", String(booking.property_id));
    return `${hotelWorkspaceHref(organizationId, "hotel-payments")}?${query.toString()}`;
  }, [booking?.id, booking?.property_id, organizationId]);

  useEffect(() => {
    setReason("GUEST_REQUEST");
    setDetail("");
    setReviewNote(booking?.early_departure_review_note || "");
    setError("");
    setSuccess("");
  }, [booking?.id]);

  if (!eligible && reviewStatus !== "CONFIRMED") return null;

  async function refresh() {
    if (typeof onChanged === "function") await onChanged();
  }

  async function prepare() {
    if (!booking?.id || !eligible) return;
    if (reason === "OTHER" && !clean(detail)) {
      setError("Explain the early departure when the reason is Other.");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await postEarlyDeparture({
        bookingId: booking.id,
        action: "PREPARE",
        reason,
        detail: clean(detail),
      });
      setSuccess("Early departure recorded. Review the unused-night, refund or fee treatment before confirming checkout readiness.");
      await refresh();
    } catch (reasonError) {
      setError(reasonError?.message || "Unable to prepare early departure");
    } finally {
      setSaving(false);
    }
  }

  async function confirmReview() {
    const note = clean(reviewNote);
    if (note.length < 8) {
      setError("Describe the reviewed unused-night, refund, fee or no-adjustment treatment.");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await postEarlyDeparture({
        bookingId: booking.id,
        action: "CONFIRM",
        reviewNote: note,
      });
      setSuccess("Commercial review confirmed. Front Desk can now continue normal settlement and checkout controls.");
      await refresh();
    } catch (reasonError) {
      setError(reasonError?.message || "Unable to confirm early departure review");
    } finally {
      setSaving(false);
    }
  }

  const title = stage === "CONFIRMED"
    ? "Early departure reviewed"
    : stage === "REVIEW"
      ? "Confirm the commercial outcome"
      : "Guest wants to leave early";

  const detailText = stage === "CONFIRMED"
    ? `Booked departure ${dateValue(booking?.check_out_date)} remains preserved. The review is recorded; checkout still depends on live folio and payment readiness.`
    : `The stay is booked through ${dateValue(booking?.check_out_date)}. Avantiqo keeps that original booking truth and records the actual early departure separately.`;

  return (
    <HotelSection
      eyebrow="Early departure"
      title={title}
      detail={detailText}
      action={<HotelStatusPill value={stage === "PREPARE" ? "REVIEW_REQUIRED" : stage} />}
    >
      <div className="space-y-3 p-4 md:p-5">
        {stage === "PREPARE" ? (
          <div className="grid gap-3 md:grid-cols-2">
            <HotelField label="Why is the guest leaving early?">
              <select className={hotelInputClass} value={reason} onChange={(event) => { setReason(event.target.value); setError(""); }}>
                {EARLY_DEPARTURE_REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </HotelField>
            <HotelField label="Operational detail" hint={reason === "OTHER" ? "Required for Other." : "Optional, but useful for the desk handover."}>
              <input className={hotelInputClass} value={detail} onChange={(event) => { setDetail(event.target.value); setError(""); }} placeholder="Flight changed / guest request / recovery case…" />
            </HotelField>
            <div className="md:col-span-2 flex flex-wrap items-center gap-2">
              <HotelPrimaryAction disabled={saving || (reason === "OTHER" && !clean(detail))} onClick={prepare}>{saving ? "Recording…" : "Record early departure"}</HotelPrimaryAction>
              <span className="max-w-3xl text-[7px] leading-4 text-[#918B83]">This does not change the booked departure, room price, folio, deposit, refund or fee. It only opens the governed commercial review.</span>
            </div>
          </div>
        ) : stage === "REVIEW" ? (
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
            <HotelField label="Commercial review outcome" hint="State what happened to unused nights and any refund, fee or no-adjustment decision. Make real folio/payment changes first when required.">
              <textarea className={hotelTextareaClass} value={reviewNote} onChange={(event) => { setReviewNote(event.target.value); setError(""); }} placeholder="Example: No adjustment. Guest accepts original stay charge; folio remains as posted." />
            </HotelField>
            <div className="rounded-xl border border-black/[0.07] bg-[#FBFAF7] p-3 text-[7px] leading-4 text-[#817B73]">
              <div className="font-semibold text-[#4B463F]">Before confirming</div>
              <div className="mt-1">If a refund, credit or additional charge is required, post the actual governed evidence first. Confirmation records the decision; it does not create money movement.</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {paymentsHref ? <HotelSecondaryAction href={paymentsHref}>Open Hotel payments</HotelSecondaryAction> : null}
              </div>
            </div>
            <div className="lg:col-span-2 flex flex-wrap items-center gap-2">
              <HotelPrimaryAction disabled={saving || clean(reviewNote).length < 8} onClick={confirmReview}>{saving ? "Confirming…" : "Confirm commercial review"}</HotelPrimaryAction>
              <span className="max-w-3xl text-[7px] leading-4 text-[#918B83]">After confirmation, Front Desk re-evaluates the live folio, pending transactions and Finance evidence before checkout becomes available.</span>
            </div>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-black/[0.06] bg-[#FBFAF7] p-3"><div className="text-[7px] font-semibold uppercase tracking-[0.1em] text-[#8D877F]">Reason</div><div className="mt-1 text-[8px] text-[#4B463F]">{booking?.early_departure_reason || "Recorded"}</div></div>
            <div className="rounded-xl border border-black/[0.06] bg-[#FBFAF7] p-3"><div className="text-[7px] font-semibold uppercase tracking-[0.1em] text-[#8D877F]">Commercial review</div><div className="mt-1 text-[8px] leading-4 text-[#4B463F]">{booking?.early_departure_review_note || "Confirmed"}</div></div>
          </div>
        )}
        {booking?.channel_connection_id && booking?.external_reservation_id ? <div className="rounded-xl border border-amber-700/10 bg-amber-50 px-3 py-2 text-[7px] leading-4 text-amber-900">OTA reservation detected. This workflow does not report the early departure to the channel automatically; channel reconciliation remains a separate governed step.</div> : null}
        {error ? <div className="text-[8px] text-red-800">{error}</div> : null}
        {success ? <div className="text-[8px] text-emerald-800">{success}</div> : null}
      </div>
    </HotelSection>
  );
}
