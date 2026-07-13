/**
 * HUMAN-IN-THE-LOOP APPROVAL SYSTEM
 * Final safety layer for autonomous execution
 */

import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";


export async function pushToApprovalQueue({

  organizationId,

  executionPlan = {},

  decisions = [],

  actions = [],

}) {


  const items = [

    ...(executionPlan?.executionPlan || []),

    ...(actions || []),

  ];


  const queued = [];


  for (
    const item
    of items
  ) {


    const requiresApproval =

      item.mode ===
        "approval_required"

      ||

      item.status ===
        "PENDING_APPROVAL"

      ||

      item.action?.requiresApproval === true;



    if (!requiresApproval) {

      continue;

    }



    const {
      data,
      error,
    } =
      await supabaseAdmin
        .from("ai_approval_queue")
        .insert({

          organization_id:
            organizationId,

          type:
            item.issue ||
            item.type ||
            "AI_ACTION",

          payload:
            item,

          status:
            "pending",

          priority:
            item.severity ||
            item.urgency ||
            "medium",

          created_at:
            new Date()
            .toISOString(),

        })
        .select()
        .single();



    if (!error) {

      queued.push(data);

    }

  }


  return {

    queued,

    count:
      queued.length,

  };

}
