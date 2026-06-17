import {
  getServerCurrentUser,
} from "@/lib/auth/getServerCurrentUser";

import {
  getOrganizationWorkspace,
} from "@/lib/organizations/getOrganizationWorkspace";

import {
  getWorkspaceComponent,
} from "@/lib/workspace/runtime/getWorkspaceComponent";

export default async function OrganizationModulePage({
  params,
}) {

  const user =
    await getServerCurrentUser();

  if (!user?.email) {

    return (
      <main className="min-h-screen bg-black p-10 text-white">
        Unauthorized
      </main>
    );

  }

  const runtime =
    await getOrganizationWorkspace({

      userEmail:
        user.email,

      organizationId:
        params.organizationId,

    });

  if (
    !runtime ||
    runtime.success === false
  ) {

    return (
      <main className="min-h-screen bg-black p-10 text-white">
        Runtime not found
      </main>
    );

  }

  const module =
    (runtime.modules || []).find(
      (module) =>
        module.id ===
        params.moduleId
    );

  if (!module) {

    return (
      <main className="min-h-screen bg-black p-10 text-white">
        Module not found
      </main>
    );

  }

  const ModuleComponent =
    getWorkspaceComponent(
      module.id
    );

  if (!ModuleComponent) {

    return (
      <main className="min-h-screen bg-[#030712] p-10 text-white">

        <div className="mx-auto max-w-5xl">

          <p className="text-xs tracking-[0.3em] text-[#8B5CF6]">
            MODULE RUNTIME
          </p>

          <h1 className="mt-4 text-5xl font-light">
            {module.name}
          </h1>

          <p className="mt-4 text-white/40">
            Runtime component not implemented yet
          </p>

        </div>

      </main>
    );

  }

  return (
    <main className="min-h-screen bg-[#030712] text-white">
      <ModuleComponent />
    </main>
  );

}
