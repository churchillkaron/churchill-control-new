"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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
  Plane,
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

const STAGES = ["All", "Inquiry", "Hold", "Offer", "Contract", "Confirmed", "Settled"];

const SAMPLE_BOOKINGS = Object.freeze([
  {
    id: "BKG-2041",
    artist: "Cole Ley",
    date: "2026-09-09",
    venue: "Churchill Restaurant & Bar",
    city: "Karon, Phuket",
    buyer: "Churchill Karon",
    stage: "Confirmed",
    holdRank: null,
    gross: 18000,
    commission: 2700,
    deposit: "Paid",
    contract: "Signed",
    nextAction: "Show advance due",
    nextDue: "Today",
    priority: "attention",
    travel: "Local",
    settlement: "Opens after show",
    lastTouch: "12 min ago",
  },
  {
    id: "BKG-2042",
    artist: "Cole Ley",
    date: "2026-09-11",
    venue: "Catch Beach Club",
    city: "Bang Tao, Phuket",
    buyer: "Catch Beach Club",
    stage: "Contract",
    holdRank: null,
    gross: 22000,
    commission: 3300,
    deposit: "Due",
    contract: "Sent",
    nextAction: "Chase signed contract + deposit",
    nextDue: "Sep 8",
    priority: "critical",
    travel: "Local",
    settlement: "Not opened",
    lastTouch: "3 hr ago",
  },
  {
    id: "BKG-2043",
    artist: "Cole Ley",
    date: "2026-09-12",
    venue: "Yona Beach Club",
    city: "Phuket",
    buyer: "Yona Beach Club",
    stage: "Offer",
    holdRank: null,
    gross: 28000,
    commission: 4200,
    deposit: "Not requested",
    contract: "Pending offer",
    nextAction: "Offer expires in 36 hours",
    nextDue: "Sep 7",
    priority: "critical",
    travel: "Local",
    settlement: "Not opened",
    lastTouch: "Yesterday",
  },
  {
    id: "BKG-2044",
    artist: "Cole Ley",
    date: "2026-09-18",
    venue: "Private Event",
    city: "Phuket",
    buyer: "Private client",
    stage: "Hold",
    holdRank: 1,
    gross: 35000,
    commission: 5250,
    deposit: "Not requested",
    contract: "Not issued",
    nextAction: "Confirm or release first hold",
    nextDue: "Sep 9",
    priority: "attention",
    travel: "Local",
    settlement: "Not opened",
    lastTouch: "2 days ago",
  },
  {
    id: "BKG-2045",
    artist: "Cole Ley",
    date: "2026-09-24",
    venue: "Corporate Showcase",
    city: "Bangkok",
    buyer: "Corporate buyer",
    stage: "Inquiry",
    holdRank: null,
    gross: 50000,
    commission: 7500,
    deposit: "Not requested",
    contract: "Not issued",
    nextAction: "Qualify budget and production scope",
    nextDue: "Sep 7",
    priority: "attention",
    travel: "Flight required",
    settlement: "Not opened",
    lastTouch: "5 hr ago",
  },
  {
    id: "BKG-2039",
    artist: "Cole Ley",
    date: "2026-09-04",
    venue: "Beach Club Performance",
    city: "Phuket",
    buyer: "Venue buyer",
    stage: "Settled",
    holdRank: null,
    gross: 24000,
    commission: 3600,
    deposit: "Paid",
    contract: "Signed",
    nextAction: "Closed",
    nextDue: "Complete",
    priority: "clear",
    travel: "Local",
    settlement: "Finance matched",
    lastTouch: "Sep 5",
  },
]);

