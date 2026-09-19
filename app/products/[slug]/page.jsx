import PublicSiteHeader from "@/components/public/PublicSiteHeader";
import ProductFamilyArt from "@/components/public/ProductFamilyArt";
import { productCatalog } from "@/components/public/productCatalog";
import { notFound } from "next/navigation";

export function generateStaticParams() {
  return productCatalog.map((product) => ({ slug: product.id }));
}

export function generateMetadata({ params }) {
  const product = productCatalog.find((item) => item.id === params.slug);
  if (!product) return {};
  return { title: `${product.name} | Avantiqo`, description: product.summary };
}


function PortalProductStory({ product }) {
  const portalType = product.id === "staff-portal" ? "Staff" : product.id === "supplier-portal" ? "Supplier" : "Customer";
  const flows = portalType === "Customer"
    ? [["Booking / reservation","See dates, service, guests/site and status"],["Payment","Pay deposit, balance or invoice in the configured flow"],["Documents","Confirmations, invoices, receipts, certificates and files"],["Messages","Continue the same conversation without losing context"],["History","See previous bookings, services, payments and documents"]]
    : portalType === "Staff"
      ? [["Today","Shifts, assignments and work that needs attention"],["Work","Checklists, job details, customer/site context and evidence"],["Requests","Leave, availability, expenses and approvals"],["Pay","Payroll information and payslips"],["Messages","Operational communication connected to the work"]]
      : [["Orders","Purchase orders, quantities, prices and requested dates"],["Commitments","Accept, reject or confirm promised delivery dates"],["Delivery","Receiving status, shortages and exceptions"],["Invoices","Upload invoices and connect them to the correct PO / receipt"],["Payment status","See what is approved, due, disputed or paid"]];
  const principle = portalType === "Customer"
    ? "A customer should not need to search email, WhatsApp and PDFs to understand their relationship with the business."
    : portalType === "Staff"
      ? "A staff member should see the work they are allowed to perform — not the entire back office."
      : "A supplier should see the obligations they are part of — not the company’s internal systems.";
  return <section className="border-b border-[#CFC5B8]/45 bg-[#F3EEE5]"><div className="mx-auto max-w-[1320px] px-5 py-16 sm:px-7 lg:px-10 lg:py-24">
    <div className="grid gap-8 lg:grid-cols-[.72fr_1.28fr] lg:items-end"><div><p className="text-[8px] font-semibold uppercase tracking-[.18em] text-[#9A744B]">{portalType.toUpperCase()} EXPERIENCE</p><h2 className="mt-3 text-[40px] font-medium leading-[1.01] tracking-[-.05em] sm:text-[54px]">The same business. A different controlled view.</h2></div><p className="max-w-2xl text-[13px] leading-7 text-[#6D645B] lg:justify-self-end">{principle} Avantiqo keeps the underlying booking, payment, work, documents and messages in one business context while exposing only the experience this person needs.</p></div>
    <div className="mt-10 grid gap-3 md:grid-cols-5">{flows.map(([title,text],i)=><div key={title} className="rounded-[20px] border border-black/[0.07] bg-white/62 p-4"><div className="text-[7px] font-semibold text-[#A36F39]">0{i+1}</div><div className="mt-5 text-[11px] font-semibold text-[#342E28]">{title}</div><div className="mt-2 text-[8px] leading-4 text-[#7D7064]">{text}</div></div>)}</div>
    <div className="mt-6 rounded-[24px] border border-[#D6A66A]/22 bg-[#F2E5D3] p-5 sm:p-6">
      <div className="text-[7px] font-semibold uppercase tracking-[.18em] text-[#9A6A37]">ONE BUSINESS CONTEXT</div>
      <div className="mt-3 grid gap-2 text-[8px] sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center"><div className="rounded-[14px] border border-black/[0.05] bg-white/58 p-3">Internal Avantiqo record</div><div className="hidden text-center text-[#A36F39] sm:block">→</div><div className="rounded-[14px] border border-black/[0.05] bg-white/58 p-3">Exact permissions + identity</div><div className="hidden text-center text-[#A36F39] sm:block">→</div><div className="rounded-[14px] border border-black/[0.05] bg-[#FFF9F0] p-3 font-semibold text-[#3E362F]">{portalType} Portal</div></div>
    </div>
  </div></section>;
}

