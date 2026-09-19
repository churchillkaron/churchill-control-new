
const FAMILY_ART = {
  "sell-serve": ["Demand", "Order / Booking", "Service", "Payment", "Repeat"],
  "people-work": ["Plan", "Assign", "Work", "Records", "Pay"],
  "money-control": ["Source", "Approve", "Settle", "Ledger", "Report"],
  "stock-supply": ["Buy", "Receive", "Store", "Use / Make", "Replenish"],
  "documents-automation": ["Capture", "Classify", "Extract", "Validate", "Execute"],
  "customer-growth": ["Audience", "Conversation", "Offer", "Conversion", "Learn"],
  "portals-external": ["Identity", "Context", "Self-service", "Transaction", "History"],
  intelligence: ["Records", "Reason", "Decide", "Execute", "Verify"],
  creative: ["Brief", "Research", "Produce", "Review", "Deliver"],
  platform: ["Request", "Context", "Capability", "Meter", "Proof"],
  industry: ["Customer", "Operations", "People", "Money", "Control"],
};

const FAMILY_KIND = {
  "sell-serve": "commerce",
  "people-work": "workforce",
  "money-control": "finance",
  "stock-supply": "inventory",
  "documents-automation": "documents",
  "customer-growth": "commerce",
  "portals-external": "portal",
  intelligence: "intelligence",
  creative: "creative",
  platform: "developer",
  industry: "solutions",
};

const FAMILY_KICKER = {
  "sell-serve": "SALES & SERVICE",
  "people-work": "WORK SYSTEM",
  "money-control": "FINANCIAL CONTROL",
  "stock-supply": "SUPPLY SYSTEM",
  "documents-automation": "DOCUMENT INTELLIGENCE",
  "customer-growth": "CUSTOMER SYSTEM",
  "portals-external": "CONNECTED PORTAL",
  intelligence: "INTELLIGENCE SYSTEM",
  creative: "PRODUCTION SYSTEM",
  platform: "PLATFORM RUNTIME",
  industry: "INDUSTRY SYSTEM",
};
export default function ProductFamilyArt({ family, product }) {
  const steps = FAMILY_ART[family] || FAMILY_ART.platform;
  return <div className="relative min-h-[420px] overflow-hidden rounded-[30px] border border-[#C8B7A0]/45 bg-[linear-gradient(135deg,#FFF9F0_0%,#F1E4D2_56%,#E6C79C_100%)] p-7 text-[#2B251F] shadow-[0_24px_70px_rgba(56,39,22,.08)]">
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_14%,rgba(255,255,255,.55),transparent_32%)]" />
    <div className="relative z-10 flex items-start justify-between gap-8 border-b border-black/[.06] pb-6">
      <div><div className="text-[7px] font-semibold uppercase tracking-[.24em] text-[#9A6A37]">{FAMILY_KICKER[family]}</div><div className="mt-3 max-w-[500px] text-[28px] font-medium leading-[1] tracking-[-.045em] text-[#2B251F]">{product?.name || "Avantiqo Engine"}</div></div>
      <div className="max-w-[190px] text-right"><div className="text-[7px] uppercase tracking-[.18em] text-[#9B8A79]">Underlying engine</div><div className="mt-2 text-[10px] leading-5 text-[#655B51]">{product?.engine || "Shared engine"}</div></div>
    </div>
    <div className="relative z-10 mt-10">
      <div className="grid grid-cols-5 border-y border-black/[.06]">
        {steps.map((step,index)=><div key={step} className={`min-w-0 py-6 ${index>0?"border-l border-black/[.06] pl-5":"pr-5"}`}><div className="text-[7px] font-semibold uppercase tracking-[.16em] text-[#9A8A79]">0{index+1}</div><div className={`mt-3 text-[10px] font-medium leading-5 ${index===2?"text-[#9A6A37]":"text-[#51483F]"}`}>{step}</div></div>)}
      </div>
    </div>
    <div className="relative z-10 mt-12 grid gap-8 border-t border-black/[.06] pt-6 sm:grid-cols-[.72fr_1.28fr]">
      <div><div className="text-[7px] uppercase tracking-[.18em] text-[#9B8A79]">Operating principle</div><div className="mt-3 text-[12px] leading-6 text-[#62584E]">A focused product experience with connected business data and permissions.</div></div>
      <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">{["Organization","Identity","Permissions","Records","Controls","Intelligence","Wallet","API"].map((item)=><div key={item} className="border-t border-black/[.06] pt-2 text-[7px] uppercase tracking-[.10em] text-[#8E7E6D]">{item}</div>)}</div>
    </div>
  </div>;
}
