import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function createEntity({
  parent_entity_id = null,
  entity_name,
  entity_code,
  country = null,
  currency = "THB",
}) {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("business_entities")
      .insert([
        {

          parent_entity_id,

          entity_name,

          entity_code,

          country,

          currency,

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

      entity:
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
