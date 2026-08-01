import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function LegacyPaymentsPage({ params, searchParams }) {
  const organizationId = params?.organizationId || "";
  const table = searchParams?.table || "";
  const query = new URLSearchParams({ view: "checkout" });

  if (table) query.set("table", table);

  redirect(
    `/workspace/${encodeURIComponent(
      organizationId
    )}/operations/pos?${query.toString()}`
  );
}
