"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BadgeDollarSign,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  Filter,
  MapPinned,
  Plus,
  ReceiptText,
  Route,
  Search,
  ShieldCheck,
  Sparkles,
  TicketCheck,
  WalletCards,
  X,
} from "lucide-react";

const STAGES = ["All", "Inquiry", "Hold", "Offer", "Contract", "Confirmed", "Settled", "Lost", "Cancelled"];

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function shortDate(value) {
  const date = toDate(value);
  if (!date) return "Date open";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

function stageLabel(value) {
  const text = String(value || "inquiry").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function stageTone(stage) {
  if (stage === "Confirmed") return "border-emerald-800/15 bg-emerald-50 text-emerald-800";
  if (stage === "Contract") return "border-sky-800/15 bg-sky-50 text-sky-800";
  if (stage === "Offer") return "border-amber-800/15 bg-amber-50 text-amber-800";
  if (stage === "Hold") return "border-[#A37849]/20 bg-[#FBF6EF] text-[#815D38]";
  if (stage === "Settled") return "border-black/[0.08] bg-[#F2F1EE] text-[#68635C]";
  if (stage === "Lost" || stage === "Cancelled") return "border-red-800/10 bg-red-50 text-red-700";
  return "border-black/[0.08] bg-white text-[#726D66]";
}

function priorityDot(priority) {
  if (priority === "critical") return "bg-red-600";
  if (priority === "attention") return "bg-amber-600";
  return "bg-emerald-700";
}

function normalizeBooking(record) {
  const attributes = record?.attributes || {};
  const stage = stageLabel(attributes.booking_stage);
  const eventDate = record?.scheduled_start || attributes.event_date || null;
  const gross = Number(attributes.gross_fee || 0);
  const commission = Number(attributes.agency_commission || 0);
  const depositState = String(attributes.deposit_state || "not_requested").replaceAll("_", " ");
  const venue = attributes.venue || record?.name || "Venue not set";
  const buyer = attributes.buyer_name || record?.name || "Buyer not set";
  const lifecycleStatus = String(record?.status || "draft");

  let nextAction = "Qualify request and decide the next commercial move";
  let priority = "attention";
  if (stage === "Hold") nextAction = "Confirm hold rank, expiry and release rule";
  if (stage === "Offer") nextAction = attributes.quotation_id ? "Review and send / chase offer" : "Prepare governed offer";
  if (stage === "Contract") nextAction = "Close signature and deposit evidence";
  if (stage === "Confirmed") nextAction = "Advance show, rider, travel and settlement contact";
  if (stage === "Settled") { nextAction = "Closed"; priority = "clear"; }
  if (stage === "Lost" || stage === "Cancelled") { nextAction = "Closed without settlement"; priority = "clear"; }

  const date = toDate(eventDate);
  if (date && stage !== "Settled" && stage !== "Lost" && stage !== "Cancelled") {
    const hours = (date.getTime() - Date.now()) / 36e5;
    if (hours < 72) priority = "critical";
  }

  return {
    raw: record,
    id: record?.code || record?.id,
    recordId: record?.id,
    artist: attributes.artist_name || "Cole Ley",
    date: eventDate,
    venue,
    city: attributes.city || attributes.location || attributes.venue || "Location not set",
    buyer,
    stage,
    holdRank: attributes.hold_rank || null,
    gross,
    commission,
    deposit: depositState,
    contract: attributes.quotation_id ? `Quotation ${attributes.quotation_number || "linked"}` : "No commercial document linked",
    nextAction,
    nextDue: date ? shortDate(date) : "No due date",
    priority,
    settlement: attributes.customer_invoice_id ? "Finance document linked" : "Not opened",
    rider: attributes.rider_state || (attributes.rider ? "legacy rider captured" : "not started"),
    advancing: attributes.advancing_state || "not started",
    performanceType: attributes.performance_type || "Not set",
    sourceType: record?.source_type || "avantiqo",
    lifecycleStatus,
    createdAt: record?.created_at,
  };
}

function IconLabel({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.13em] text-[#8A633C]">
      <Icon size={11} strokeWidth={1.7} />
      {children}
    </div>
  );
}

function Metric({ label, value, hint }) {
  return (
    <div className="min-w-0 border-l border-black/[0.07] pl-4 first:border-l-0 first:pl-0">
      <div className="text-[8px] font-semibold uppercase tracking-[0.13em] text-[#979087]">{label}</div>
      <div className="mt-1.5 truncate text-[20px] font-semibold tracking-[-0.035em] text-[#24211E]">{value}</div>
      <div className="mt-0.5 truncate text-[8px] text-[#A09A92]">{hint}</div>
    </div>
  );
}

function StageChip({ booking }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.06em] ${stageTone(booking.stage)}`}>
      {booking.stage}{booking.holdRank ? ` · H${booking.holdRank}` : ""}
    </span>
  );
}

function BookingDetail({ booking, organizationId, onClose }) {
  if (!booking) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-[2px]" onMouseDown={onClose}>
      <aside className="h-full w-full max-w-[520px] overflow-y-auto border-l border-black/[0.08] bg-[#F7F6F3] p-5 shadow-2xl md:p-7" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#9A744B]">{booking.id}</div>
            <h2 className="mt-1.5 text-[25px] font-semibold tracking-[-0.04em] text-[#1F1D1A]">{booking.venue}</h2>
            <p className="mt-1 text-[11px] text-[#7D7770]">{booking.artist} · {shortDate(booking.date)}</p>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-black/[0.08] bg-white text-[#6D6861]"><X size={14} /></button>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <StageChip booking={booking} />
          <span className="rounded-full border border-black/[0.08] bg-white px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.06em] text-[#746E67]">Record · {booking.lifecycleStatus}</span>
          <span className="rounded-full border border-black/[0.08] bg-white px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.06em] text-[#746E67]">Deposit · {booking.deposit}</span>
        </div>

        <section className="mt-5 rounded-[20px] border border-black/[0.07] bg-white p-5">
          <IconLabel icon={BadgeDollarSign}>Commercial position</IconLabel>
          <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-4">
            <div><div className="text-[8px] uppercase tracking-[0.1em] text-[#9A948C]">Gross fee</div><div className="mt-1 text-[18px] font-semibold">{money(booking.gross)}</div></div>
            <div><div className="text-[8px] uppercase tracking-[0.1em] text-[#9A948C]">Agency commission</div><div className="mt-1 text-[18px] font-semibold">{booking.commission ? money(booking.commission) : "Not set"}</div></div>
            <div><div className="text-[8px] uppercase tracking-[0.1em] text-[#9A948C]">Buyer</div><div className="mt-1 text-[10px] font-semibold text-[#55504A]">{booking.buyer}</div></div>
            <div><div className="text-[8px] uppercase tracking-[0.1em] text-[#9A948C]">Performance</div><div className="mt-1 text-[10px] font-semibold text-[#55504A]">{booking.performanceType}</div></div>
          </div>
        </section>

        <section className="mt-4 rounded-[20px] border border-[#A37849]/14 bg-[#FFFDF9] p-5">
          <IconLabel icon={Sparkles}>Next best move</IconLabel>
          <div className="mt-3 flex gap-3">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${priorityDot(booking.priority)}`} />
            <div><div className="text-[12px] font-semibold text-[#342F2A]">{booking.nextAction}</div><div className="mt-1 text-[9px] text-[#8F8880]">Event / due · {booking.nextDue}</div></div>
          </div>
        </section>

        <section className="mt-4 rounded-[20px] border border-black/[0.07] bg-white p-5">
          <IconLabel icon={Route}>Show execution</IconLabel>
          <div className="mt-4 space-y-3 text-[9px] text-[#716A63]">
            <div className="flex items-center justify-between gap-3"><span>Advance</span><strong className="font-semibold text-[#3F3A35]">{booking.advancing}</strong></div>
            <div className="flex items-center justify-between gap-3"><span>Rider</span><strong className="font-semibold text-[#3F3A35]">{booking.rider}</strong></div>
            <div className="flex items-center justify-between gap-3"><span>Settlement</span><strong className="font-semibold text-[#3F3A35]">{booking.settlement}</strong></div>
            <div className="flex items-center justify-between gap-3"><span>Source</span><strong className="font-semibold text-[#3F3A35]">{booking.sourceType}</strong></div>
          </div>
        </section>

        <section className="mt-4 rounded-[20px] border border-black/[0.07] bg-white p-5">
          <IconLabel icon={ShieldCheck}>Finance authority</IconLabel>
          <p className="mt-3 text-[9px] leading-5 text-[#827B73]">Operations owns booking and show lifecycle. Invoice, receipt, payment, tax and accounting truth remain governed by Finance.</p>
          <Link href={organizationId ? `/workspace/${organizationId}/finance` : "#"} className="mt-3 inline-flex items-center gap-1.5 text-[9px] font-semibold text-[#7B5C3E]">Open Finance <ChevronRight size={10} /></Link>
        </section>
      </aside>
    </div>
  );
}

