import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function processExpenseReceipt(submission) {
  const organizationId = submission?.organization_id || null;

  if (!organizationId) {
    throw new Error("organization_id required");
  }

  const {
    data: invoice,
    error,
  } = await supabaseAdmin
    .from("invoices")
    .insert({
      organization_id: organizationId,
      image_url: submission.image_url,
      file_url: submission.image_url,
      uploaded_by_id: submission.uploaded_by,
      status: "pending_review",
      confidence: String(submission.ai_confidence || 0),
    })
    .select()
    .single();

  if (error) throw error;

  const { error: intakeError } = await supabaseAdmin
    .from("ai_intake_submissions")
    .update({
      workflow_created: true,
      destination_record_id: invoice.id,
      status: "processed",
    })
    .eq("id", submission.id)
    .eq("organization_id", organizationId);

  if (intakeError) throw intakeError;

  if (submission.organization_document_id) {
    const { error: documentError } = await supabaseAdmin
      .from("organization_documents")
      .update({
        destination_record_id: invoice.id,
        status: "processed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", submission.organization_document_id)
      .eq("organization_id", organizationId);

    if (documentError) throw documentError;
  }

  return invoice;
}
