"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavBar() {
  const pathname = usePathname();

  const linkClass = (path) =>
    `px-4 py-2 rounded-lg text-white ${
      pathname === path ? "bg-white/20" : "bg-transparent"
    }`;

  return (
    <div className="w-full bg-black border-b border-white/10">
      <div className="flex items-center gap-4 px-6 py-4">
        <div className="text-white font-semibold text-lg">
          Churchill Control System
        </div>

        <Link href="/" className={linkClass("/")}>
          Home
        </Link>

        <Link href="/control-final" className={linkClass("/control-final")}>
          Control
        </Link>

        <Link href="/dashboard" className={linkClass("/dashboard")}>
          Dashboard
        </Link>

        <Link href="/pos-control" className={linkClass("/pos-control")}>
          POS
        </Link>

        <Link href="/history" className={linkClass("/history")}>
          History
        </Link>

        <Link href="/accounting" className={linkClass("/accounting")}>
          Accounting
        </Link>

        <Link href="/payout" className={linkClass("/payout")}>
          Payout
        </Link>
      </div>
    </div>
  );
}