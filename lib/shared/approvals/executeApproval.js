import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

import { postInvoiceToLedger }
from "@/lib/finance/accounting/postInvoiceToLedger";

// =====================================
// EXECUTE APPROVAL WORKFLOW
// =====================================

export async function executeApproval({

  tenantId,

  entityType,

  entityId,

  currentStatus,

  role,

  actedBy,

  notes,

}) {

  // -----------------------------------
  // ENTERPRISE WORKFLOW MAP
  // -----------------------------------

  const workflow = {

    pending_manager: {

      manager:
        "pending_accounting",

    },

    pending_accounting: {

      accounting:
        "pending_owner",

    },

    pending_owner: {

      owner:
        "approved",

    },

    approved: {

      accounting:
        "paid",

    },

    paid: {

      accounting:
        "locked",

    },

  };

  // -----------------------------------
  // VALIDATE TRANSITION
  // -----------------------------------

  const nextStatus =
    workflow?.[currentStatus]?.[role];

  if (!nextStatus) {

    throw new Error(
      `Invalid workflow transition:
       ${currentStatus}
       -> ${role}`
    );

  }

  // -----------------------------------
  // EXECUTE DATABASE TRANSACTION
  // -----------------------------------

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
        nextStatus,

      p_tenant_id:
        tenantId,

      p_from_status:
        currentStatus,

      p_to_status:
        nextStatus,

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

  // -----------------------------------
  // ACCOUNTING POSTING
  // -----------------------------------

  if (

    entityType === "invoice" &&

    nextStatus === "approved"

  ) {

    await postInvoiceToLedger({

      tenantId,

      invoiceId:
        entityId,

      createdBy:
        actedBy || "system",

    });

  }

  // -----------------------------------
  // RESPONSE
  // -----------------------------------

  return {

    success: true,

    previous_status:
      currentStatus,

    next_status:
      nextStatus,

  };

}