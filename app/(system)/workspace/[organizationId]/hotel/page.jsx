import { redirect } from "next/navigation";

export default async function LegacyHotelControlPage({
  params,
}) {
  const resolvedParams = await params;
  const organizationId = encodeURIComponent(
    String(resolvedParams?.organizationId || "")
  );

  redirect(
    `/workspace/${organizationId}/operations/hotel`
  );
}
