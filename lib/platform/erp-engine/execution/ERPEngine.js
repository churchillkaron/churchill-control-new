import { createERPContext } from "../runtime/ERPContext";
import { resolveERP } from "../resolvers/ERPResolver";

export async function executeERP({

  workspace,

  capability,

  organization_id,

  entity_id,

  period_id,

  user,

}) {

  const context =
    createERPContext({

      workspace,

      organization_id,

      entity_id,

      period_id,

      user,

    });

  const resolved =
    resolveERP({

      workspace,

      capability,

    });

  if(!resolved){

    return {

      success:false,

      error:"Capability not registered.",

    };

  }

  return {

    success:true,

    context,

    ...resolved,

  };

}
