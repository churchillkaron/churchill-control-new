import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function processExpenseReceipt(
  submission
) {

  const supabase =
    supabaseAdmin;

  const {
    data: invoice,
    error,
  } = await supabase
    .from("invoices")
    .insert({

      tenant_id:
        submission.tenant_id,

      image_url:
        submission.image_url,

      file_url:
        submission.image_url,

      uploaded_by_id:
        submission.uploaded_by,

      status:
        "pending_review",

      confidence:
        String(
          submission.ai_confidence || 0
        ),

    })
    .select()
    .single();

  if (error)
    throw error;

  await supabase
    .from(
      "ai_intake_submissions"
    )
    .update({

      workflow_created:
        true,

      destination_record_id:
        invoice.id,

      status:
        "processed",

    })
    .eq(
      "id",
      submission.id
    );

  if (
    submission.organization_document_id
  ) {

    await supabase
      .from(
        "organization_documents"
      )
      .update({

        destination_record_id:
          invoice.id,

        status:
          "processed",

        updated_at:
          new Date().toISOString(),

      })
      .eq(
        "id",
        submission.organization_document_id
      );

  }

  return invoice;

}
