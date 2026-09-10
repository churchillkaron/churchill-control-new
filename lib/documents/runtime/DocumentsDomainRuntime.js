import { createOperatorAuthenticatedRouteReadCapability } from "@/lib/operator/runtime/OperatorAuthenticatedRouteReadCapability";

function documentLibraryRead() {
  return createOperatorAuthenticatedRouteReadCapability({
    domain: "documents", capability: "files", action: "read",
    description: "Read the current organization-scoped controlled document library, with optional entity, text, status, type and source filters.",
    endpoint: "/api/documents", tags: ["documents", "files", "library", "controlled-documents"],
    queryFields: ["q", "status", "type", "source", "limit"],
    inputSchema: { type: "object", additionalProperties: false, properties: {
      q: { type: "string" }, status: { type: "string" }, type: { type: "string" },
      source: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 500 },
    }},
  });
}

export const DocumentsDomainRuntime = {
  domain: "documents", name: "Documents", version: "1.0.0",
  capabilities: { files: {
    read: async () => documentLibraryRead(),
    create: async () => (await import("@/lib/documents/runtime/DocumentsOperatorCapability")).createDocumentsFileCreateCapability(),
    createPack: async () => (await import("@/lib/documents/runtime/DocumentsOperatorCapability")).createDocumentsFilePackCreateCapability(),
  }},
};

export default DocumentsDomainRuntime;
