import Link from "next/link";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

export const dynamic = "force-dynamic";

const DEVELOPER_ROLES = new Set(["OWNER", "ORGANIZATION_OWNER", "ORG_OWNER", "PLATFORM_OWNER", "SUPER_ADMIN", "ADMIN", "DEVELOPER", "INTEGRATOR", "PARTNER"]);

const sections = [
  ["Capabilities", "Browse business and creative capabilities available to software and integrations.", "/developers/capabilities"],
  ["API Platform", "Work with Avantiqo through scoped APIs and exact organization context.", "/api-platform"],
  ["Integrations", "Connect messaging, payments, marketing, commerce and external systems.", "/integrations"],
  ["Compute", "Use Avantiqo compute for AI, media and software workloads.", "/compute"],
];

export default async function DeveloperWorkspacePage({ params }) {
  const organizationId = String(params?.organizationId || "").trim();
  const access = await requireOrganizationAccess({ organizationId }).catch(() => ({ success: false }));
  const role = String(access?.role || "").trim().toUpperCase();

  if (!access?.success || !DEVELOPER_ROLES.has(role)) {
    return <div className="mx-auto max-w-3xl rounded-[26px] border border-black/[.08] bg-white p-7 text-[#1B1A18]"><div className="text-[10px] font-semibold uppercase tracking-[.18em] text-[#A37849]">Developer access required</div><h1 className="mt-3 text-2xl font-semibold">This developer workspace is not enabled for your account.</h1><p className="mt-3 text-[12px] leading-6 text-[#6F6B64]">Use your Business workspace, or ask an organization owner to enable developer access.</p></div>;
  }
  return <div className="mx-auto max-w-[1380px] px-1 py-2 text-[#1A1917]">
    <section className="overflow-hidden rounded-[28px] border border-black/[.07] bg-[#171614] px-7 py-9 text-white md:px-10 md:py-12">
      <div className="text-[9px] font-semibold uppercase tracking-[.2em] text-[#D6A66A]">Developer workspace</div>
      <div className="mt-4 grid gap-8 lg:grid-cols-[1.15fr_.85fr] lg:items-end">
        <div><h1 className="max-w-4xl text-[46px] font-medium leading-[.98] tracking-[-.055em] md:text-[62px]">Build with Avantiqo.</h1><p className="mt-5 max-w-2xl text-[13px] leading-7 text-white/55">APIs, capabilities, integrations and compute for applications that need to work with Avantiqo.</p></div>
        <div className="lg:justify-self-end"><Link href={`/workspace/${organizationId}`} className="text-[10px] font-semibold text-[#E9C898]">Switch to Business workspace →</Link></div>
      </div>
    </section>

    <section className="mt-6 grid gap-4 md:grid-cols-2">
      {sections.map(([title, copy, href]) => <Link key={title} href={href} className="group rounded-[22px] border border-black/[.07] bg-white p-6 transition hover:border-[#D6A66A]/45">
        <div className="text-[9px] font-semibold uppercase tracking-[.16em] text-[#A37849]">{title}</div>
        <p className="mt-3 max-w-lg text-[12px] leading-6 text-[#6C665F]">{copy}</p>
        <div className="mt-6 text-[10px] font-semibold text-[#76502E]">Open {title} →</div>
      </Link>)}
    </section>
  </div>;
}
