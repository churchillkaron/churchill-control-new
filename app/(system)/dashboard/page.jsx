"use client";

import Link from "next/link";

import PageWrapper from "@/components/PageWrapper";

const modules = [

  {
    title: "POS",
    href: "/pos",
    color: "from-[#8B5CF6]/20 to-[#8B5CF6]/5",
    border: "border-[#8B5CF6]/20",
  },

  {
    title: "Billing",
    href: "/billing",
    color: "from-green-500/20 to-green-500/5",
    border: "border-green-500/20",
  },

  {
    title: "Receipts",
    href: "/receipts",
    color: "from-blue-500/20 to-blue-500/5",
    border: "border-blue-500/20",
  },

  {
    title: "Inventory",
    href: "/inventory",
    color: "from-orange-500/20 to-orange-500/5",
    border: "border-orange-500/20",
  },

  {
    title: "Finance",
    href: "/finance",
    color: "from-yellow-500/20 to-yellow-500/5",
    border: "border-yellow-500/20",
  },

  {
    title: "Reports",
    href: "/reports",
    color: "from-cyan-500/20 to-cyan-500/5",
    border: "border-cyan-500/20",
  },

  {
    title: "Management",
    href: "/management",
    color: "from-pink-500/20 to-pink-500/5",
    border: "border-pink-500/20",
  },

  {
    title: "Staff",
    href: "/staff",
    color: "from-indigo-500/20 to-indigo-500/5",
    border: "border-indigo-500/20",
  },

  {
    title: "Shifts",
    href: "/shifts",
    color: "from-red-500/20 to-red-500/5",
    border: "border-red-500/20",
  },

  {
    title: "Payroll",
    href: "/payroll",
    color: "from-emerald-500/20 to-emerald-500/5",
    border: "border-emerald-500/20",
  },

  {
    title: "Payouts",
    href: "/payroll-payouts",
    color: "from-violet-500/20 to-violet-500/5",
    border: "border-violet-500/20",
  },

  {
    title: "Audit",
    href: "/audit",
    color: "from-slate-500/20 to-slate-500/5",
    border: "border-slate-500/20",
  },

  {
    title: "Settings",
    href: "/settings",
    color: "from-white/10 to-white/[0.02]",
    border: "border-white/10",
  },
];

export default function DashboardPage() {

  return (
    <div className="min-h-screen bg-[#050507]">

      <PageWrapper
        title="Churchill Control"
        subtitle="Restaurant Operating System"
      >

        <div className="grid grid-cols-4 gap-5">

          {modules.map(
            (module) => (

              <Link
                key={module.href}
                href={module.href}
                className={`group relative overflow-hidden rounded-[28px] border bg-gradient-to-br ${module.color} ${module.border} p-6 transition duration-300 hover:scale-[1.02]`}
              >

                <div className="absolute inset-0 opacity-0 transition duration-500 group-hover:opacity-100 bg-gradient-to-br from-white/[0.05] to-transparent" />

                <div className="relative z-10">

                  <div className="text-[10px] tracking-[0.28em] text-white/30">
                    MODULE
                  </div>

                  <div
                    className="mt-5 text-3xl"
                    style={{
                      fontWeight: 250,
                      letterSpacing: "-0.06em",
                    }}
                  >
                    {
                      module.title
                    }
                  </div>

                  <div className="mt-10 text-xs text-white/40">
                    OPEN SYSTEM
                  </div>

                </div>

              </Link>
            )
          )}

        </div>

      </PageWrapper>

    </div>
  );
}
