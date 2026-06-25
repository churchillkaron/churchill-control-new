'use client';

import { useOrganizationRuntime } from '@/lib/hooks/useOrganizationRuntime';
import { getWorkspaceComponent } from '@/lib/workspace/runtime/getWorkspaceComponent';

const ROUTE_MODULES = {
  finance: true,
  accounting: true,
  procurement: true,
  ap: true,
  ar: true,
  payments: true,
  reports: true,
  tax: true,
  filings: true,
  close: true,
};

export default function OrganizationModulePage({ params }) {
  const { runtime, loading, modules } = useOrganizationRuntime();

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white p-10">
        Loading module...
      </div>
    );
  }

  const moduleId =
    String(params?.moduleId || "").toLowerCase();

  const organizationId =
    params?.organizationId;

  if (ROUTE_MODULES[moduleId]) {
    if (typeof window !== "undefined") {
      const route =
        moduleId === "procurement"
          ? `/workspace/${organizationId}/finance/procure-to-pay`
          : moduleId === "accounting"
            ? `/workspace/${organizationId}/finance/accounting`
            : moduleId === "finance"
              ? `/workspace/${organizationId}/finance`
              : `/workspace/${organizationId}/finance/${moduleId}`;

      window.location.replace(route);
    }

    return (
      <div className="min-h-screen bg-black text-white p-10">
        Opening module...
      </div>
    );
  }

  const availableModules =
    modules ||
    runtime?.modules ||
    [];

  const module = availableModules.find(
    (m) =>
      String(m.id || m.module_id || "").toLowerCase() ===
      moduleId
  );

  if (!module) {
    return (
      <div className="min-h-screen bg-black text-white p-10">
        Module not found
      </div>
    );
  }

  const ModuleComponent =
    getWorkspaceComponent(module.id || module.module_id);

  if (!ModuleComponent) {
    return (
      <div className="min-h-screen bg-[#030712] text-white p-10">
        <h1 className="text-3xl font-light">
          {module.name || moduleId}
        </h1>
        <p className="text-white/40 mt-4">
          Runtime not implemented yet
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#030712] text-white">
      <ModuleComponent />
    </div>
  );
}
