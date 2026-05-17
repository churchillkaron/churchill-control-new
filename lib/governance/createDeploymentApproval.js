import createApprovalRequest from "@/lib/approvals/workflows/createApprovalRequest";

export default async function createDeploymentApproval({
  tenant_id,
  requested_by,
  environment = "production",
  commit_sha,
}) {

  return await createApprovalRequest({
    tenant_id,
    requested_by,
    type: "deployment",
    entity_id: commit_sha,
    metadata: {
      environment,
      commit_sha,
    },
  });
}
