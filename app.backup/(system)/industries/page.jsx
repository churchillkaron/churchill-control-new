"use client";

export const dynamic = "force-dynamic";

import {
  Building2,
  ChefHat,
  HardHat,
  HeartPulse,
  Hotel,
  ShoppingBag,
} from "lucide-react";

import PageWrapper from "@/components/PageWrapper";

const INDUSTRIES = [

  {
    name: "Restaurant",
    icon: ChefHat,
    description:
      "Hospitality dining operations and service orchestration.",

    workspaces: [

      "Floor",
      "Kitchen",
      "Expo",

    ],

    modules: [

      "POS",
      "Reservations",
      "Inventory",
      "Procurement",
      "Finance",
      "Payroll",

    ],

  },

  {
    name: "Hotel",
    icon: Hotel,
    description:
      "Hospitality operations, guest management and accommodation workflows.",

    workspaces: [

      "Front Desk",
      "Housekeeping",
      "Maintenance",
      "Concierge",

    ],

    modules: [

      "POS",
      "Reservations",
      "CRM",
      "Finance",
      "Payroll",

    ],

  },

  {
    name: "Retail",
    icon: ShoppingBag,
    description:
      "Retail stores, warehouse operations and customer sales flows.",

    workspaces: [

      "Stores",
      "Warehouse",
      "Pricing",
      "Loyalty",

    ],

    modules: [

      "POS",
      "Inventory",
      "CRM",
      "Finance",
      "Analytics",

    ],

  },

  {
    name: "Construction",
    icon: HardHat,
    description:
      "Construction project operations, BOQ and site management.",

    workspaces: [

      "BOQ",
      "Site Operations",
      "Materials",
      "Equipment",
      "Subcontractors",
      "Project Billing",

    ],

    modules: [

      "Projects",
      "Inventory",
      "Procurement",
      "Finance",
      "Payroll",

    ],

  },

  {
    name: "Healthcare",
    icon: HeartPulse,
    description:
      "Healthcare operations, appointments and patient workflows.",

    workspaces: [

      "Reception",
      "Appointments",
      "Patient Flow",
      "Treatment Rooms",

    ],

    modules: [

      "Reservations",
      "CRM",
      "Finance",
      "Payroll",
      "Analytics",

    ],

  },

];

export default function IndustriesPage() {

  return (

    <PageWrapper
      title="Industries"
      subtitle="Operational environments built on Churchill Core"
    >

      <div className="grid grid-cols-2 gap-8">

        {INDUSTRIES.map(
          industry => {

            const Icon =
              industry.icon;

            return (

              <div
                key={
                  industry.name
                }
                className="rounded-[36px] border border-white/10 bg-white/[0.03] p-8"
              >

                <div className="mb-8 flex items-center justify-between">

                  <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-violet-500/10">

                    <Icon className="h-8 w-8 text-violet-400" />

                  </div>

                  <div className="rounded-full border border-violet-500/20 bg-violet-500/10 px-4 py-2 text-[10px] uppercase tracking-[0.25em] text-violet-400">

                    Industry

                  </div>

                </div>

                <div className="mb-3 text-4xl font-light text-white">

                  {industry.name}

                </div>

                <div className="mb-8 leading-relaxed text-white/50">

                  {industry.description}

                </div>

                {/* WORKSPACES */}

                <div className="mb-6">

                  <div className="mb-3 text-xs uppercase tracking-[0.25em] text-violet-400">

                    Operational Workspaces

                  </div>

                  <div className="flex flex-wrap gap-2">

                    {industry.workspaces.map(
                      workspace => (

                        <div
                          key={workspace}
                          className="rounded-full border border-white/10 bg-black/30 px-4 py-2 text-sm text-white/70"
                        >

                          {workspace}

                        </div>

                      )
                    )}

                  </div>

                </div>

                {/* MODULES */}

                <div>

                  <div className="mb-3 text-xs uppercase tracking-[0.25em] text-emerald-400">

                    Recommended Modules

                  </div>

                  <div className="flex flex-wrap gap-2">

                    {industry.modules.map(
                      module => (

                        <div
                          key={module}
                          className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300"
                        >

                          {module}

                        </div>

                      )
                    )}

                  </div>

                </div>

              </div>

            );

          }
        )}

      </div>

      <div className="mt-10 rounded-[36px] border border-white/10 bg-black/30 p-8">

        <div className="mb-4 flex items-center gap-3">

          <Building2 className="h-6 w-6 text-violet-400" />

          <div className="text-2xl font-light">

            Churchill Core Architecture

          </div>

        </div>

        <div className="leading-relaxed text-white/60">

          Industries define operational workflows and environments.

          Modules define shared business capabilities.

          Churchill dynamically combines industries, workspaces and modules
          into enterprise operating systems tailored for each business.

        </div>

      </div>

    </PageWrapper>

  );

}
