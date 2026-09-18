"use client";

import { useMemo, useState } from "react";

const BUSINESS_TYPES = [
  ["restaurant", "Restaurant / bar"],
  ["hotel", "Hotel / accommodation"],
  ["retail", "Retail / commerce"],
  ["services", "Service business"],
  ["accounting", "Accounting / advisory"],
  ["agency", "Agency / creative"],
  ["other", "Other business"],
];

const NEEDS = [
  ["operate", "Run daily operations"],
  ["people", "Manage people & work"],
  ["money", "Control money"],
  ["stock", "Control stock & purchasing"],
  ["documents", "Handle documents"],
  ["understand", "Understand what needs attention"],
  ["create", "Create marketing & content"],
  ["build", "Build with Avantiqo"],
];

const SIZE = [["small", "1 location"], ["growing", "2–10 locations"], ["large", "Larger / multi-entity"]];
const CURRENT = [["none", "Starting fresh"], ["replace", "Replacing another system"], ["connect", "Keep existing systems and connect"]];

function recommendation(type, need) {
  if (need === "create") return { title: "Creative Studios", href: "/creative-studios", detail: "Start with the studio that matches the work, then connect campaigns and business context when useful." };
  if (need === "build") return { title: "Developers", href: "/developers", detail: "Start with APIs, capabilities and integrations. Add Compute when workloads need dedicated capacity." };
  if (type === "restaurant") return { title: "Restaurant Operations", href: "/restaurant-management-system", detail: "Start with the restaurant operating setup, then activate the exact areas you need first." };
  if (type === "hotel") return { title: "Hotel Operations", href: "/hotel-operations-software", detail: "Start with hotel operations and add the workflows needed for your property." };
  if (need === "people") return { title: "Workforce", href: "/products/workforce", detail: "Start with scheduling, attendance and workforce records. Payroll and finance can connect afterwards." };
  if (need === "money") return { title: "Finance", href: "/products/finance", detail: "Start with invoicing, bills, banking, reconciliation and reporting." };
  if (need === "stock") return { title: "Inventory & Supply", href: "/products/inventory", detail: "Start with inventory, purchasing, receiving and costing." };
  if (need === "documents") return { title: "Documents", href: "/documents", detail: "Start with document capture and understanding, then connect the next business action." };
  if (need === "understand") return { title: "Business Partner", href: "/intelligence-platform", detail: "Start by asking Avantiqo about the business and connect the data areas you want it to work with." };
  return { title: "Business OS", href: "/business", detail: "Start with the operating area causing the most friction and expand from there." };
}

function Choice({ active, onClick, children }) {
  return <button type="button" onClick={onClick} className={`rounded-[14px] border px-3 py-3 text-left text-[9px] font-medium transition ${active ? "border-[#D6A66A]/70 bg-[#D6A66A]/[0.10] text-[#F0D2AA]" : "border-white/[0.09] bg-white/[0.025] text-white/55 hover:border-white/[0.18] hover:text-white"}`}>{children}</button>;
}

export default function GuidedStart() {
  const [businessType, setBusinessType] = useState("restaurant");
  const [need, setNeed] = useState("operate");
  const [size, setSize] = useState("small");
  const [current, setCurrent] = useState("replace");
  const result = useMemo(() => recommendation(businessType, need), [businessType, need]);

  return <section className="border-b border-black/[0.06] bg-[#171614] text-white">
    <div className="mx-auto grid max-w-[1320px] gap-10 px-5 py-16 sm:px-7 lg:grid-cols-[1.05fr_.95fr] lg:px-10 lg:py-20">
      <div>
        <p className="text-[8px] font-semibold uppercase tracking-[.22em] text-[#D6A66A]">FIND YOUR STARTING POINT</p>
        <h2 className="mt-4 max-w-2xl text-[40px] font-medium leading-[1] tracking-[-.05em] sm:text-[52px]">Tell Avantiqo what you need. Not which module you understand.</h2>
        <p className="mt-5 max-w-2xl text-[12px] leading-6 text-white/48">Choose four simple answers. The recommendation is a starting point, not a lock-in. You can add connected products later without rebuilding the company setup.</p>
        <div className="mt-8 space-y-7">
          <div><div className="mb-2 text-[7px] font-semibold uppercase tracking-[.17em] text-white/34">01 · What kind of business?</div><div className="grid gap-2 sm:grid-cols-2">{BUSINESS_TYPES.map(([id,label])=><Choice key={id} active={businessType===id} onClick={()=>setBusinessType(id)}>{label}</Choice>)}</div></div>
          <div><div className="mb-2 text-[7px] font-semibold uppercase tracking-[.17em] text-white/34">02 · What do you want to improve first?</div><div className="grid gap-2 sm:grid-cols-2">{NEEDS.map(([id,label])=><Choice key={id} active={need===id} onClick={()=>setNeed(id)}>{label}</Choice>)}</div></div>
          <div className="grid gap-6 sm:grid-cols-2">
            <div><div className="mb-2 text-[7px] font-semibold uppercase tracking-[.17em] text-white/34">03 · Operating size</div><div className="grid gap-2">{SIZE.map(([id,label])=><Choice key={id} active={size===id} onClick={()=>setSize(id)}>{label}</Choice>)}</div></div>
            <div><div className="mb-2 text-[7px] font-semibold uppercase tracking-[.17em] text-white/34">04 · Existing software</div><div className="grid gap-2">{CURRENT.map(([id,label])=><Choice key={id} active={current===id} onClick={()=>setCurrent(id)}>{label}</Choice>)}</div></div>
          </div>
        </div>
      </div>
      <div className="lg:sticky lg:top-24 lg:self-start">
        <div className="overflow-hidden rounded-[28px] border border-[#D6A66A]/25 bg-[#211D18] shadow-[0_35px_100px_rgba(0,0,0,.28)]">
          <div className="relative h-[260px] overflow-hidden">
            <div className="absolute inset-0 bg-cover bg-center" style={{backgroundImage:"url(/art/avantiqo-luxury/hospitality.webp)"}} />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,7,6,.04),rgba(8,7,6,.28)_46%,rgba(8,7,6,.86))]" />
            <div className="absolute left-6 top-6 text-[7px] font-semibold uppercase tracking-[.22em] text-[#F0C98F]">AVANTIQO / RECOMMENDED START</div>
            <div className="absolute bottom-6 left-6 right-6"><div className="text-[9px] uppercase tracking-[.16em] text-white/45">Based on your answers</div><div className="mt-2 text-[30px] font-medium tracking-[-.045em]">{result.title}</div></div>
          </div>
          <div className="p-6 sm:p-7">
            <p className="text-[12px] leading-6 text-white/58">{result.detail}</p>
            <div className="mt-5 grid grid-cols-2 gap-2 text-[7px] uppercase tracking-[.13em] text-white/34"><span>{size === "small" ? "Single-location start" : size === "growing" ? "Multi-location ready" : "Multi-entity ready"}</span><span>{current === "none" ? "Fresh setup" : current === "replace" ? "Migration path" : "Integration path"}</span></div>
            <a href={result.href} className="mt-7 inline-flex h-11 items-center rounded-full bg-[#D6A66A] px-5 text-[10px] font-semibold text-[#3A3026] transition hover:-translate-y-0.5">Explore this starting point →</a>
          </div>
        </div>
      </div>
    </div>
  </section>;
}
