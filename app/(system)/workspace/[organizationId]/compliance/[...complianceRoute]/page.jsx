"use client";

import { useParams } from "next/navigation";

import ComplianceAuditWorkspace from "@/components/workspace/compliance/ComplianceAuditWorkspace";
import ComplianceLinkedRecordsWorkspace from "@/components/workspace/compliance/ComplianceLinkedRecordsWorkspace";
import ComplianceRecordsWorkspace from "@/components/workspace/compliance/ComplianceRecordsWorkspace";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

const PRIMARY_MODES = new Set(["frameworks","controls","evidence","obligations","risks","issues","remediation"]);
const LINKED_MODES = new Set(["requirements","tests"]);

export default function ComplianceNestedPage() {
  const params = useParams();
  const businessContext = useBusinessContext() || {};
  const organizationId =
    params?.organizationId ||
    businessContext.organization_id ||
    businessContext.organization?.id ||
    null;
  const segments = Array.isArray(params?.complianceRoute)
    ? params.complianceRoute
    : params?.complianceRoute
      ? [params.complianceRoute]
      : [];
  const first = String(segments[0] || "obligations").toLowerCase();
  const second = String(segments[1] || "").toLowerCase();
  const mode =
    first === "frameworks" && second === "requirements"
      ? "requirements"
      : first === "controls" && second === "tests"
        ? "tests"
        : first;

  if (mode === "audit") {
    return <ComplianceAuditWorkspace organizationId={organizationId} />;
  }
  if (LINKED_MODES.has(mode)) {
    return <ComplianceLinkedRecordsWorkspace organizationId={organizationId} mode={mode} />;
  }
  return (
    <ComplianceRecordsWorkspace
      organizationId={organizationId}
      mode={PRIMARY_MODES.has(mode) ? mode : "obligations"}
    />
  );
}
