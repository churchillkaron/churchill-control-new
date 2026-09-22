import DeveloperCapabilityCatalogClient from "@/components/workspace/developer/DeveloperCapabilityCatalogClient";
import DeveloperPortalShell from "@/components/workspace/developer/DeveloperPortalShell";
import {
  developerCapabilityCatalog,
  requireDeveloperPortalAccess,
} from "@/lib/developer/DeveloperPortalRuntime";

export const dynamic = "force-dynamic";

export default async function Page({ params }) {
  const resolved = await params;
  const organizationId = String(resolved?.organizationId || "").trim();
  const access = await requireDeveloperPortalAccess({ organizationId });
  if (!access.success) return null;

  const catalog = developerCapabilityCatalog();
  return <DeveloperPortalShell organizationId={access.organizationId} externalDeveloper={access.externalDeveloper === true} permissions={access.permissions || []} role={access.role || ""} current="/capabilities">
    <section className="rounded-[24px] border border-black/[.07] bg-white p-6 md:p-8">
      <div className="text-[9px] font-semibold uppercase tracking-[.18em] text-[#A37849]">Capability catalog</div>
      <h1 className="mt-3 text-[38px] font-medium tracking-[-.045em]">Exact contracts, not marketing categories.</h1>
      <p className="mt-3 max-w-3xl text-[11px] leading-6 text-[#706960]">These are the canonical Operations capabilities currently registered in the runtime. Search by capability, command, event or boundary, then move directly into the API Explorer for live requests.</p>
    </section>
    <div className="mt-4">
      <DeveloperCapabilityCatalogClient capabilities={catalog} />
    </div>
  </DeveloperPortalShell>;
}
