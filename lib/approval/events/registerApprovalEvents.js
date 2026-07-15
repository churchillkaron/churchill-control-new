import {
  registerEvent,
} from "@/lib/shared/events/eventBus";


import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";


import {
  createPurchaseOrder,
} from "@/lib/inventory/procurement/purchase-orders/createPurchaseOrder";



registerEvent(

  "APPROVAL_GRANTED",

  async payload => {


    if (process.env.NODE_ENV !== "production") console.log(
      "[APPROVAL_GRANTED]",
      payload.referenceTable
    );


    let purchaseOrder = null;


    if (
      payload.referenceTable ===
      "purchase_requests"
    ) {


      const {
        data: request,
        error,
      } =
        await supabaseAdmin
          .from("purchase_requests")
          .select("*")
          .eq(
            "id",
            payload.referenceId
          )
          .single();


      if (error) {
        throw error;
      }


      purchaseOrder =
        await createPurchaseOrder({

          organizationId:
            request.organization_id,


          entityId:
            request.entity_id,


          supplier_party_id:
            request.supplier_party_id,


          items: [

            {
              item_id:
                request.item_id,

              item_name:
                request.title,

              quantity:
                request.quantity ||
                1,

              unit_price:
                request.estimated_cost ||
                0,

            }

          ],


          ordered_by:
            "APPROVAL_SYSTEM",

        });

    }


    return {

      success: true,

      approved: true,

      purchaseOrder,

    };

  }

);



registerEvent(

  "APPROVAL_REJECTED",

  async payload => {


    if (process.env.NODE_ENV !== "production") console.log(
      "[APPROVAL_REJECTED]",
      payload.referenceTable
    );


    return {

      success: true,

      rejected: true,

    };

  }

);
