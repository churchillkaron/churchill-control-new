"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Banknote, CalendarClock, LayoutDashboard } from "lucide-react";

const ITEMS = [
  {
    href: "/staff",
    label: "My Work",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    href: "/staff/requests",
    label: "Requests",
    icon: CalendarClock,
  },
  {
    href: "/staff/earnings",
    label: "Earnings",
    icon: Banknote,
  },
];

function activePath(pathname, item) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export default function StaffLayout({ children }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[#030303] text-white">
      <div className="sticky top-0 z-40 border-b border-white/10 bg-[#030303]/95 px-5 py-3 backdrop-blur-xl lg:px-10">
        <nav
          aria-label="Staff portal"
          className="mx-auto flex max-w-7xl items-center gap-2 overflow-x-auto"
        >
          {ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activePath(pathname, item);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border px-4 text-[10px] font-black uppercase tracking-[0.14em] transition ${
                  active
                    ? "border-[#D6A66A]/40 bg-[#D6A66A]/15 text-[#E7C797]"
                    : "border-white/10 bg-white/[0.035] text-white/45 hover:bg-white/[0.06] hover:text-white/70"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {children}
    </div>
  );
}
