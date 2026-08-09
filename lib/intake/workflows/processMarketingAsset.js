import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function processMarketingAsset(submission) {
  const organizationId = submission?.organization_id || null;

  if (!organizationId) {
    throw new Error("organization_id required");
  }

  const {
    data: asset,
    error,
  } = await supabaseAdmin
    .from("creative_assets")
    .insert({
      organization_id: organizationId,
      image_url: submission.image_url,
      file_url: submission.image_url,
      asset_type: "UPLOADED",
      title: submission.ai_type,
      description: submission.notes || "",
      ai_suggested_type: submission.ai_type,
      created_by: submission.uploaded_by,
      metadata: {
        source: "AI_INTAKE",
        intake_id: submission.id,
      },
      tags: [],
      ai_generated: false,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;

  const { error: intakeError } = await supabaseAdmin
    .from("ai_intake_submissions")
    .update({
      workflow_created: true,
      destination_record_id: asset.id,
      status: "processed",
    })
    .eq("id", submission.id)
    .eq("organization_id", organizationId);

  if (intakeError) throw intakeError;

  if (submission.organization_document_id) {
    const { error: documentError } = await supabaseAdmin
      .from("organization_documents")
      .update({
        destination_record_id: asset.id,
        status: "processed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", submission.organization_document_id)
      .eq("organization_id", organizationId);

    if (documentError) throw documentError;
  }

  return asset;
}
