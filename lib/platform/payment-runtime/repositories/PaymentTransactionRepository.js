import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";


const TABLE =
  "payments";


export const PaymentTransactionRepository = {


  async create(transaction){

    const {
      data,
      error,
    } =
      await supabaseAdmin
        .from(TABLE)
        .insert(transaction)
        .select()
        .single();


    if (error)
      throw error;


    return data;

  },


  async update(
    id,
    updates
  ){

    const {
      data,
      error,
    } =
      await supabaseAdmin
        .from(TABLE)
        .update({
          ...updates,
          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          id
        )
        .select()
        .single();


    if (error)
      throw error;


    return data;

  },



  async get(id){

    const {
      data,
      error,
    } =
      await supabaseAdmin
        .from(TABLE)
        .select("*")
        .eq(
          "id",
          id
        )
        .single();


    if (error)
      throw error;


    return data;

  },


};
