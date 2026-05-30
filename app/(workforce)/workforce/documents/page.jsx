"use client";

import {
  FileText,
  Receipt,
  Shield,
  Award,
  FileCheck,
  ChevronRight,
} from "lucide-react";

export default function DocumentsPage() {
  const sections = [
    {
      title: "Payslips",
      description: "Salary statements and payment history",
      icon: Receipt,
      count: 0,
    },
    {
      title: "Contracts",
      description: "Employment agreements",
      icon: FileCheck,
      count: 0,
    },
    {
      title: "HR Documents",
      description: "Personal employee records",
      icon: FileText,
      count: 0,
    },
    {
      title: "Policies",
      description: "Company rules and procedures",
      icon: Shield,
      count: 0,
    },
    {
      title: "Certificates",
      description: "Training and compliance records",
      icon: Award,
      count: 0,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-[36px] border border-white/10 bg-white/[0.05] p-5 backdrop-blur-3xl">
        <div className="text-[10px] uppercase tracking-[0.35em] text-cyan-300">
          Workforce Documents
        </div>

        <div className="mt-3 text-4xl font-black text-white">
          Documents
        </div>

        <div className="mt-2 text-sm text-white/45">
          Everything related to employment, payroll and compliance.
        </div>
      </div>

      {sections.map((item) => {
        const Icon = item.icon;

        return (
          <button
            key={item.title}
            className="w-full rounded-[30px] border border-white/10 bg-white/[0.05] p-4 text-left backdrop-blur-3xl"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-white text-black">
                  <Icon className="h-5 w-5" />
                </div>

                <div>
                  <div className="text-lg font-black">
                    {item.title}
                  </div>

                  <div className="mt-1 text-sm text-white/45">
                    {item.description}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="rounded-full border border-white/10 px-3 py-1 text-xs">
                  {item.count}
                </div>

                <ChevronRight className="h-5 w-5 text-white/35" />
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