export default function CatalogProductPage({ params }) {
  const product = productCatalog.find((item) => item.id === params.slug);
  if (!product) notFound();
  return <main className="min-h-screen bg-[#F7F6F3] text-[#171614]">
    <PublicSiteHeader context={product.name} audience="business" />
    <section className="relative overflow-hidden border-b border-[#CFC5B8]/45 bg-[#F3EEE5]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(214,166,106,.22),transparent_30%)]" />
      <div className="relative mx-auto grid max-w-[1540px] lg:min-h-[690px] lg:grid-cols-[44%_56%]">
        <div className="flex items-center px-5 py-16 sm:px-7 lg:px-10 lg:py-20 xl:px-14">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[.22em] text-[#9A744B]">AVANTIQO {product.name.toUpperCase()}</p>
            <h1 className="mt-4 max-w-[650px] text-[50px] font-medium leading-[.94] tracking-[-.065em] sm:text-[64px] lg:text-[70px]">{product.summary}</h1>
            <p className="mt-7 max-w-xl text-[15px] leading-8 text-[#625D55]">Built for {product.buyers}. Start with this product on its own, then connect more Avantiqo products as your operation grows.</p>
            <div className="mt-7 flex flex-wrap gap-2">{product.verticals.slice(0,6).map((vertical)=><span key={vertical} className="rounded-full border border-[#D6A66A]/25 bg-white/55 px-3 py-1.5 text-[7px] font-semibold uppercase tracking-[.12em] text-[#80664B]">{vertical}</span>)}</div>
            <div className="mt-9 flex flex-wrap gap-2.5"><a href="/start" className="inline-flex h-11 items-center rounded-full bg-[#171614] px-5 text-[10px] font-semibold text-white">Start with {product.name} →</a>{product.href ? <a href={product.href} className="inline-flex h-11 items-center rounded-full border border-black/[0.10] bg-white/58 px-5 text-[10px] font-semibold text-[#5A5148]">Explore full {product.name} →</a> : null}</div>
          </div>
        </div>
        <div className="relative min-h-[520px] overflow-hidden border-t border-black/[.06] p-5 sm:p-7 lg:min-h-0 lg:border-l lg:border-t-0 lg:p-8">
          <div className="absolute inset-0 bg-[#E9DFD1]"/>
          <div className="relative flex h-full items-center"><div className="w-full"><ProductFamilyArt family={product.family} product={product}/></div></div>
        </div>
      </div>
    </section>
    <section className="border-b border-[#CFC5B8]/45 bg-[#FBFAF8]"><div className="mx-auto max-w-[1320px] px-5 py-16 sm:px-7 lg:px-10 lg:py-24">
      <div className="grid gap-8 lg:grid-cols-[.72fr_1.28fr] lg:items-end"><div><p className="text-[8px] font-semibold uppercase tracking-[.18em] text-[#9A744B]">WHY THIS PRODUCT</p><h2 className="mt-3 text-[40px] font-medium tracking-[-.05em] sm:text-[54px]">Solve the job without buying more than you need.</h2></div><p className="max-w-2xl text-[13px] leading-7 text-[#706A62] lg:justify-self-end">{product.summary} Your organization, users and business records stay connected when you add more Avantiqo products later.</p></div>
      <div className="mt-10 grid gap-x-8 gap-y-8 md:grid-cols-3">
        <div className="border-t border-[#CFC5B8] pt-5"><div className="text-[8px] font-semibold uppercase tracking-[.16em] text-[#9A744B]">For your team</div><p className="mt-3 text-[11px] leading-6 text-[#716A62]">Give the people doing the work one focused place to handle this part of the operation.</p></div>
        <div className="border-t border-[#CFC5B8] pt-5"><div className="text-[8px] font-semibold uppercase tracking-[.16em] text-[#9A744B]">For management</div><p className="mt-3 text-[11px] leading-6 text-[#716A62]">Keep activity, exceptions and supporting records connected instead of spread across separate tools.</p></div>
        <div className="border-t border-[#CFC5B8] pt-5"><div className="text-[8px] font-semibold uppercase tracking-[.16em] text-[#9A744B]">For growth</div><p className="mt-3 text-[11px] leading-6 text-[#716A62]">Add finance, workforce, customer, inventory, intelligence or other Avantiqo products when they become useful.</p></div>
      </div>
    </div></section>
    {product.family === "portals-external" ? <PortalProductStory product={product} /> : null}
    <section className="bg-[#EEE6DB] text-[#1D1B18]"><div className="mx-auto grid max-w-[1320px] gap-8 px-5 py-16 sm:px-7 lg:grid-cols-[1fr_auto] lg:items-center lg:px-10 lg:py-20"><div><p className="text-[8px] font-semibold uppercase tracking-[.18em] text-[#9A744B]">ONE BUSINESS. CONNECTED PRODUCTS.</p><h2 className="mt-3 text-[36px] font-medium tracking-[-.045em]">Start with {product.name}. Connect more when you need them.</h2><p className="mt-3 max-w-3xl text-[11px] leading-6 text-[#6D645B]">Your organization, people and records stay connected as you add more Avantiqo products.</p></div><a href="/products" className="inline-flex h-11 items-center rounded-full border border-black/[0.10] bg-white/62 px-5 text-[10px] font-semibold text-[#5A5148]">Explore all products</a></div></section>
  </main>;
}
