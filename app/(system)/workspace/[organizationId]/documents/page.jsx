"use client";

import { useParams } from "next/navigation";

import DocumentsWorkspace from "@/components/workspace/documents/DocumentsWorkspace";

export default function DocumentsPage() {
  const params = useParams();
  return <DocumentsWorkspace organizationId={params?.organizationId} mode="home" />;
}