const WEEK = Object.freeze([
  { day: "Mon", date: "7", tone: "quiet", label: "Offer expiry", detail: "Yona Beach Club · decision" },
  { day: "Tue", date: "8", tone: "attention", label: "Contract deadline", detail: "Catch · signature + deposit" },
  { day: "Wed", date: "9", tone: "live", label: "Show", detail: "Churchill · Karon · 19:30" },
  { day: "Thu", date: "10", tone: "quiet", label: "Open", detail: "Routing opportunity" },
  { day: "Fri", date: "11", tone: "live", label: "Show", detail: "Catch · Bang Tao" },
  { day: "Sat", date: "12", tone: "hold", label: "Offer", detail: "Yona · awaiting acceptance" },
  { day: "Sun", date: "13", tone: "quiet", label: "Open", detail: "No committed show" },
]);

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function shortDate(value) {
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

function stageTone(stage) {
  if (stage === "Confirmed") return "border-emerald-800/15 bg-emerald-50 text-emerald-800";
  if (stage === "Contract") return "border-sky-800/15 bg-sky-50 text-sky-800";
  if (stage === "Offer") return "border-amber-800/15 bg-amber-50 text-amber-800";
  if (stage === "Hold") return "border-[#A37849]/20 bg-[#FBF6EF] text-[#815D38]";
  if (stage === "Settled") return "border-black/[0.08] bg-[#F2F1EE] text-[#68635C]";
  return "border-black/[0.08] bg-white text-[#726D66]";
}

function priorityDot(priority) {
  if (priority === "critical") return "bg-red-600";
  if (priority === "attention") return "bg-amber-600";
  return "bg-emerald-700";
}

function weekTone(tone) {
  if (tone === "live") return "border-[#2E4A35]/15 bg-[#F2F7F2]";
  if (tone === "attention") return "border-red-800/12 bg-red-50/70";
  if (tone === "hold") return "border-[#A37849]/18 bg-[#FBF7F1]";
  return "border-black/[0.06] bg-white/70";
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
      {booking.stage}
      {booking.holdRank ? ` · H${booking.holdRank}` : ""}
    </span>
  );
}

