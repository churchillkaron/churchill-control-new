"use client";

import { useMemo, useState } from "react";

export default function ProductFinder({ products, groups, initialGroup = "all" }) {
  const validInitialGroup = initialGroup === "all" || groups.some((item) => item.id === initialGroup) ? initialGroup : "all";
  const [group, setGroup] = useState(validInitialGroup);
  const [query, setQuery] = useState("");
  const selectedGroup = useMemo(() => groups.find((item) => item.id === group), [groups, group]);
  const visible = useMemo(() => products.filter((product) => {
    const groupMatch = group === "all" || selectedGroup?.families?.includes(product.family);
    const haystack = `${product.name} ${product.summary} ${product.buyers} ${product.verticals.join(" ")}`.toLowerCase();
    return groupMatch && (!query.trim() || haystack.includes(query.trim().toLowerCase()));
  }), [products, group, query, selectedGroup]);

  return <section id="all-products" className="border-b border-[#CFC5B8]/45 bg-[#ECE7DE]">
    <div className="mx-auto max-w-[1540px] px-5 py-16 sm:px-7 lg:px-10 lg:py-20 xl:px-14">
      <div className="grid gap-6 lg:grid-cols-[.72fr_1.28fr] lg:items-end">
        <div><p className="text-[8px] font-semibold uppercase tracking-[.2em] text-[#8D673E]">ALL CUSTOMER PRODUCTS</p><h2 className="mt-3 text-[40px] font-medium leading-[1] tracking-[-.05em] sm:text-[52px]">Find exactly what you need.</h2></div>
        <p className="max-w-2xl text-[12px] leading-6 text-[#6E675F] lg:justify-self-end">Search the complete customer catalog by job, team, industry or product name. Business products are listed here. APIs and technical tools are available separately under Developers.</p>
      </div>

      <div className="mt-9 border-y border-[#CFC5B8]/55 py-5">
        <label className="block"><span className="text-[7px] font-semibold uppercase tracking-[.16em] text-[#8A8177]">Search products</span><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Payroll, bookings, restaurant, invoices, hotel, inventory..." className="mt-2 h-11 w-full border border-[#BDAF9E]/40 bg-[#F7F4EF] px-4 text-[11px] outline-none transition placeholder:text-[#9A948C] focus:border-[#B78A55]/55" /></label>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-[#CFC5B8]/45 pt-4">
          <button onClick={()=>setGroup("all")} className={`text-[8px] font-semibold ${group==="all"?"text-[#7F5832]":"text-[#7B746C] hover:text-[#332E29]"}`}>All customer products</button>
          {groups.map((item)=><button key={item.id} onClick={()=>setGroup(item.id)} className={`text-[8px] font-semibold ${group===item.id?"text-[#7F5832]":"text-[#7B746C] hover:text-[#332E29]"}`}>{item.label}</button>)}
        </div>
      </div>
      <div className="mt-6 divide-y divide-[#CFC5B8]/50 border-y border-[#CFC5B8]/55">
        {visible.slice(0,28).map((product)=><a key={product.id} href={`/products/${product.id}`} className="grid gap-3 py-4 transition hover:bg-white/45 lg:grid-cols-[1fr_1.65fr_.5fr] lg:items-center lg:px-3">
          <div><div className="text-[12px] font-semibold text-[#2E2924]">{product.name}</div><div className="mt-1 text-[8px] text-[#827A72]">{product.buyers}</div></div>
          <div className="text-[10px] leading-5 text-[#5F5952]">{product.summary}</div>
          <div className="text-[8px] font-semibold text-[#815B36] lg:text-right">Explore</div>
        </a>)}
        {!visible.length ? <div className="py-12 text-center text-[10px] text-[#7C746B]">No products match this search.</div> : null}
      </div>
      {visible.length>28?<div className="mt-4 text-[8px] text-[#847B71]">Showing the first 28 matches. Use search or a category to narrow the list.</div>:null}
    </div>
  </section>;
}