function NewBookingModal({ organizationId, onClose, onCreated }) {
  const [form, setForm] = useState({ buyer_name: "", venue: "", event_date: "", performance_type: "", gross_fee: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/operations/artist-agency/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: organizationId,
          booking_stage: "inquiry",
          buyer_name: form.buyer_name,
          venue: form.venue,
          event_date: form.event_date,
          performance_type: form.performance_type,
          gross_fee: Number(form.gross_fee || 0),
          notes: form.notes,
          source: "avantiqo-booking-desk",
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Booking could not be created");
      await onCreated?.();
      onClose();
    } catch (cause) {
      setError(cause?.message || "Booking could not be created");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/20 p-4 backdrop-blur-[2px]" onMouseDown={onClose}>
      <div className="w-full max-w-[620px] rounded-[24px] border border-black/[0.08] bg-[#F7F6F3] p-5 shadow-2xl md:p-7" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div><div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#9A744B]">New booking</div><h2 className="mt-1.5 text-[24px] font-semibold tracking-[-0.04em]">Capture the opportunity once.</h2><p className="mt-1 text-[9px] leading-5 text-[#807A72]">Creates the governed agency record as Inquiry. Commercial and Finance documents remain separate authoritative records.</p></div>
          <button type="button" onClick={onClose} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-black/[0.08] bg-white"><X size={14} /></button>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {[
            ["Buyer / promoter", "buyer_name", "text"],
            ["Venue", "venue", "text"],
            ["Event date", "event_date", "date"],
            ["Performance", "performance_type", "text"],
            ["Gross offer", "gross_fee", "number"],
          ].map(([label, key, type]) => (
            <label key={key} className="block"><span className="text-[7px] font-semibold uppercase tracking-[0.08em] text-[#8F8880]">{label}</span><input type={type} value={form[key]} onChange={update(key)} className="mt-1.5 h-9 w-full rounded-xl border border-black/[0.08] bg-white px-3 text-[9px] outline-none focus:border-[#9A744B]/50" /></label>
          ))}
          <label className="block md:col-span-2"><span className="text-[7px] font-semibold uppercase tracking-[0.08em] text-[#8F8880]">Notes</span><textarea value={form.notes} onChange={update("notes")} className="mt-1.5 min-h-20 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-[9px] outline-none focus:border-[#9A744B]/50" /></label>
        </div>
        {error ? <div className="mt-3 rounded-xl border border-red-800/10 bg-red-50 px-3 py-2 text-[8px] text-red-700">{error}</div> : null}
        <div className="mt-5 flex items-center justify-between gap-3 border-t border-black/[0.06] pt-4"><div className="flex items-center gap-1.5 text-[8px] text-[#8C857D]"><ShieldCheck size={10} /> Governed Operations record</div><button type="button" disabled={saving || !form.buyer_name || !form.event_date} onClick={save} className="inline-flex h-9 items-center gap-2 rounded-xl bg-[#25231F] px-4 text-[9px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{saving ? "Saving…" : "Create inquiry"} <ArrowRight size={10} /></button></div>
      </div>
    </div>
  );
}

