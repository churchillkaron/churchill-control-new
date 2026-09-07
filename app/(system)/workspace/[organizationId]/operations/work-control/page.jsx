import { redirect } from "next/navigation";

export default async function OperationsWorkControlCompatibilityPage({ params, searchParams }) {
  const { organizationId } = await params;
  const query = await searchParams;
  const workOrderId = String(query?.workOrderId || query?.work_order_id || "").trim();
  const suffix = workOrderId ? `?workOrderId=${encodeURIComponent(workOrderId)}` : "";
  redirect(`/workspace/${encodeURIComponent(organizationId)}/operations/field-service/work-control${suffix}`);
}
