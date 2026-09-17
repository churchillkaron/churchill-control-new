"use client";

import { useMemo, useState } from "react";

export default function ProductFinder({ products, families }) {
  const [family, setFamily] = useState("all");
  const [query, setQuery] = useState("");
  const familyMap = useMemo(() => Object.fromEntries(families.map((item) => [item.id, item.label])), [families]);
  const visible = useMemo(() => products.filter((product) => {
    const familyMatch = family === "all" || product.family === family;
    const haystack = `${product.name} ${product.summary} ${product.buyers} ${product.verticals.join(" ")}`.toLowerCase();
    return familyMatch && (!query.trim() || haystack.includes(query.trim().toLowerCase()));
  }), [products, family, query]);

  return <section className="border-b border-[#CFC5B8]/45 bg-[#ECE7DE]">
    <div className="mx-auto max-w-[1540px] px-5 py-14 sm:px-7 lg:px-10 lg:py-20 xl:px-14">
      <div className="grid gap-6 lg:grid-cols-[.7fr_1.3fr] lg:items-end">
        <div><p className="text-[8px] font-semibold uppercase tracking-[.2em] text-[#8D673E]">FIND YOUR PRODUCT</p><h2 className="mt-3 text-[40px] font-medium leading-[1] tracking-[-.05em] sm:text-[52px]">What do you want to improve?</h2></div>
        <p className="max-w-2xl text-[12px] leading-6 text-[#6E675F] lg:justify-self-end">Search by job, team or industry. You can start with one Avantiqo product and add more later without replacing the foundation underneath.</p>
      </div>

      <div className="mt-9 border-y border-[#CFC5B8]/55 py-5">
        <label className="block"><span className="text-[7px] font-semibold uppercase tracking-[.16em] text-[#8A8177]">Search by need, product or industry</span><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Payroll, bookings, restaurant, invoices, hotel, inventory..." className="mt-2 h-11 w-full border border-[#BDAF9E]/40 bg-[#F7F4EF] px-4 text-[11px] outline-none transition placeholder:text-[#9A948C] focus:border-[#B78A55]/55" /></label>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-[#CFC5B8]/45 pt-4">
          <button onClick={()=>setFamily("all")} className={`text-[8px] font-semibold ${family==="all"?"text-[#7F5832]":"text-[#7B746C] hover:text-[#332E29]"}`}>All products</button>
          {families.map((item)=><button key={item.id} onClick={()=>setFamily(item.id)} className={`text-[8px] font-semibold ${family===item.id?"text-[#7F5832]":"text-[#7B746C] hover:text-[#332E29]"}`}>{item.label}</button>)}
        </div>
      </div>

      <div className="mt-6 divide-y divide-[#CFC5B8]/50 border-y border-[#CFC5B8]/55">
        {visible.slice(0,24).map((product)=><a key={product.id} href={product.href || `/products/${product.id}`} className="grid gap-3 py-4 transition hover:bg-white/45 lg:grid-cols-[1.1fr_1.45fr_.7fr] lg:items-center lg:px-3">
          <div><div className="text-[12px] font-semibold text-[#2E2924]">{product.name}</div><div className="mt-1 text-[8px] text-[#827A72]">{familyMap[product.family]}</div></div>
          <div className="text-[10px] leading-5 text-[#5F5952]">{product.summary}</div>
          <div className="text-[8px] font-semibold text-[#815B36] lg:text-right">Explore product</div>
        </a>)}
        {!visible.length ? <div className="py-12 text-center text-[10px] text-[#7C746B]">No products match this search.</div> : null}
      </div>
      {visible.length>24?<div className="mt-4 text-[8px] text-[#847B71]">Showing the first 24 matches. Narrow your search to find the right product faster.</div>:null}
    </div>
  </section>;
}
