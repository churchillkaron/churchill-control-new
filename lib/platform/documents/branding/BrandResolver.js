import {
  CreativeBrandRuntime,
} from "@/lib/creative/brand/runtime/CreativeBrandRuntime";

import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

import {
  resolveEntity,
} from "@/lib/platform/entities/resolveEntity";


export async function resolveBrand({

  organizationId,

  entityId,

}) {


  if (!organizationId) {

    return {};

  }


  const brands =
    await CreativeBrandRuntime.list({

      organization_id:
        organizationId,

    });


  const creativeBrand =
    brands?.[0] || null;


  const entity =
    await resolveEntity({

      organizationId,

      entityId,

    });


  const {
    data: paymentConfig,
  } =
    await supabaseAdmin
      .from("organization_payment_config")
      .select(`
        payment_method,
        configuration
      `)
      .eq(
        "organization_id",
        organizationId
      )
      .eq(
        "payment_method",
        "bank_transfer"
      )
      .eq(
        "enabled",
        true
      )
      .maybeSingle();


  let logoUrl = null;


  if (creativeBrand?.logo_asset_id) {

    const {
      data:logoAsset,
    } =
      await supabaseAdmin
        .from("creative_assets")
        .select(`
          id,
          image_url,
          file_url
        `)
        .eq(
          "id",
          creativeBrand.logo_asset_id
        )
        .maybeSingle();


    logoUrl =
      logoAsset?.image_url ||
      logoAsset?.file_url ||
      null;

  }


  return {

    id:
      creativeBrand?.id ||
      null,


    name:
      creativeBrand?.name ||
      entity?.display_name ||
      entity?.legal_name ||
      "Company",


    logo_asset_id:
      creativeBrand?.logo_asset_id ||
      null,


    logo_url:
      logoUrl,


    colors:
      creativeBrand?.colors ||
      [],


    fonts:
      creativeBrand?.fonts ||
      [],


    voice_tone:
      creativeBrand?.voice_tone ||
      "",


    style_keywords:
      creativeBrand?.style_keywords ||
      [],


    legal: {

      legal_name:
        entity?.legal_name ||
        null,


      tax_id:
        entity?.tax_id ||
        null,


      registration_number:
        entity?.registration_number ||
        null,


      address:
        entity?.address ||
        null,


      country:
        entity?.country ||
        null,


      currency:
        entity?.currency ||
        null,


      phone:
        entity?.phone ||
        null,


      email:
        entity?.email ||
        null,

    },


    payment:
      paymentConfig?.configuration ||
      {},


    website:
      "www.churchillkaron.com",


    metadata:
      creativeBrand?.metadata ||
      {},

  };

}
