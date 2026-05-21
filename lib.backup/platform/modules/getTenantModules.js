import {
  loadTenantRuntime,
} from "@/lib/platform/runtime/loadTenantRuntime";

export async function getTenantModules(
  tenant
) {

  if (!tenant?.id) {

    return [];

  }

  const runtime =
    await loadTenantRuntime(
      tenant.id
    );

  if (!runtime) {

    return [];

  }

  return runtime.modules.map(
    module =>

      module.module_key
  );

}