function BookingDetail({ booking, organizationId, onClose }) {
  if (!booking) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-[2px]" onMouseDown={onClose}>
      <aside
        className="h-full w-full max-w-[520px] overflow-y-auto border-l border-black/[0.08] bg-[#F7F6F3] p-5 shadow-2xl md:p-7"
        onMouseDown={(event) => event.stopPropagation()}
        aria-label="Booking detail"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#9A744B]">{booking.id}</div>
            <h2 className="mt-1.5 text-[25px] font-semibold tracking-[-0.04em] text-[#1F1D1A]">{booking.venue}</h2>
            <p className="mt-1 text-[11px] text-[#7D7770]">{booking.artist} · {booking.city} · {shortDate(booking.date)}</p>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-black/[0.08] bg-white text-[#6D6861]">
            <X size={14} />
          </button>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <StageChip booking={booking} />
          <span className="rounded-full border border-black/[0.08] bg-white px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.06em] text-[#746E67]">{booking.contract}</span>
          <span className="rounded-full border border-black/[0.08] bg-white px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.06em] text-[#746E67]">Deposit · {booking.deposit}</span>
        </div>

        <section className="mt-5 rounded-[20px] border border-black/[0.07] bg-white p-5">
          <IconLabel icon={BadgeDollarSign}>Commercial position</IconLabel>
          <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-4">
            <div><div className="text-[8px] uppercase tracking-[0.1em] text-[#9A948C]">Gross fee</div><div className="mt-1 text-[18px] font-semibold">{money(booking.gross)}</div></div>
            <div><div className="text-[8px] uppercase tracking-[0.1em] text-[#9A948C]">Agency commission</div><div className="mt-1 text-[18px] font-semibold">{money(booking.commission)}</div></div>
            <div><div className="text-[8px] uppercase tracking-[0.1em] text-[#9A948C]">Buyer</div><div className="mt-1 text-[10px] font-semibold text-[#55504A]">{booking.buyer}</div></div>
            <div><div className="text-[8px] uppercase tracking-[0.1em] text-[#9A948C]">Settlement</div><div className="mt-1 text-[10px] font-semibold text-[#55504A]">{booking.settlement}</div></div>
          </div>
        </section>

        <section className="mt-4 rounded-[20px] border border-[#A37849]/14 bg-[#FFFDF9] p-5">
          <IconLabel icon={Sparkles}>Next best move</IconLabel>
          <div className="mt-3 flex gap-3">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${priorityDot(booking.priority)}`} />
            <div>
              <div className="text-[12px] font-semibold text-[#342F2A]">{booking.nextAction}</div>
              <div className="mt-1 text-[9px] text-[#8F8880]">Due {booking.nextDue} · last touch {booking.lastTouch}</div>
            </div>
          </div>
          <button type="button" className="mt-4 inline-flex h-9 items-center gap-2 rounded-xl bg-[#25231F] px-4 text-[9px] font-semibold text-white">
            Open action <ArrowRight size={11} />
          </button>
        </section>

        <section className="mt-4 rounded-[20px] border border-black/[0.07] bg-white p-5">
          <IconLabel icon={Route}>Show execution</IconLabel>
          <div className="mt-4 space-y-3 text-[9px] text-[#716A63]">
            <div className="flex items-center justify-between gap-3"><span>Travel</span><strong className="font-semibold text-[#3F3A35]">{booking.travel}</strong></div>
            <div className="flex items-center justify-between gap-3"><span>Advance / rider</span><strong className="font-semibold text-[#3F3A35]">Open checklist</strong></div>
            <div className="flex items-center justify-between gap-3"><span>Guest list</span><strong className="font-semibold text-[#3F3A35]">Not due</strong></div>
            <div className="flex items-center justify-between gap-3"><span>Day sheet</span><strong className="font-semibold text-[#3F3A35]">Auto-prepares after confirmation</strong></div>
          </div>
        </section>

        <section className="mt-4 rounded-[20px] border border-black/[0.07] bg-white p-5">
          <IconLabel icon={ShieldCheck}>Finance authority</IconLabel>
          <p className="mt-3 text-[9px] leading-5 text-[#827B73]">Operations owns the booking and show lifecycle. Invoice, receipt, settlement and accounting truth remain governed by Finance.</p>
          <Link href={organizationId ? `/workspace/${organizationId}/finance` : "#"} className="mt-3 inline-flex items-center gap-1.5 text-[9px] font-semibold text-[#7B5C3E]">
            Open Finance record <ChevronRight size={10} />
          </Link>
        </section>
      </aside>
    </div>
  );
}

export default function ArtistAgencyWorkspaceUI({ organizationId }) {
  const [stage, setStage] = useState("All");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [showNewBooking, setShowNewBooking] = useState(false);

  const pipeline = useMemo(() => {
    const query = search.trim().toLowerCase();
    return SAMPLE_BOOKINGS.filter((booking) => {
      if (stage !== "All" && booking.stage !== stage) return false;
      if (!query) return true;
      return [booking.artist, booking.venue, booking.city, booking.buyer, booking.id]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [search, stage]);

  const active = SAMPLE_BOOKINGS.filter((booking) => booking.stage !== "Settled");
  const confirmedGross = active.filter((booking) => booking.stage === "Confirmed").reduce((sum, booking) => sum + booking.gross, 0);
  const weightedPipeline = active.reduce((sum, booking) => {
    const weight = { Inquiry: 0.15, Hold: 0.35, Offer: 0.55, Contract: 0.8, Confirmed: 1 }[booking.stage] || 0;
    return sum + booking.gross * weight;
  }, 0);
  const expectedCommission = active.reduce((sum, booking) => sum + booking.commission, 0);
  const attention = active.filter((booking) => booking.priority === "critical" || booking.priority === "attention");

  return (
    <div className="min-h-[calc(100vh-61px)] bg-[#F7F6F3] text-[#1E1C19]">
      <div className="mx-auto max-w-[1780px] px-5 py-6 md:px-8 lg:px-10 lg:py-8">
        <header className="border-b border-black/[0.07] pb-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0">
              <div className="text-[9px] font-semibold uppercase tracking-[0.17em] text-[#9A744B]">Operations · Artist Agency</div>
              <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-1">
                <h1 className="text-[31px] font-semibold tracking-[-0.045em] text-[#1C1A18] md:text-[36px]">Booking desk</h1>
                <span className="mb-1 rounded-full border border-black/[0.08] bg-white px-2.5 py-1 text-[7px] font-semibold uppercase tracking-[0.08em] text-[#837D75]">Cole Ley · prototype data</span>
              </div>
              <p className="mt-2 max-w-3xl text-[11px] leading-5 text-[#767069]">One operating record from inquiry and holds through contracts, show-day execution and governed Finance settlement.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setShowNewBooking(true)} className="inline-flex h-9 items-center gap-2 rounded-xl bg-[#25231F] px-4 text-[9px] font-semibold text-white shadow-sm">
                <Plus size={12} /> New booking
              </button>
              <Link href={organizationId ? `/workspace/${organizationId}/finance` : "#"} className="inline-flex h-9 items-center gap-2 rounded-xl border border-black/[0.08] bg-white px-4 text-[9px] font-semibold text-[#5F5952]">
                <ReceiptText size={12} /> Finance
              </Link>
            </div>
          </div>

          <nav className="mt-5 flex gap-1 overflow-x-auto rounded-xl border border-black/[0.06] bg-white/65 p-1 text-[8px] font-semibold text-[#79736B]">
            {["Overview", "Bookings", "Calendar", "Roster", "Deals & contracts", "Tour ops", "Settlements"].map((item, index) => (
              <button key={item} type="button" className={`whitespace-nowrap rounded-lg px-3 py-2 ${index === 0 ? "bg-white text-[#2E2A26] shadow-[0_1px_2px_rgba(0,0,0,0.05)]" : "hover:bg-white/70"}`}>{item}</button>
            ))}
          </nav>
        </header>

        <main className="mt-6 space-y-5">
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.6fr)]">
            <div className="overflow-hidden rounded-[22px] border border-[#A37849]/14 bg-[#FFFDF9]">
              <div className="grid min-h-[268px] gap-7 p-5 md:p-7 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
                <div className="flex min-w-0 flex-col justify-between">
                  <div>
                    <IconLabel icon={BriefcaseBusiness}>Agency command</IconLabel>
                    <h2 className="mt-3 max-w-3xl text-[27px] font-semibold leading-[1.05] tracking-[-0.045em] text-[#24211E] md:text-[34px]">Move the deal before the deal becomes the problem.</h2>
                    <p className="mt-3 max-w-2xl text-[10px] leading-5 text-[#817B73]">Deadlines, holds, contracts, deposits, routing and settlement exceptions are ranked by what a human can change now.</p>
                  </div>
                  <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
                    <Metric label="Confirmed" value={money(confirmedGross)} hint="committed gross" />
                    <Metric label="Weighted" value={money(weightedPipeline)} hint="probability-adjusted" />
                    <Metric label="Commission" value={money(expectedCommission)} hint="open pipeline" />
                    <Metric label="Attention" value={String(attention.length)} hint="human moves" />
                  </div>
                </div>

                <div className="rounded-[18px] border border-black/[0.07] bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <IconLabel icon={CircleAlert}>Needs attention</IconLabel>
                    <span className="text-[8px] font-semibold text-[#9C958C]">ranked</span>
                  </div>
                  <div className="mt-3 divide-y divide-black/[0.055]">
                    {attention.slice(0, 4).map((booking) => (
                      <button key={booking.id} type="button" onClick={() => setSelected(booking)} className="group flex w-full gap-3 py-3 text-left">
                        <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${priorityDot(booking.priority)}`} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[9px] font-semibold text-[#3D3833]">{booking.nextAction}</span>
                          <span className="mt-0.5 block truncate text-[8px] text-[#938C84]">{booking.venue} · {booking.nextDue}</span>
                        </span>
                        <ChevronRight size={11} className="mt-0.5 shrink-0 text-[#B2ABA3] transition group-hover:translate-x-0.5 group-hover:text-[#8A633C]" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[22px] border border-black/[0.075] bg-white p-5">
              <div className="flex items-center justify-between gap-3">
                <IconLabel icon={Sparkles}>Avantiqo signal</IconLabel>
                <span className="rounded-full border border-emerald-800/10 bg-emerald-50 px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.06em] text-emerald-800">clear route</span>
              </div>
              <h3 className="mt-4 text-[17px] font-semibold tracking-[-0.03em]">Thursday is commercially open.</h3>
              <p className="mt-2 text-[9px] leading-5 text-[#827B74]">There is a gap between Karon on Wednesday and Bang Tao on Friday. Prefer a Phuket booking with low travel overhead before accepting a Bangkok hold.</p>
              <div className="mt-5 rounded-2xl bg-[#F7F5F1] p-4">
                <div className="flex items-center gap-2 text-[9px] font-semibold text-[#4C4640]"><MapPinned size={12} className="text-[#8A633C]" /> Phuket · Sep 10</div>
                <div className="mt-2 text-[8px] leading-4 text-[#8B847C]">Best-fit inventory window · 1 day · no flight · no hotel · protects Sep 11 call time.</div>
              </div>
              <button type="button" className="mt-4 inline-flex items-center gap-1.5 text-[9px] font-semibold text-[#76583A]">Find matching buyers <ArrowRight size={10} /></button>
            </div>
          </section>

          <section className="rounded-[22px] border border-black/[0.075] bg-white p-4 md:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <IconLabel icon={CalendarDays}>This week</IconLabel>
                <h2 className="mt-1.5 text-[16px] font-semibold tracking-[-0.025em]">Routing before calendar</h2>
              </div>
              <div className="flex items-center gap-2 text-[8px] text-[#8F8880]"><Route size={11} /> 2 committed shows · 1 offer · 2 deadlines · 2 open days</div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
              {WEEK.map((day) => (
                <div key={`${day.day}-${day.date}`} className={`min-h-[112px] rounded-[16px] border p-3 ${weekTone(day.tone)}`}>
                  <div className="flex items-start justify-between"><span className="text-[8px] font-semibold uppercase tracking-[0.1em] text-[#928B83]">{day.day}</span><span className="text-[16px] font-semibold tracking-[-0.03em] text-[#3F3A35]">{day.date}</span></div>
                  <div className="mt-5 text-[9px] font-semibold text-[#4B4540]">{day.label}</div>
                  <div className="mt-1 text-[7px] leading-4 text-[#8C857D]">{day.detail}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="overflow-hidden rounded-[22px] border border-black/[0.075] bg-white">
            <div className="flex flex-col gap-3 border-b border-black/[0.06] px-4 py-4 md:px-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <IconLabel icon={TicketCheck}>Booking pipeline</IconLabel>
                <div className="mt-1 text-[8px] text-[#979087]">Inquiry → hold → offer → contract → confirmed → Finance settlement</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex h-8 min-w-[210px] items-center gap-2 rounded-lg border border-black/[0.08] bg-[#FAF9F7] px-3 text-[#8D867E]">
                  <Search size={11} />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search booking, buyer, city" className="min-w-0 flex-1 bg-transparent text-[8px] text-[#4F4943] outline-none placeholder:text-[#A49E96]" />
                </label>
                <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-3 text-[8px] font-semibold text-[#746E67]"><Filter size={10} /> {pipeline.length} records</span>
              </div>
            </div>

            <div className="flex gap-1 overflow-x-auto border-b border-black/[0.05] bg-[#FCFBF9] px-4 py-2 md:px-5">
              {STAGES.map((item) => (
                <button key={item} type="button" onClick={() => setStage(item)} className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[7px] font-semibold uppercase tracking-[0.06em] ${stage === item ? "bg-[#25231F] text-white" : "text-[#8C857D] hover:bg-white"}`}>{item}</button>
              ))}
            </div>

            <div className="hidden grid-cols-[95px_88px_minmax(170px,1.2fr)_minmax(130px,0.9fr)_100px_105px_minmax(180px,1.2fr)_26px] gap-3 border-b border-black/[0.05] bg-white/60 px-4 py-2 text-[7px] font-semibold uppercase tracking-[0.1em] text-[#989188] lg:grid lg:px-5">
              <span>Date</span><span>Stage</span><span>Venue / buyer</span><span>Location</span><span>Gross</span><span>Deposit</span><span>Next move</span><span />
            </div>
            <div className="divide-y divide-black/[0.05]">
              {pipeline.map((booking) => (
                <button key={booking.id} type="button" onClick={() => setSelected(booking)} className="grid w-full gap-2 px-4 py-3.5 text-left transition hover:bg-[#FBF9F5] lg:grid-cols-[95px_88px_minmax(170px,1.2fr)_minmax(130px,0.9fr)_100px_105px_minmax(180px,1.2fr)_26px] lg:items-center lg:gap-3 lg:px-5">
                  <div><div className="text-[9px] font-semibold text-[#4A443E]">{shortDate(booking.date)}</div><div className="mt-0.5 text-[7px] text-[#A09A92]">{booking.id}</div></div>
                  <div><StageChip booking={booking} /></div>
                  <div className="min-w-0"><div className="truncate text-[9px] font-semibold text-[#3F3A35]">{booking.venue}</div><div className="mt-0.5 truncate text-[7px] text-[#9A938B]">{booking.buyer}</div></div>
                  <div className="truncate text-[8px] text-[#766F68]">{booking.city}</div>
                  <div className="text-[9px] font-semibold tabular-nums text-[#4C4640]">{money(booking.gross)}</div>
                  <div className="text-[8px] font-semibold text-[#6E6861]">{booking.deposit}</div>
                  <div className="min-w-0"><div className="flex items-center gap-2"><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${priorityDot(booking.priority)}`} /><span className="truncate text-[8px] font-semibold text-[#4D4741]">{booking.nextAction}</span></div><div className="mt-0.5 pl-3.5 text-[7px] text-[#A09A92]">{booking.nextDue}</div></div>
                  <ChevronRight size={11} className="hidden text-[#B1AAA2] lg:block" />
                </button>
              ))}
              {pipeline.length === 0 ? <div className="px-5 py-10 text-center text-[9px] text-[#8D867E]">No bookings match this view.</div> : null}
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <div className="rounded-[22px] border border-black/[0.075] bg-white p-5">
              <div className="flex items-center justify-between gap-3"><IconLabel icon={Plane}>Tour ops · next show</IconLabel><span className="text-[8px] font-semibold text-[#8C857D]">Sep 9 · Karon</span></div>
              <div className="mt-4 grid gap-4 md:grid-cols-[150px_minmax(0,1fr)]">
                <div className="rounded-[18px] bg-[#F6F4F0] p-4"><div className="text-[7px] uppercase tracking-[0.1em] text-[#958E86]">Call time</div><div className="mt-1 text-[24px] font-semibold tracking-[-0.04em]">18:30</div><div className="mt-4 text-[7px] uppercase tracking-[0.1em] text-[#958E86]">On stage</div><div className="mt-1 text-[13px] font-semibold">19:30</div></div>
                <div className="space-y-2">
                  {["Venue contact confirmed", "Backline / rider checked", "Set length confirmed", "Guest list closes 16:00", "Settlement contact assigned"].map((item, index) => (
                    <div key={item} className="flex items-center gap-2.5 rounded-xl border border-black/[0.06] px-3 py-2.5 text-[8px] text-[#68625B]"><span className={`inline-flex h-4 w-4 items-center justify-center rounded-full ${index < 3 ? "bg-emerald-50 text-emerald-800" : "bg-[#F5F2EC] text-[#8A633C]"}`}>{index < 3 ? <Check size={9} /> : <Clock3 size={8} />}</span>{item}</div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-[22px] border border-[#A37849]/14 bg-[#FFFDF9] p-5">
              <div className="flex items-center justify-between gap-3"><IconLabel icon={WalletCards}>Finance handoff</IconLabel><ShieldCheck size={13} className="text-[#6F7E68]" /></div>
              <h3 className="mt-3 text-[18px] font-semibold tracking-[-0.03em]">One commercial story. One accounting truth.</h3>
              <p className="mt-2 max-w-2xl text-[9px] leading-5 text-[#817A72]">Agency Operations can prepare deal economics, deposit status and settlement evidence, but it never creates a second ledger. Finance remains authoritative for invoices, receipts, payments, tax and settlement posting.</p>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-black/[0.06] bg-white p-3"><div className="text-[7px] uppercase tracking-[0.08em] text-[#969087]">Ready to settle</div><div className="mt-1 text-[16px] font-semibold">1</div></div>
                <div className="rounded-xl border border-black/[0.06] bg-white p-3"><div className="text-[7px] uppercase tracking-[0.08em] text-[#969087]">Deposit due</div><div className="mt-1 text-[16px] font-semibold">1</div></div>
                <div className="rounded-xl border border-black/[0.06] bg-white p-3"><div className="text-[7px] uppercase tracking-[0.08em] text-[#969087]">Mismatch</div><div className="mt-1 text-[16px] font-semibold">0</div></div>
              </div>
              <Link href={organizationId ? `/workspace/${organizationId}/finance` : "#"} className="mt-4 inline-flex h-9 items-center gap-2 rounded-xl bg-[#25231F] px-4 text-[9px] font-semibold text-white">Open Finance settlement <ArrowRight size={10} /></Link>
            </div>
          </section>
        </main>
      </div>

      <BookingDetail booking={selected} organizationId={organizationId} onClose={() => setSelected(null)} />

      {showNewBooking ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/20 p-4 backdrop-blur-[2px]" onMouseDown={() => setShowNewBooking(false)}>
          <div className="w-full max-w-[620px] rounded-[24px] border border-black/[0.08] bg-[#F7F6F3] p-5 shadow-2xl md:p-7" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4"><div><div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#9A744B]">New booking</div><h2 className="mt-1.5 text-[24px] font-semibold tracking-[-0.04em]">Capture the opportunity once.</h2><p className="mt-1 text-[9px] leading-5 text-[#807A72]">The production form will create the governed agency record and carry it through holds, offer, contract, confirmation and settlement.</p></div><button type="button" onClick={() => setShowNewBooking(false)} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-black/[0.08] bg-white"><X size={14} /></button></div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {["Artist", "Buyer / promoter", "Venue", "City", "Event date", "Gross offer"].map((field) => <label key={field} className="block"><span className="text-[7px] font-semibold uppercase tracking-[0.08em] text-[#8F8880]">{field}</span><div className="mt-1.5 h-9 rounded-xl border border-black/[0.08] bg-white" /></label>)}
            </div>
            <div className="mt-5 flex items-center justify-between gap-3 border-t border-black/[0.06] pt-4"><div className="flex items-center gap-1.5 text-[8px] text-[#8C857D]"><ShieldCheck size={10} /> Prototype only · no record will be written</div><button type="button" onClick={() => setShowNewBooking(false)} className="inline-flex h-9 items-center gap-2 rounded-xl bg-[#25231F] px-4 text-[9px] font-semibold text-white">Save draft <ArrowRight size={10} /></button></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
