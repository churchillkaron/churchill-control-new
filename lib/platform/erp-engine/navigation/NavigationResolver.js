import {
  ERP_REGISTRY,
} from "@/lib/platform/registry/erpRegistry";

export function resolveNavigation(domain){

  return (

    ERP_REGISTRY
      ?.domains
      ?.find(
        d=>d.id===domain
      )

      ?.workspaces

      ||

      []

  );

}
