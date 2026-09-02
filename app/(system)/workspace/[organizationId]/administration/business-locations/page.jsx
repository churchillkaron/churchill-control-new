"use client";

import { useParams } from "next/navigation";

import AdministrationRecordsWorkspace from "@/components/workspace/administration/AdministrationRecordsWorkspace";

export default function AdministrationBusinessLocationsPage() {
  const params = useParams();
  return <AdministrationRecordsWorkspace organizationId={params?.organizationId} mode="business-locations" />;
}
