import { supabaseAdmin } from "@/lib/shared/supabase/admin";


export const CreativeMissionRuntime = {


  async list({

    organizationId,

  }) {

    const {
      data,
      error,
    } =
      await supabaseAdmin
        .from("creative_missions")
        .select("*")
        .eq(
          "organization_id",
          organizationId
        )
        .order(
          "created_at",
          {
            ascending:false,
          }
        );


    if (error) {
      throw error;
    }


    return data || [];

  },


  async get(id) {

    const {
      data,
      error,
    } =
      await supabaseAdmin
        .from("creative_missions")
        .select("*")
        .eq(
          "id",
          id
        )
        .single();


    if (error) {
      throw error;
    }


    return data;

  },


  async create(payload = {}) {

    const {
      data,
      error,
    } =
      await supabaseAdmin
        .from("creative_missions")
        .insert(payload)
        .select()
        .single();


    if (error) {
      throw error;
    }


    return data;

  },


  async update(
    id,
    values = {}
  ) {

    const {
      data,
      error,
    } =
      await supabaseAdmin
        .from("creative_missions")
        .update({
          ...values,
          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          id
        )
        .select()
        .single();


    if (error) {
      throw error;
    }


    return data;

  },


};
