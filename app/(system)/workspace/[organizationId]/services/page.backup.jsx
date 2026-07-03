import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";
import WorkspaceModuleGrid from "@/components/workspace/WorkspaceModuleGrid";
import { getPlatformServicesMeta } from "@/lib/platform/registry/erpRegistry";

export default function PlatformServicesPage() {
  const workspace = getPlatformServicesMeta();

  return (
    <div className="space-y-6">
      <WorkspaceHeader
        title={workspace?.title || "Platform Services"}
        description={
          workspace?.description ||
          "Wallet, budgets, usage, billing, providers, pricing policies, health and logs."
        }
      />

      <section className="rounded-3xl border border-white/10 bg-white/[0.025] p-6">
        <div className="text-[11px] uppercase tracking-[0.28em] text-[#D6A66A]">
          Prepaid Platform Wallet
        </div>

        <h1 className="mt-3 text-3xl font-light text-white">
          One wallet for AI, Meta, Google, WhatsApp, OCR, storage and external services.
        </h1>

        <p className="mt-3 max-w-4xl text-sm font-light leading-6 text-white/55">
          Customers fund their Avantiqo wallet first. Every external service call is authorized,
          priced, logged and deducted before execution. When available funds or budgets are exhausted,
          paid services stop automatically.
        </p>
      </section>

      <WorkspaceModuleGrid groups={workspace?.groups || []} />
    </div>
  );
}
