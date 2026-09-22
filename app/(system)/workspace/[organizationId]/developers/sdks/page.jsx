import DeveloperPortalShell from "@/components/workspace/developer/DeveloperPortalShell";
import { developerCapabilityCatalog, requireDeveloperPortalAccess } from "@/lib/developer/DeveloperPortalRuntime";

export const dynamic = "force-dynamic";

export default async function Page({ params }) {
  const resolved = await params;
  const access = await requireDeveloperPortalAccess({ organizationId: resolved?.organizationId });
  if (!access.success) return null;
  const count = developerCapabilityCatalog().length;
  const q = "?organization_id=" + encodeURIComponent(access.organizationId);

  return <DeveloperPortalShell organizationId={access.organizationId} externalDeveloper={access.externalDeveloper === true} permissions={access.permissions || []} role={access.role || ""} current="/sdks">
    <section className="rounded-[22px] border border-black/[.07] bg-white p-6">
      <div className="text-[9px] font-semibold uppercase tracking-[.18em] text-[#A37849]">SDKs & contracts</div>
      <h1 className="mt-3 text-[38px] font-medium tracking-[-.045em]">Generated from the live registry.</h1>
      <p className="mt-3 max-w-3xl text-[11px] leading-6 text-[#706960]">Every download is generated from the same canonical capability catalog used by the runtime. No hand-maintained list can silently drift from production. Downloads carry the canonical API version, an exact SHA-256 contract checksum and an ETag so CI can pin and verify the artifact it consumed.</p>
      <div className="mt-5 rounded-xl border border-[#B7793B]/16 bg-[#FBF6EF] p-4 text-[8px] leading-5 text-[#76502E]"><span className="font-semibold">Recommended workflow:</span> use OpenAPI when another generator or gateway needs the contract, TypeScript for JavaScript/Node applications, and Python for Python services. Pin the checksum or ETag in CI so a contract change is visible during deployment instead of after runtime failure.</div>
      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <a href={"/api/developers/sdk" + q + "&language=typescript"} className="rounded-xl border border-black/[.07] bg-[#F7F2EA] p-5 transition hover:border-[#B7793B]/35"><div className="text-[12px] font-semibold">TypeScript client</div><div className="mt-2 text-[9px] leading-5 text-[#776F67]">Typed capability IDs, bearer auth, list/read and command execution helpers.</div><div className="mt-5 text-[9px] font-semibold text-[#76502E]">Download avantiqo.ts →</div></a>
        <a href={"/api/developers/sdk" + q + "&language=python"} className="rounded-xl border border-black/[.07] bg-[#F7F2EA] p-5 transition hover:border-[#B7793B]/35"><div className="text-[12px] font-semibold">Python client</div><div className="mt-2 text-[9px] leading-5 text-[#776F67]">Typed capability literals, bearer auth and canonical request handling.</div><div className="mt-5 text-[9px] font-semibold text-[#76502E]">Download avantiqo.py →</div></a>
        <a href={"/api/developers/contracts/openapi" + q} className="rounded-xl border border-black/[.07] bg-[#F7F2EA] p-5 transition hover:border-[#B7793B]/35"><div className="text-[12px] font-semibold">OpenAPI 3.1</div><div className="mt-2 text-[9px] leading-5 text-[#776F67]">{count} current operations capabilities exported as machine-readable paths.</div><div className="mt-5 text-[9px] font-semibold text-[#76502E]">Download OpenAPI →</div></a>
      </div>
    </section>
  </DeveloperPortalShell>;
}
