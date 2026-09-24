import { notFound } from "next/navigation";
import PublicSiteHeader from "@/components/public/PublicSiteHeader";
import { productCatalog, PRODUCT_FAMILIES } from "@/components/public/productCatalog";
import Link from "next/link";

const apiProducts = productCatalog.filter((product) => product.api);

function resolveFamily(id) {
  const family = PRODUCT_FAMILIES.find((item) => item.id === id);
  if (!family) return null;
  const products = apiProducts.filter((product) => product.family === id);
  return products.length ? { ...family, products } : null;
}

export function generateStaticParams() {
  return PRODUCT_FAMILIES.filter((family) => apiProducts.some((product) => product.family === family.id)).map((family) => ({ family: family.id }));
}

export async function generateMetadata({ params }) {
  const { family: id } = await params;
  const family = resolveFamily(id);
  return family ? { title: `${family.label} Developer Capabilities | Avantiqo`, description: family.description } : {};
}

export default async function CapabilityFamilyPage({ params }) {
  const { family: id } = await params;
  const family = resolveFamily(id);
  if (!family) notFound();
  return <main className="min-h-screen bg-[#F7F6F3] text-[#171614]">
    <PublicSiteHeader context={family.label} audience="developers" />
    <section className="border-b border-[#BDAF9E]/30 bg-[#F3EEE5]"><div className="mx-auto max-w-[1320px] px-5 py-14 sm:px-7 lg:px-10 lg:py-20"><Link href="/developers/capabilities" className="text-[8px] font-semibold text-[#8E653D]">← Capability families</Link><p className="mt-8 text-[9px] font-semibold uppercase tracking-[.22em] text-[#9A744B]">DEVELOPER CAPABILITY FAMILY</p><h1 className="mt-4 text-[48px] font-medium leading-[.96] tracking-[-.055em] sm:text-[66px]">{family.label}</h1><p className="mt-6 max-w-3xl text-[14px] leading-7 text-[#6D655D]">{family.description}</p><div className="mt-7 text-[8px] font-semibold uppercase tracking-[.14em] text-[#9A744B]">{family.products.length} capabilities in this family</div></div></section>
    <section className="bg-[#FBFAF8]"><div className="mx-auto max-w-[1320px] px-5 py-12 sm:px-7 lg:px-10 lg:py-16"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{family.products.map((product)=><article key={product.id} className="rounded-[22px] border border-[#BDAF9E]/30 bg-white p-5"><div className="flex items-start justify-between gap-3"><div><div className="text-[7px] font-semibold uppercase tracking-[.14em] text-[#9A744B]">{product.engine}</div><h2 className="mt-2 text-[17px] font-semibold tracking-[-.025em]">{product.name}</h2></div><span className="rounded-full border border-[#D6A66A]/24 bg-[#FAF6EF] px-2.5 py-1 text-[7px] font-bold text-[#9A744B]">API</span></div><p className="mt-3 text-[9px] leading-5 text-[#746E66]">{product.summary}</p><div className="mt-5 border-t border-[#BDAF9E]/25 pt-4"><a href={product.href || `/products/${product.id}`} className="text-[8px] font-semibold text-[#8E653D]">Product context →</a></div></article>)}</div></div></section>
  </main>;
}
