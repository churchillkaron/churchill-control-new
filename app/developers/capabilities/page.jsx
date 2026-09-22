import PublicSiteHeader from "@/components/public/PublicSiteHeader";
import { productCatalog, PRODUCT_FAMILIES } from "@/components/public/productCatalog";

export const metadata = {
  title: "Developer Capabilities | Avantiqo",
  description: "Browse Avantiqo capability families for developers, then open the exact family when you need contract-level product context.",
};

const apiProducts = productCatalog.filter((product) => product.api);
const groups = PRODUCT_FAMILIES.map((family) => ({
  ...family,
  products: apiProducts.filter((product) => product.family === family.id),
})).filter((family) => family.products.length);

export default function DeveloperCapabilitiesPage(){
  return <main className="min-h-screen bg-[#F7F6F3] text-[#171614]">
    <PublicSiteHeader context="Developer Capabilities" audience="developers" />
    <section className="border-b border-[#BDAF9E]/30 bg-[#F3EEE5]">
      <div className="mx-auto max-w-[1540px] px-5 py-16 sm:px-7 lg:px-10 lg:py-24 xl:px-14">
        <p className="text-[9px] font-semibold uppercase tracking-[.24em] text-[#9A744B]">AVANTIQO CAPABILITY CATALOG</p>
        <div className="mt-4 grid gap-10 lg:grid-cols-[1.15fr_.85fr] lg:items-end">
          <div><h1 className="max-w-[980px] text-[54px] font-medium leading-[.93] tracking-[-.065em] sm:text-[72px] lg:text-[84px]">Choose the business contract before you choose the endpoint.</h1><p className="mt-7 max-w-[850px] text-[15px] leading-8 text-[#655D54]">Avantiqo capabilities are organized by the business job they govern. Start with the family, then inspect the exact capability context instead of scrolling through hundreds of unrelated contracts.</p></div>
          <div className="rounded-[28px] border border-[#BDAF9E]/35 bg-white/64 p-6 shadow-[0_18px_50px_rgba(55,39,22,.06)]"><div className="text-[42px] font-medium tracking-[-.06em]">{apiProducts.length}</div><div className="mt-1 text-[8px] font-semibold uppercase tracking-[.15em] text-[#9A744B]">developer-visible capabilities</div><p className="mt-5 text-[10px] leading-5 text-[#7A756E]">Organization scope, permission boundaries, execution evidence and usage controls remain part of the platform contract.</p></div>
        </div>
      </div>
    </section>
    <section className="border-b border-[#BDAF9E]/30 bg-[#FBFAF8]">
      <div className="mx-auto max-w-[1540px] px-5 py-14 sm:px-7 lg:px-10 lg:py-20 xl:px-14">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((group,index)=><a key={group.id} href={`/developers/capabilities/${group.id}`} className="group rounded-[24px] border border-[#BDAF9E]/30 bg-white p-6 shadow-[0_12px_35px_rgba(55,39,22,.04)] transition hover:-translate-y-1 hover:border-[#B98A52]/45 hover:shadow-[0_20px_55px_rgba(55,39,22,.08)]"><div className="flex items-start justify-between gap-5"><span className="text-[8px] font-bold text-[#A37849]">{String(index+1).padStart(2,"0")}</span><span className="rounded-full border border-[#D6A66A]/24 bg-[#FAF6EF] px-2.5 py-1 text-[7px] font-semibold text-[#8A633C]">{group.products.length} capabilities</span></div><h2 className="mt-8 text-[24px] font-medium tracking-[-.04em] text-[#29251F]">{group.label}</h2><p className="mt-3 min-h-[60px] text-[10px] leading-5 text-[#746E66]">{group.description}</p><div className="mt-6 border-t border-[#BDAF9E]/25 pt-4"><div className="text-[7px] font-semibold uppercase tracking-[.14em] text-[#998C7E]">Examples</div><div className="mt-2 text-[9px] leading-5 text-[#5F5851]">{group.products.slice(0,3).map(p=>p.name).join(" · ")}</div></div><div className="mt-5 text-[8px] font-semibold text-[#8E653D]">Open capability family →</div></a>)}
        </div>
      </div>
    </section>
    <section className="bg-[#EEE6DB]"><div className="mx-auto max-w-[1120px] px-5 py-20 text-center sm:px-7 lg:px-10"><p className="text-[9px] font-semibold uppercase tracking-[.22em] text-[#9A744B]">NEED THE OPERATING MODEL FIRST?</p><h2 className="mx-auto mt-4 max-w-4xl text-[42px] font-medium leading-[.98] tracking-[-.055em] sm:text-[58px]">Understand the developer control plane before choosing authority.</h2><div className="mt-8 flex flex-wrap justify-center gap-2.5"><a href="/developers" className="inline-flex h-11 items-center rounded-full bg-[#171614] px-5 text-[10px] font-semibold text-white">Developers</a><a href="/api-platform" className="inline-flex h-11 items-center rounded-full border border-black/[0.10] bg-white/62 px-5 text-[10px] font-semibold text-[#5A5148]">API Platform</a></div></div></section>
  </main>;
}
