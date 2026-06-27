export const BusinessDocumentKernelContract = {
  id: "business-document-kernel",
  version: "1.0.0",

  owns: [
    "document-lifecycle",
    "document-versioning",
    "document-events",
    "document-state-transition",
  ],

  rules: [
    "No hardcoded domain documents",
    "No domain-specific lifecycle inside kernel",
    "Every document requires organizationId",
    "Every document requires domain",
    "Every document requires documentType",
    "State transitions must be validated by lifecycle",
  ],
};