export default function ArtistAgencyWorkspaceUI({ organizationId }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [stage, setStage] = useState("All");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [showNewBooking, setShowNewBooking] = useState(false);

  const loadBookings = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch(`/api/operations/artist-agency/bookings?organization_id=${encodeURIComponent(organizationId)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Bookings could not be loaded");
      setRecords(Array.isArray(payload?.bookings) ? payload.bookings : []);
    } catch (cause) {
      setLoadError(cause?.message || "Bookings could not be loaded");
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { loadBookings(); }, [loadBookings]);

  const bookings = useMemo(() => records.map(normalizeBooking), [records]);
  const pipeline = useMemo(() => {
    const query = search.trim().toLowerCase();
    return bookings.filter((booking) => {
      if (stage !== "All" && booking.stage !== stage) return false;
      if (!query) return true;
      return [booking.artist, booking.venue, booking.city, booking.buyer, booking.id].join(" ").toLowerCase().includes(query);
    });
  }, [bookings, search, stage]);

  const active = bookings.filter((booking) => !["Settled", "Lost", "Cancelled"].includes(booking.stage));
  const confirmedGross = active.filter((booking) => booking.stage === "Confirmed").reduce((sum, booking) => sum + booking.gross, 0);
  const weightedPipeline = active.reduce((sum, booking) => sum + booking.gross * ({ Inquiry: 0.15, Hold: 0.35, Offer: 0.55, Contract: 0.8, Confirmed: 1 }[booking.stage] || 0), 0);
  const expectedCommission = active.reduce((sum, booking) => sum + booking.commission, 0);
  const attention = active.filter((booking) => booking.priority === "critical" || booking.priority === "attention");
  const dated = [...active].filter((booking) => toDate(booking.date)).sort((a, b) => toDate(a.date) - toDate(b.date));
  const nextShow = dated.find((booking) => booking.stage === "Confirmed") || dated[0] || null;

  return (
    <div className="min-h-[calc(100vh-61px)] bg-[#F7F6F3] text-[#1E1C19]">
      <div className="mx-auto max-w-[1780px] px-5 py-6 md:px-8 lg:px-10 lg:py-8">
        <header className="border-b border-black/[0.07] pb-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0">
              <div className="text-[9px] font-semibold uppercase tracking-[0.17em] text-[#9A744B]">Operations · Artist Agency</div>
              <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-1"><h1 className="text-[31px] font-semibold tracking-[-0.045em] text-[#1C1A18] md:text-[36px]">Booking desk</h1><span className="mb-1 rounded-full border border-emerald-800/10 bg-emerald-50 px-2.5 py-1 text-[7px] font-semibold uppercase tracking-[0.08em] text-emerald-800">Cole Ley · live records</span></div>
              <p className="mt-2 max-w-3xl text-[11px] leading-5 text-[#767069]">One operating record from website inquiry and holds through contracts, show-day execution and governed Finance settlement.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => setShowNewBooking(true)} className="inline-flex h-9 items-center gap-2 rounded-xl bg-[#25231F] px-4 text-[9px] font-semibold text-white shadow-sm"><Plus size={12} /> New booking</button><Link href={organizationId ? `/workspace/${organizationId}/finance` : "#"} className="inline-flex h-9 items-center gap-2 rounded-xl border border-black/[0.08] bg-white px-4 text-[9px] font-semibold text-[#5F5952]"><ReceiptText size={12} /> Finance</Link></div>
          </div>
          <nav className="mt-5 flex gap-1 overflow-x-auto rounded-xl border border-black/[0.06] bg-white/65 p-1 text-[8px] font-semibold text-[#79736B]"><span className="whitespace-nowrap rounded-lg bg-white px-3 py-2 text-[#2E2A26] shadow-[0_1px_2px_rgba(0,0,0,0.05)]">Overview</span><span className="whitespace-nowrap rounded-lg px-3 py-2">Bookings</span><span className="whitespace-nowrap rounded-lg px-3 py-2">Calendar & routing</span><span className="whitespace-nowrap rounded-lg px-3 py-2">Finance handoff</span></nav>
        </header>

        <main className="mt-6 space-y-5">
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.6fr)]">
            <div className="overflow-hidden rounded-[22px] border border-[#A37849]/14 bg-[#FFFDF9] p-5 md:p-7">
              <IconLabel icon={BriefcaseBusiness}>Agency command</IconLabel>
              <h2 className="mt-3 max-w-3xl text-[27px] font-semibold leading-[1.05] tracking-[-0.045em] text-[#24211E] md:text-[34px]">Move the deal before the deal becomes the problem.</h2>
              <p className="mt-3 max-w-2xl text-[10px] leading-5 text-[#817B73]">Website enquiries, legacy quotations, deadlines, deposits, routing and settlement dependencies resolve from authoritative records.</p>
              <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4"><Metric label="Confirmed" value={money(confirmedGross)} hint="committed gross" /><Metric label="Weighted" value={money(weightedPipeline)} hint="probability-adjusted" /><Metric label="Commission" value={expectedCommission ? money(expectedCommission) : "Not set"} hint="no assumed rate" /><Metric label="Attention" value={String(attention.length)} hint="human moves" /></div>
            </div>

            <div className="rounded-[22px] border border-black/[0.075] bg-white p-5">
              <div className="flex items-center justify-between gap-3"><IconLabel icon={CircleAlert}>Needs attention</IconLabel><span className="text-[8px] font-semibold text-[#9C958C]">{loading ? "loading" : "ranked"}</span></div>
              {loadError ? <div className="mt-4 rounded-xl border border-red-800/10 bg-red-50 p-3 text-[8px] text-red-700">{loadError}</div> : null}
              <div className="mt-3 divide-y divide-black/[0.055]">{attention.slice(0, 5).map((booking) => <button key={booking.recordId} type="button" onClick={() => setSelected(booking)} className="group flex w-full gap-3 py-3 text-left"><span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${priorityDot(booking.priority)}`} /><span className="min-w-0 flex-1"><span className="block truncate text-[9px] font-semibold text-[#3D3833]">{booking.nextAction}</span><span className="mt-0.5 block truncate text-[8px] text-[#938C84]">{booking.venue} · {booking.nextDue}</span></span><ChevronRight size={11} className="mt-0.5 shrink-0 text-[#B2ABA3]" /></button>)}{!loading && attention.length === 0 ? <div className="py-8 text-center text-[8px] text-[#928B83]">No open human move is currently ranked.</div> : null}</div>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
            <div className="rounded-[22px] border border-black/[0.075] bg-white p-5">
              <div className="flex items-center justify-between gap-3"><IconLabel icon={CalendarDays}>Forward calendar</IconLabel><span className="text-[8px] text-[#8F8880]">{dated.length} dated open records</span></div>
              <div className="mt-4 grid gap-2 md:grid-cols-3">{dated.slice(0, 6).map((booking) => <button key={booking.recordId} onClick={() => setSelected(booking)} className="rounded-[16px] border border-black/[0.06] bg-[#FCFBF9] p-3 text-left"><div className="text-[8px] font-semibold text-[#8A633C]">{shortDate(booking.date)}</div><div className="mt-1 truncate text-[9px] font-semibold">{booking.venue}</div><div className="mt-1 flex items-center gap-1.5"><StageChip booking={booking} /></div></button>)}{!loading && dated.length === 0 ? <div className="md:col-span-3 py-8 text-center text-[8px] text-[#928B83]">No dated booking record yet.</div> : null}</div>
            </div>
            <div className="rounded-[22px] border border-[#A37849]/14 bg-[#FFFDF9] p-5"><div className="flex items-center justify-between gap-3"><IconLabel icon={Sparkles}>Avantiqo signal</IconLabel><MapPinned size={13} className="text-[#8A633C]" /></div><h3 className="mt-4 text-[17px] font-semibold tracking-[-0.03em]">{nextShow ? `${nextShow.stage}: ${nextShow.venue}` : "Build the next bookable date."}</h3><p className="mt-2 text-[9px] leading-5 text-[#827B74]">{nextShow ? `${shortDate(nextShow.date)} · ${nextShow.nextAction}. Routing intelligence stays evidence-based; no sample gigs are invented.` : "No confirmed or dated opportunity is available yet. New coleley.com enquiries will appear here automatically."}</p></div>
          </section>

          <section className="overflow-hidden rounded-[22px] border border-black/[0.075] bg-white">
            <div className="flex flex-col gap-3 border-b border-black/[0.05] px-4 py-4 md:px-5 lg:flex-row lg:items-end lg:justify-between"><div><IconLabel icon={TicketCheck}>Booking pipeline</IconLabel><div className="mt-1 text-[8px] text-[#979087]">Inquiry → hold → offer → contract → confirmed → Finance settlement</div></div><div className="flex flex-wrap items-center gap-2"><label className="flex h-8 min-w-[210px] items-center gap-2 rounded-lg border border-black/[0.08] bg-[#FAF9F7] px-3 text-[#8D867E]"><Search size={11} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search booking, buyer, venue" className="min-w-0 flex-1 bg-transparent text-[8px] text-[#4F4943] outline-none placeholder:text-[#A49E96]" /></label><span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-3 text-[8px] font-semibold text-[#746E67]"><Filter size={10} /> {pipeline.length} records</span></div></div>
            <div className="flex gap-1 overflow-x-auto border-b border-black/[0.05] bg-[#FCFBF9] px-4 py-2 md:px-5">{STAGES.map((item) => <button key={item} type="button" onClick={() => setStage(item)} className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[7px] font-semibold uppercase tracking-[0.06em] ${stage === item ? "bg-[#25231F] text-white" : "text-[#8C857D] hover:bg-white"}`}>{item}</button>)}</div>
            <div className="hidden grid-cols-[95px_88px_minmax(170px,1.2fr)_minmax(130px,0.9fr)_100px_105px_minmax(180px,1.2fr)_26px] gap-3 border-b border-black/[0.05] bg-white/60 px-5 py-2 text-[7px] font-semibold uppercase tracking-[0.1em] text-[#989188] lg:grid"><span>Date</span><span>Stage</span><span>Venue / buyer</span><span>Source</span><span>Gross</span><span>Deposit</span><span>Next move</span><span /></div>
            <div className="divide-y divide-black/[0.05]">{pipeline.map((booking) => <button key={booking.recordId} type="button" onClick={() => setSelected(booking)} className="grid w-full gap-2 px-4 py-3.5 text-left transition hover:bg-[#FBF9F5] lg:grid-cols-[95px_88px_minmax(170px,1.2fr)_minmax(130px,0.9fr)_100px_105px_minmax(180px,1.2fr)_26px] lg:items-center lg:gap-3 lg:px-5"><div><div className="text-[9px] font-semibold text-[#4A443E]">{shortDate(booking.date)}</div><div className="mt-0.5 text-[7px] text-[#A09A92]">{booking.id}</div></div><div><StageChip booking={booking} /></div><div className="min-w-0"><div className="truncate text-[9px] font-semibold text-[#3F3A35]">{booking.venue}</div><div className="mt-0.5 truncate text-[7px] text-[#9A938B]">{booking.buyer}</div></div><div className="truncate text-[8px] text-[#766F68]">{booking.sourceType}</div><div className="text-[9px] font-semibold tabular-nums text-[#4C4640]">{money(booking.gross)}</div><div className="capitalize text-[8px] font-semibold text-[#6E6861]">{booking.deposit}</div><div className="min-w-0"><div className="flex items-center gap-2"><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${priorityDot(booking.priority)}`} /><span className="truncate text-[8px] font-semibold text-[#4D4741]">{booking.nextAction}</span></div><div className="mt-0.5 pl-3.5 text-[7px] text-[#A09A92]">{booking.nextDue}</div></div><ChevronRight size={11} className="hidden text-[#B1AAA2] lg:block" /></button>)}{loading ? <div className="px-5 py-10 text-center text-[9px] text-[#8D867E]">Loading governed booking records…</div> : null}{!loading && pipeline.length === 0 ? <div className="px-5 py-10 text-center text-[9px] text-[#8D867E]">No bookings match this view.</div> : null}</div>
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <div className="rounded-[22px] border border-black/[0.075] bg-white p-5"><div className="flex items-center justify-between gap-3"><IconLabel icon={Route}>Tour ops · next dated record</IconLabel><span className="text-[8px] font-semibold text-[#8C857D]">{nextShow ? shortDate(nextShow.date) : "none"}</span></div>{nextShow ? <div className="mt-4 grid gap-3"><div className="rounded-[18px] bg-[#F6F4F0] p-4"><div className="text-[7px] uppercase tracking-[0.1em] text-[#958E86]">Venue</div><div className="mt-1 text-[17px] font-semibold tracking-[-0.03em]">{nextShow.venue}</div><div className="mt-3 text-[7px] uppercase tracking-[0.1em] text-[#958E86]">Next move</div><div className="mt-1 text-[9px] font-semibold">{nextShow.nextAction}</div></div></div> : <div className="mt-4 rounded-[18px] bg-[#F6F4F0] p-5 text-[9px] text-[#827B74]">No dated record yet. Tour operations activate from real booking evidence.</div>}</div>
            <div className="rounded-[22px] border border-[#A37849]/14 bg-[#FFFDF9] p-5"><div className="flex items-center justify-between gap-3"><IconLabel icon={WalletCards}>Finance handoff</IconLabel><ShieldCheck size={13} className="text-[#6F7E68]" /></div><h3 className="mt-3 text-[18px] font-semibold tracking-[-0.03em]">One commercial story. One accounting truth.</h3><p className="mt-2 max-w-2xl text-[9px] leading-5 text-[#817A72]">Agency Operations carries booking economics and evidence but never creates a second ledger. Cole Ley’s migrated invoice and expense truth now lives in Finance; posting remains governed.</p><div className="mt-4 grid grid-cols-3 gap-2"><div className="rounded-xl border border-black/[0.06] bg-white p-3"><div className="text-[7px] uppercase tracking-[0.08em] text-[#969087]">Records</div><div className="mt-1 text-[16px] font-semibold">{bookings.length}</div></div><div className="rounded-xl border border-black/[0.06] bg-white p-3"><div className="text-[7px] uppercase tracking-[0.08em] text-[#969087]">Finance links</div><div className="mt-1 text-[16px] font-semibold">{bookings.filter((booking) => booking.raw?.attributes?.quotation_id || booking.raw?.attributes?.customer_invoice_id).length}</div></div><div className="rounded-xl border border-black/[0.06] bg-white p-3"><div className="text-[7px] uppercase tracking-[0.08em] text-[#969087]">Confirmed</div><div className="mt-1 text-[16px] font-semibold">{bookings.filter((booking) => booking.stage === "Confirmed").length}</div></div></div><Link href={organizationId ? `/workspace/${organizationId}/finance` : "#"} className="mt-4 inline-flex h-9 items-center gap-2 rounded-xl bg-[#25231F] px-4 text-[9px] font-semibold text-white">Open Finance <ArrowRight size={10} /></Link></div>
          </section>
        </main>
      </div>
      <BookingDetail booking={selected} organizationId={organizationId} onClose={() => setSelected(null)} />
      {showNewBooking ? <NewBookingModal organizationId={organizationId} onClose={() => setShowNewBooking(false)} onCreated={loadBookings} /> : null}
    </div>
  );
}
