import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";


export async function resolveTemplate({

  organizationId,

  documentType,

}) {


  /*
    Priority:

    1. Design Studio document design

    2. Organization template

    3. Avantiqo system template

       organization_id = null
  */


  if (organizationId) {


    const {
      data: creativeAssets,
    } =
      await supabaseAdmin
        .from("creative_assets")
        .select("*")
        .eq(
          "organization_id",
          organizationId
        )
        .eq(
          "asset_type",
          "DOCUMENT_DESIGN"
        )
        .eq(
          "archived",
          false
        )
        .order(
          "created_at",
          {
            ascending:false,
          }
        );


    const creativeTemplate =
      (creativeAssets || [])
        .find(asset =>
          asset.metadata
            ?.document_types
            ?.includes(documentType)
        );


    if(creativeTemplate){

      return {

        id:
          creativeTemplate.id,

        source:
          "creative_asset",

        name:
          creativeTemplate.name,

        template:
          creativeTemplate.metadata,

        layout:
          creativeTemplate.metadata,

        asset:
          creativeTemplate,

      };

    }


    const {
      data: organizationTemplate,
      error: organizationError,
    } =
      await supabaseAdmin
        .from("document_templates")
        .select("*")
        .eq(
          "organization_id",
          organizationId
        )
        .eq(
          "document_type",
          documentType
        )
        .eq(
          "status",
          "active"
        )
        .order(
          "version",
          {
            ascending:false,
          }
        )
        .limit(1)
        .maybeSingle();


    if(
      !organizationError &&
      organizationTemplate
    ){

      
console.log(
  "DOCUMENT TEMPLATE SOURCE",
  {
    source:"organization",
    name:organizationTemplate.name,
    organizationId
  }
);

return organizationTemplate;


    }

  }


  const {
    data: systemTemplate,
    error: systemError,
  } =
    await supabaseAdmin
      .from("document_templates")
      .select("*")
      .is(
        "organization_id",
        null
      )
      .eq(
        "document_type",
        documentType
      )
      .eq(
        "status",
        "active"
      )
      .order(
        "version",
        {
          ascending:false,
        }
      )
      .limit(1)
      .maybeSingle();


  if(
    systemError ||
    !systemTemplate
  ){

    return null;

  }


  
console.log(
  "DOCUMENT TEMPLATE SOURCE",
  {
    source:"system",
    name:systemTemplate.name,
    documentType
  }
);

return systemTemplate;


}
