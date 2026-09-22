"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import PublicSiteHeader from "@/components/public/PublicSiteHeader";

const ITEMS = [
  ["Home", "/supplier-portal"],
  ["Customers", "/supplier-portal/customers"],
  ["Orders", "/supplier-portal/orders"],
  ["Catalog", "/supplier-portal/catalog"],
  ["Storefront", "/supplier-portal/storefront"],
  ["Documents", "/supplier-portal/documents"],
  ["Payments", "/supplier-portal/payments"],
  ["Setup", "/supplier-portal/onboarding"],
  ["Settings", "/supplier-portal/settings"],
];

function active(pathname, href) {
  return href === "/supplier-portal"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

export default function SupplierPortalShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const currentHref = ITEMS.find(([, href]) => active(pathname, href))?.[1] || "/supplier-portal";
  return <main className="min-h-screen bg-[#F7F3EC] text-[#171614]">
    <PublicSiteHeader
      context="Supplier Portal"
      audience="platform"
      tone="light"
      action={{ label: "Supplier Account", href: "/supplier-portal/settings" }}
    />
    <div className="border-b border-black/[.07] bg-white/45">
      <div className="mx-auto max-w-[1320px] px-5 py-2 sm:hidden">
        <label className="block">
          <span className="sr-only">Supplier portal section</span>
          <select
            aria-label="Supplier portal section"
            value={currentHref}
            onChange={(event) => router.push(event.target.value)}
            className="h-11 w-full rounded-xl border border-black/[.08] bg-white px-3 text-[10px] font-semibold text-[#3F3933] outline-none"
          >
            {ITEMS.map(([label, href]) => <option key={href} value={href}>{label}</option>)}
          </select>
        </label>
      </div>
      <nav className="mx-auto hidden max-w-[1320px] gap-1 px-7 py-2 sm:flex lg:px-10">
        {ITEMS.map(([label, href]) => <Link
          key={href}
          href={href}
          className={`whitespace-nowrap rounded-lg px-3 py-2 text-[9px] font-semibold transition ${active(pathname, href) ? "bg-[#1D1A17] text-white" : "text-[#72685F] hover:bg-[#EFE7DC] hover:text-[#2B2621]"}`}
        >{label}</Link>)}
      </nav>
    </div>
    {children}
  </main>;
}
