"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useOrganizationRuntime } from "@/lib/hooks/useOrganizationRuntime";

const CONTROL_AREAS = Object.freeze([
  Object.freeze({
    id: "sell",
    title: "Stationary POS",
    eyebrow: "Operations",
    description:
      "Sell products, manage active transactions, take payment, issue receipts and control the operator session.",
    route: "/operations/pos",
    action: "Open POS",
  }),
  Object.freeze({
    id: "inventory",
    title: "Inventory",
    eyebrow: "Supply Chain",
    description:
      "Review stock position, movement, availability and replenishment through the canonical inventory owner.",
    route: "/supply-chain/inventory",
    action: "Open Inventory",
  }),
  Object.freeze({
    id: "customers",
    title: "Customers",
    eyebrow: "Commercial",
    description:
      "Manage customer relationships and retail customer records without duplicating customer master data in POS.",
    route: "/commercial/customers",
    action: "Open Customers",
  }),
  Object.freeze({
    id: "revenue",
    title: "Revenue Management",
    eyebrow: "Commercial",
    description:
      "Review commercial revenue work, pricing direction and revenue activity outside transaction execution.",
    route: "/commercial/revenue",
    action: "Open Revenue",
  }),
  Object.freeze({
    id: "marketing",
    title: "Marketing",
    eyebrow: "Commercial",
    description:
      "Coordinate campaigns and customer demand while Retail Operations remains focused on execution.",
    route: "/commercial/marketing",
    action: "Open Marketing",
  }),
  Object.freeze({
    id: "finance",
    title: "Finance",
    eyebrow: "Finance",
    description:
      "Review accounting, settlement and financial control through the canonical Finance domain.",
    route: "/finance",
    action: "Open Finance",
  }),
]);

function ControlCard({
  organizationId,
  title,
  eyebrow,
  description,
  route,
  action,
}) {
  const href = `/workspace/${encodeURIComponent(organizationId)}${route}`;

  return (
    <Link
      href={href}
      className="group rounded-[24px] border border-white/10 bg-white/[0.035] p-5 transition hover:border-[#D6A66A]/45 hover:bg-[#D6A66A]/[0.06]"
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#D6A66A]">
        {eyebrow}
      </div>
      <h2 className="mt-3 text-xl font-semibold text-white">
        {title}
      </h2>
      <p className="mt-3 min-h-[72px] text-sm leading-6 text-white/45">
        {description}
      </p>
      <div className="mt-5 text-xs font-semibold text-[#E4C78F]">
        {action} →
      </div>
    </Link>
  );
}

export default function RetailOperationsControlPage() {
  const params = useParams();
  const {
    organization,
    loading,
  } = useOrganizationRuntime();
  const organizationId =
    params?.organizationId || organization?.id || "";

  if (loading) {
    return (
      <section className="mx-auto max-w-[1180px] px-4 py-12 text-white/45">
        Loading Retail Control...
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-[1180px] px-4 py-6 text-white">
      <div className="rounded-[32px] border border-white/10 bg-white/[0.025] p-5 md:p-7">
        <div className="max-w-3xl">
          <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#D6A66A]">
            Retail Operations
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
            {organization?.name || "Retail Control"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-white/45">
            Coordinate retail execution from one command workspace. Operations owns selling and transaction execution; Supply Chain owns stock; Commercial owns customers, marketing and revenue; Finance owns accounting and settlement.
          </p>
        </div>

        <div className="mt-7 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {CONTROL_AREAS.map((area) => (
            <ControlCard
              key={area.id}
              organizationId={organizationId}
              {...area}
            />
          ))}
        </div>

        <div className="mt-7 rounded-[24px] border border-[#D6A66A]/20 bg-[#D6A66A]/[0.055] p-5">
          <div className="text-sm font-semibold text-[#F2D9AA]">
            Retail boundary
          </div>
          <div className="mt-3 grid gap-3 text-sm leading-6 text-white/55 md:grid-cols-3">
            <div>
              <span className="font-semibold text-white/75">Operations:</span>{" "}
              transactions, checkout, payment, receipts, shifts and fulfillment handoff.
            </div>
            <div>
              <span className="font-semibold text-white/75">Supply Chain:</span>{" "}
              stock, movements, availability, replenishment and inventory valuation inputs.
            </div>
            <div>
              <span className="font-semibold text-white/75">Commercial and Finance:</span>{" "}
              customers, campaigns, revenue direction, accounting and settlement control.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
