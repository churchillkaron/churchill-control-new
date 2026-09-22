"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  return <main className="min-h-screen bg-[#F7F3EC] text-[#171614]">
    <PublicSiteHeader
      context="Supplier Portal"
      audience="platform"
      tone="light"
      action={{ label: "Supplier Account", href: "/supplier-portal/settings" }}
    />
    <div className="border-b border-black/[.07] bg-white/45">
      <nav className="mx-auto flex max-w-[1320px] gap-1 overflow-x-auto px-5 py-2 sm:px-7 lg:px-10">
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
