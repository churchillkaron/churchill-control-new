import { supabaseAdmin } from "@/lib/shared/supabase/admin";


export async function generateDocumentNumber({

  organization_id,

  entity_id = null,

  document_type,

  prefix,

  date = new Date(),

}) {

  if (!organization_id) {
    throw new Error("organization_id required");
  }

  if (!document_type) {
    throw new Error("document_type required");
  }


  const year =
    date.getFullYear();

  const month =
    date.getMonth() + 1;


  const {
    data: existing,
    error: readError,
  } =
    await supabaseAdmin
      .from("document_number_sequences")
      .select("*")
      .eq(
        "organization_id",
        organization_id
      )
      .eq(
        "entity_id",
        entity_id
      )
      .eq(
        "document_type",
        document_type
      )
      .eq(
        "year",
        year
      )
      .eq(
        "month",
        month
      )
      .single();


  if (readError && readError.code !== "PGRST116") {
    throw readError;
  }


  const nextNumber =
    existing
      ? existing.last_number + 1
      : 1;


  if (existing) {

    await supabaseAdmin
      .from("document_number_sequences")
      .update({

        last_number:
          nextNumber,

        updated_at:
          new Date(),

      })
      .eq(
        "id",
        existing.id
      );

  } else {

    await supabaseAdmin
      .from("document_number_sequences")
      .insert({

        organization_id,

        entity_id,

        document_type,

        prefix,

        year,

        month,

        last_number:
          nextNumber,

      });

  }


  return `${prefix}-${String(year).slice(2)}${String(month).padStart(2,"0")}${String(nextNumber).padStart(4,"0")}`;

}
