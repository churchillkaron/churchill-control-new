"use client";

import { notFound, useParams } from "next/navigation";

import DocumentsWorkspace from "@/components/workspace/documents/DocumentsWorkspace";

const VIEWS = new Set([
  "intake",
  "library",
  "approvals",
  "contracts",
  "records",
  "templates",
  "activity",
]);

export default function DocumentsViewPage() {
  const params = useParams();
  const view = String(params?.view || "").trim().toLowerCase();
  if (!VIEWS.has(view)) notFound();
  return <DocumentsWorkspace organizationId={params?.organizationId} mode={view} />;
}
