const FAMILY_ART = {
  "sell-serve": ["Demand", "Order / Booking", "Service", "Payment", "Repeat"],
  "people-work": ["Plan", "Assign", "Work", "Records", "Pay"],
  "money-control": ["Source", "Approve", "Settle", "Ledger", "Report"],
  "stock-supply": ["Buy", "Receive", "Store", "Use / Make", "Replenish"],
  "documents-automation": ["Capture", "Classify", "Extract", "Validate", "Execute"],
  "customer-growth": ["Audience", "Conversation", "Offer", "Conversion", "Learn"],
  intelligence: ["Records", "Reason", "Decide", "Execute", "Verify"],
  creative: ["Brief", "Research", "Produce", "Review", "Deliver"],
  platform: ["Request", "Context", "Capability", "Meter", "Proof"],
  industry: ["Customer", "Operations", "People", "Money", "Control"],
};

const FAMILY_IMAGE = {
  "sell-serve": "/art/avantiqo-luxury/hospitality.webp",
  "people-work": "/art/avantiqo-luxury/people.webp",
  "money-control": "/art/commercial-insights.jpg",
  "stock-supply": "/churchill/bar.JPG",
  "documents-automation": "/art/commercial-integrations.jpg",
  "customer-growth": "/art/commercial-commerce.jpg",
  intelligence: "/art/commercial-insights.jpg",
  creative: "/art/creative-video.jpg",
  platform: "/art/developer-work.jpg",
  industry: "/art/commercial-solutions.jpg",
};

const FAMILY_KICKER = {
  "sell-serve": "SALES & SERVICE",
  "people-work": "WORK SYSTEM",
  "money-control": "FINANCIAL CONTROL",
  "stock-supply": "SUPPLY SYSTEM",
  "documents-automation": "DOCUMENT INTELLIGENCE",
  "customer-growth": "CUSTOMER SYSTEM",
  intelligence: "INTELLIGENCE SYSTEM",
  creative: "PRODUCTION SYSTEM",
  platform: "PLATFORM RUNTIME",
  industry: "INDUSTRY SYSTEM",
};
export default function ProductFamilyArt({ family, product }) {
  const steps = FAMILY_ART[family] || FAMILY_ART.platform;
  return <div className="relative min-h-[420px] overflow-hidden rounded-[30px] border border-[#BDAF9E]/35 bg-[#171614] p-7 text-white">
    <div className="absolute inset-0 bg-cover bg-center opacity-[.24]" style={{backgroundImage:`url(${FAMILY_IMAGE[family] || FAMILY_IMAGE.platform})`}} />
    <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(13,11,9,.92),rgba(13,11,9,.72)_48%,rgba(13,11,9,.87)),linear-gradient(180deg,rgba(13,11,9,.18),rgba(13,11,9,.82))]" />
    <div className="absolute inset-0 opacity-[.11]" style={{backgroundImage:"linear-gradient(rgba(214,166,106,.10) 1px,transparent 1px),linear-gradient(90deg,rgba(214,166,106,.10) 1px,transparent 1px)",backgroundSize:"56px 56px"}} />
    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#D6A66A]/35 to-transparent" />
    <div className="relative z-10 flex items-start justify-between gap-8 border-b border-white/[.08] pb-6">
      <div><div className="text-[7px] font-semibold uppercase tracking-[.24em] text-[#C89A62]">{FAMILY_KICKER[family]}</div><div className="mt-3 max-w-[500px] text-[28px] font-medium leading-[1] tracking-[-.045em] text-white/94">{product?.name || "Avantiqo Engine"}</div></div>
      <div className="max-w-[190px] text-right"><div className="text-[7px] uppercase tracking-[.18em] text-white/26">Underlying engine</div><div className="mt-2 text-[10px] leading-5 text-white/56">{product?.engine || "Shared engine"}</div></div>
    </div>
    <div className="relative z-10 mt-10">
      <div className="grid grid-cols-5 border-y border-white/[.08]">
        {steps.map((step,index)=><div key={step} className={`min-w-0 py-6 ${index>0?"border-l border-white/[.08] pl-5":"pr-5"}`}><div className="text-[7px] font-semibold uppercase tracking-[.16em] text-white/28">0{index+1}</div><div className={`mt-3 text-[10px] font-medium leading-5 ${index===2?"text-[#D6A66A]":"text-white/68"}`}>{step}</div></div>)}
      </div>
    </div>
    <div className="relative z-10 mt-12 grid gap-8 border-t border-white/[.08] pt-6 sm:grid-cols-[.72fr_1.28fr]">
      <div><div className="text-[7px] uppercase tracking-[.18em] text-white/24">Operating principle</div><div className="mt-3 text-[12px] leading-6 text-white/60">A focused product experience with connected business data and permissions.</div></div>
      <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">{["Organization","Identity","Permissions","Records","Controls","Intelligence","Wallet","API"].map((item)=><div key={item} className="border-t border-white/[.08] pt-2 text-[7px] uppercase tracking-[.10em] text-white/34">{item}</div>)}</div>
    </div>
  </div>;
}
