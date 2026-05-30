"use client";

import {
  Wallet,
  Receipt,
  TrendingUp,
  MinusCircle,
  CheckCircle2,
  Clock3,
} from "lucide-react";

export default function PortalPayrollPage() {
  const rows = [
    {
      label: "Base Salary",
      value: "฿0",
      icon: Wallet,
      tone: "text-cyan-300",
    },
    {
      label: "Service Charge",
      value: "฿0",
      icon: TrendingUp,
      tone: "text-emerald-300",
    },
    {
      label: "Bonuses",
      value: "฿0",
      icon: CheckCircle2,
      tone: "text-fuchsia-300",
    },
    {
      label: "Deductions",
      value: "฿0",
      icon: MinusCircle,
      tone: "text-orange-300",
    },
  ];

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[38px] border border-white/10 bg-white/[0.06] shadow-[0_0_70px_rgba(34,211,238,0.12)] backdrop-blur-3xl">
        <div className="h-[2px] bg-gradient-to-r from-emerald-500 via-cyan-400 to-fuchsia-500" />

        <div className="p-5">
          <div className="text-[10px] uppercase tracking-[0.35em] text-emerald-300">
            Workforce Payroll
          </div>

          <div className="mt-3 text-4xl font-black">
            My Payroll
          </div>

          <div className="mt-2 text-sm text-white/45">
            Salary, service charge, bonuses, deductions and payment confirmation.
          </div>

          <div className="mt-5 rounded-[30px] border border-emerald-500/20 bg-emerald-500/10 p-4">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-emerald-300">
              <Receipt className="h-4 w-4" />
              Current Month
            </div>

            <div className="mt-3 text-4xl font-black">
              ฿0
            </div>

            <div className="mt-1 text-sm text-white/45">
              Estimated payroll before final approval
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        {rows.map((item) => {
          const Icon = item.icon;

          return (
            <div
              key={item.label}
              className="rounded-[30px] border border-white/10 bg-white/[0.05] p-4 backdrop-blur-3xl"
            >
              <div className={`flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] ${item.tone}`}>
                <Icon className="h-4 w-4" />
                {item.label}
              </div>

              <div className="mt-4 text-2xl font-black">
                {item.value}
              </div>
            </div>
          );
        })}
      </section>

      <section className="rounded-[34px] border border-white/10 bg-white/[0.05] p-5 backdrop-blur-3xl">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-white text-black">
            <Clock3 className="h-5 w-5" />
          </div>

          <div>
            <div className="font-black">
              Payroll Status
            </div>

            <div className="mt-1 text-sm text-white/45">
              Awaiting monthly payroll close and manager approval.
            </div>
          </div>
        </div>

        <button className="mt-5 flex h-14 w-full items-center justify-center rounded-[24px] border border-white/10 bg-white/[0.06] text-sm font-black uppercase tracking-[0.2em] text-white">
          No confirmation required yet
        </button>
      </section>
    </div>
  );
}
