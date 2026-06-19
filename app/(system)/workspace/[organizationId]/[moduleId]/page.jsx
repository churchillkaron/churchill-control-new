'use client';

import { useOrganizationRuntime } from '@/lib/hooks/useOrganizationRuntime';
import { getWorkspaceComponent } from '@/lib/workspace/runtime/getWorkspaceComponent';

export default function OrganizationModulePage({ params }) {

  const { runtime, loading, modules } = useOrganizationRuntime();

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white p-10">
        Loading module...
      </div>
    );
  }

  const availableModules =
    modules ||
    runtime?.modules ||
    [];

  console.log("AVAILABLE MODULES", availableModules);
console.log("MODULE IDS", availableModules.map(m => m.id));

const module = availableModules.find(
    (m) => m.id === params.moduleId
  );

  if (!module) {
    return (
      <div className="min-h-screen bg-black text-white p-10">
        Module not found
      </div>
    );
  }

  const ModuleComponent = getWorkspaceComponent(module.id);

  if (!ModuleComponent) {
    return (
      <div className="min-h-screen bg-[#030712] text-white p-10">
        <h1 className="text-3xl font-light">{module.name}</h1>
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
