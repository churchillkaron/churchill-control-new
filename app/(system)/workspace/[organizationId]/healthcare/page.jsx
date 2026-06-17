"use client";

import Link from "next/link";
import { useOrganization } from "@/app/providers/OrganizationProvider";

const modules = [
  { name: "Dashboard", href: "dashboard" },
  { name: "Patients", href: "patients" },
  { name: "Appointments", href: "appointments" },
  { name: "Admissions", href: "admissions" },
  { name: "Medical Records", href: "medical-records" },
  { name: "Staff", href: "staff" },
  { name: "Pharmacy", href: "pharmacy" },
  { name: "Laboratory", href: "laboratory" },
  { name: "Radiology", href: "radiology" },
  { name: "Emergency", href: "emergency" },
  { name: "Billing", href: "billing" },
  { name: "Insurance", href: "insurance" },
  { name: "Wards", href: "wards" },
  { name: "Beds", href: "beds" },
  { name: "Analytics", href: "analytics" }
];

export default function HealthcarePage() {
  const { organization } = useOrganization();

  return (
    <div className="p-8">
      <h1 className="text-4xl font-bold mb-2">
        Healthcare
      </h1>

      <p className="text-zinc-400 mb-8">
        {organization?.name}
      </p>

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        {modules.map((module) => (
          <Link
            key={module.href}
            href={organization?.id ? `/workspace/${organization.id}/healthcare/${module.href}` : "#"}
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 hover:bg-white/[0.06] transition"
          >
            <div className="text-lg font-semibold">
              {module.name}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
