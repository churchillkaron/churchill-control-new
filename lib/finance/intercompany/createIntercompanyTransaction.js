import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function createIntercompanyTransaction({
  from_entity_id,
  to_entity_id,
  transaction_type,
  amount,
  description = null,
}) {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("intercompany_transactions")
      .insert([
        {

          from_entity_id,

          to_entity_id,

          transaction_type,

          amount,

          description,

          created_at:
            new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) {
      throw error;
    }

    return {

      success: true,

      transaction:
        data,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
