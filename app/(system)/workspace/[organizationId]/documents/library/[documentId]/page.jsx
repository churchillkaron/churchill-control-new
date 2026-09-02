"use client";

import { useParams } from "next/navigation";

import DocumentDetailWorkspace from "@/components/workspace/documents/DocumentDetailWorkspace";

export default function ControlledDocumentPage() {
  const params = useParams();
  return (
    <DocumentDetailWorkspace
      organizationId={params?.organizationId}
      documentId={params?.documentId}
    />
  );
}
