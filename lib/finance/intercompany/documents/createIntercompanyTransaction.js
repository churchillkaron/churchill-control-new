import { createServerSupabase } from "@/lib/shared/supabase/server";
import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

export default async function createIntercompanyTransaction({
  organization_id,
  from_legal_entity_id,
  to_legal_entity_id,
  transaction_type = null,
  reference_number = null,
  description = null,
  amount,
  currency = "THB",
  due_date = null,
  created_by = "SYSTEM",
}) {

  try {

    if (!organization_id) {
      throw new Error("organization_id required");
    }

    if (!from_legal_entity_id) {
      throw new Error("from_legal_entity_id required");
    }

    if (!to_legal_entity_id) {
      throw new Error("to_legal_entity_id required");
    }

    if (
      from_legal_entity_id ===
      to_legal_entity_id
    ) {
      throw new Error("ENTITIES_CANNOT_MATCH");
    }

    const numericAmount =
      Number(amount || 0);

    if (numericAmount <= 0) {
      throw new Error("INVALID_AMOUNT");
    }

    if (reference_number) {

      const {
        data: existing,
      } = await supabaseAdmin
        .from("intercompany_transactions")
        .select("id")
        .eq("organization_id", organization_id)
        .eq(
          "reference_number",
          reference_number
        )
        .maybeSingle();

      if (existing) {
        throw new Error(
          "REFERENCE_ALREADY_EXISTS"
        );
      }

    }

    const {
      data,
      error,
    } = await supabaseAdmin

      .from("intercompany_transactions")

      .insert([
        {

          organization_id,

          from_legal_entity_id,

          to_legal_entity_id,

          transaction_type,

          reference_number,

          description,

          amount:
            numericAmount,

          currency,

          due_date,

          status:
            "pending",

          created_by,

          created_at:
            new Date().toISOString(),

          updated_at:
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
