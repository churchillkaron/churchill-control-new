import PublicSiteHeader from "@/components/public/PublicSiteHeader";
import ProductFinder from "@/components/public/ProductControlIndex";
import { productCatalog } from "@/components/public/productCatalog";
import { CUSTOMER_GROUPS, isCustomerProduct } from "@/components/public/customerProductGroups";

export const metadata = {
  title: "All Products | Avantiqo",
  description: "Search the complete Avantiqo customer product catalog by business need, team, industry or product name.",
};

const customerProducts = productCatalog.filter(isCustomerProduct);

export default async function AllProductsPage({ searchParams }) {
  const params = await searchParams;
  const initialGroup = typeof params?.group === "string" ? params.group : "all";
  return <main className="min-h-screen bg-[#F7F6F3] text-[#171614]">
    <PublicSiteHeader context="All Products" audience="business" tone="light" />
    <section className="border-b border-[#CFC5B8]/45 bg-[#F3EEE5]">
      <div className="mx-auto max-w-[1320px] px-5 py-14 sm:px-7 lg:px-10 lg:py-20">
        <div className="max-w-4xl">
          <p className="text-[9px] font-semibold uppercase tracking-[.22em] text-[#9A744B]">AVANTIQO PRODUCT CATALOG</p>
          <h1 className="mt-4 text-[48px] font-medium leading-[.96] tracking-[-.055em] sm:text-[66px]">Find the exact product when you need the full catalog.</h1>
          <p className="mt-6 max-w-3xl text-[14px] leading-7 text-[#6D655D]">Search every customer-facing Avantiqo product by job, team, industry or name. If you are still deciding where to start, use the simpler Products page first.</p>
          <a href="/products" className="mt-7 inline-flex text-[9px] font-semibold text-[#815B36]">← Back to Products</a>
        </div>
      </div>
    </section>
    <ProductFinder products={customerProducts} groups={CUSTOMER_GROUPS} initialGroup={initialGroup} />
  </main>;
}
