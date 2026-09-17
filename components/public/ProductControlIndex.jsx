"use client";

import { useMemo, useState } from "react";
import { publicStatusKey, PUBLIC_PRODUCT_STATUS } from "@/components/public/productStatus";

export default function ProductControlIndex({ products, families }) {
  const [family, setFamily] = useState("all");
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const familyMap = useMemo(() => Object.fromEntries(families.map((item) => [item.id, item.label])), [families]);
  const visible = useMemo(() => products.filter((product) => {
    const familyMatch = family === "all" || product.family === family;
    const statusMatch = status === "all" || publicStatusKey(product) === status;
    const haystack = `${product.name} ${product.summary} ${product.engine} ${product.buyers} ${product.verticals.join(" ")}`.toLowerCase();
    return familyMatch && statusMatch && (!query.trim() || haystack.includes(query.trim().toLowerCase()));
  }), [products, family, status, query]);

  return <section className="border-b border-[#BDAF9E]/30 bg-[#ECE7DE]">
    <div className="mx-auto max-w-[1540px] px-5 py-14 sm:px-7 lg:px-10 lg:py-18 xl:px-14">
      <div className="grid gap-6 lg:grid-cols-[.7fr_1.3fr] lg:items-end">
        <div><p className="text-[8px] font-semibold uppercase tracking-[.2em] text-[#8D673E]">PRODUCT FINDER</p><h2 className="mt-3 text-[40px] font-medium leading-[1] tracking-[-.05em] sm:text-[52px]">Find the Avantiqo product that fits the job.</h2></div>
        <p className="max-w-2xl text-[12px] leading-6 text-[#6E675F] lg:justify-self-end">Search by product, engine or industry and explore what is available now, in Early Access or coming next.</p>
      </div>

      <div className="mt-9 border-y border-[#BDAF9E]/40 py-5">
        <div className="grid gap-4 xl:grid-cols-[1fr_auto_auto] xl:items-end">
          <label className="block"><span className="text-[7px] font-semibold uppercase tracking-[.16em] text-[#8A8177]">Search product, engine or industry</span><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="POS, payroll, invoice, hotel, API..." className="mt-2 h-11 w-full border border-[#BDAF9E]/40 bg-[#F7F4EF] px-4 text-[11px] outline-none transition placeholder:text-[#9A948C] focus:border-[#B78A55]/55" /></label>
          <div><div className="text-[7px] font-semibold uppercase tracking-[.16em] text-[#8A8177]">Availability</div><div className="mt-2 flex flex-wrap border border-[#BDAF9E]/40 bg-[#F7F4EF]">{[["all","All"],["available","Available"],["early_access","Early Access"],["coming_soon","Coming Soon"]].map(([value,label])=><button key={value} onClick={()=>setStatus(value)} className={`h-10 border-r border-[#BDAF9E]/35 px-3 text-[8px] font-semibold last:border-r-0 ${status===value?"bg-[#F3EEE5] text-[#D6A66A]":"text-[#625D55] hover:bg-white"}`}>{label}</button>)}</div></div>
          <div className="text-right"><div className="text-[7px] font-semibold uppercase tracking-[.16em] text-[#8A8177]">Visible records</div><div className="mt-2 text-[34px] font-medium tracking-[-.05em] text-[#292520]">{visible.length}</div></div>
        </div>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-[#BDAF9E]/35 pt-4">
          <button onClick={()=>setFamily("all")} className={`text-[8px] font-semibold ${family==="all"?"text-[#7F5832]":"text-[#7B746C] hover:text-[#332E29]"}`}>All families</button>
          {families.map((item)=><button key={item.id} onClick={()=>setFamily(item.id)} className={`text-[8px] font-semibold ${family===item.id?"text-[#7F5832]":"text-[#7B746C] hover:text-[#332E29]"}`}>{item.label}</button>)}
        </div>
      </div>

      <div className="mt-6 overflow-hidden border border-[#BDAF9E]/35 bg-[#F7F4EF]">
        <div className="hidden grid-cols-[1.1fr_.8fr_.72fr_.72fr_.85fr] border-b border-[#BDAF9E]/35 bg-[#E6E0D6] px-5 py-3 text-[7px] font-semibold uppercase tracking-[.14em] text-[#81786E] lg:grid">
          <div>Product</div><div>Engine</div><div>Family</div><div>Availability</div><div>Explore</div>
        </div>
        <div className="divide-y divide-black/[.07]">
          {visible.map((product)=><a key={product.id} href={product.href || `/products/${product.id}`} className="grid gap-3 px-5 py-4 transition hover:bg-white/75 lg:grid-cols-[1.1fr_.8fr_.72fr_.72fr_.85fr] lg:items-center">
            <div><div className="text-[11px] font-semibold text-[#2E2924]">{product.name}</div><div className="mt-1 line-clamp-1 text-[8px] text-[#827A72]">{product.buyers}</div></div>
            <div className="text-[9px] leading-5 text-[#5F5952]">{product.engine}</div>
            <div className="text-[8px] font-medium text-[#756D64]">{familyMap[product.family]}</div>
            <div><span className="border-b border-[#B88C59]/35 pb-1 text-[8px] font-semibold text-[#705535]">{PUBLIC_PRODUCT_STATUS[publicStatusKey(product)]?.label || "Coming Soon"}</span></div>
            <div className="flex items-center justify-between gap-4 text-[8px] font-semibold text-[#615B54]"><span>Product details</span><span className="text-[#A77A49]">View</span></div>
          </a>)}
          {!visible.length ? <div className="px-5 py-12 text-center text-[10px] text-[#7C746B]">No catalog records match this filter.</div> : null}
        </div>
      </div>
    </div>
  </section>;
}
