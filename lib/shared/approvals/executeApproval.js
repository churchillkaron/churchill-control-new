import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

import { processApproval }
from "./processApproval";

export async function executeApproval({

  tenantId,

  entityType,

  entityId,

  currentStatus,

  role,

  actedBy,

  notes,

}) {

  // 1. calculate workflow

  const approval =
    processApproval({

      type: entityType,

      currentStatus,

      role,

    });

  // 2. execute transaction

  const {
    error,
  } = await supabaseAdmin.rpc(

    "execute_approval",

    {

      p_entity_type:
        entityType,

      p_entity_id:
        entityId,

      p_next_status:
        approval.next_status,

      p_tenant_id:
        tenantId,

      p_from_status:
        approval.previous_status,

      p_to_status:
        approval.next_status,

      p_acted_by:
        actedBy,

      p_role:
        role,

      p_notes:
        notes || null,

    }

  );

  if (error) {

    throw error;

  }

  return {

    success: true,

    previous_status:
      approval.previous_status,

    next_status:
      approval.next_status,

  };

}