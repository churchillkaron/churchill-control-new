import { createOperatorAuthenticatedRouteReadCapability } from "@/lib/operator/runtime/OperatorAuthenticatedRouteReadCapability";

function complianceWorkPermitsRead() {
  return createOperatorAuthenticatedRouteReadCapability({
    domain: "compliance", capability: "work_permits", action: "read",
    description: "Read current staff work-permit compliance with exact legal employer, staff owner, controlled document, expiry date and renewal status.",
    endpoint: "/api/workspace/compliance/work-permits",
    tags: ["compliance", "people", "work-permit", "expiry", "legal-entity"],
    queryFields: ["organizationId", "organization_id", "entityId", "entity_id"],
  });
}

function complianceRecordsRead() {
  return createOperatorAuthenticatedRouteReadCapability({
    domain: "compliance", capability: "records", action: "read",
    description: "Read current organization/entity-scoped compliance frameworks, requirements, controls, evidence, tests, obligations, risks, issues or remediation records.",
    endpoint: "/api/workspace/compliance/records",
    tags: ["compliance", "controls", "risks", "obligations", "evidence", "issues"],
    queryFields: ["resource", "status", "limit"],
    inputSchema: { type: "object", required: ["resource"], additionalProperties: false, properties: {
      resource: { type: "string", enum: ["frameworks", "requirements", "controls", "evidence", "tests", "obligations", "risks", "issues", "remediation"] },
      status: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 5000 },
    }},
  });
}

export const ComplianceDomainRuntime = {
  domain: "compliance", name: "Compliance", version: "1.0.0",
  capabilities: {
    records: { read: async () => complianceRecordsRead() },
    work_permits: { read: async () => complianceWorkPermitsRead() },
    assets: {
      read: async () => (await import("@/lib/compliance/runtime/ComplianceAssetVerificationReadCapability")).createComplianceAssetVerificationReadCapability(),
      create: async () => (await import("@/lib/compliance/runtime/ComplianceAssetOperatorCapability")).createComplianceAssetCreateCapability(),
    },
  },
};

export default ComplianceDomainRuntime;
