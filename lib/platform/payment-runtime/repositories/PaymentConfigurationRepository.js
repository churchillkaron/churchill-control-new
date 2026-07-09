import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";


const TABLE =
  "organization_payment_config";


export const PaymentConfigurationRepository = {


  async list({
    organizationId,
  }) {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from(TABLE)
      .select("*")
      .eq(
        "organization_id",
        organizationId
      )
      .eq(
        "enabled",
        true
      );


    if (error)
      throw error;


    return data || [];

  },


};
