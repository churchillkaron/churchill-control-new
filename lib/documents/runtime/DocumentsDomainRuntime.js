import { createDocumentsFileCreateCapability } from "@/lib/documents/runtime/DocumentsOperatorCapability";

export const DocumentsDomainRuntime = {
  domain: "documents",
  name: "Documents",
  version: "1.0.0",
  capabilities: {
    files: {
      create: async () => createDocumentsFileCreateCapability(),
    },
  },
};

export default DocumentsDomainRuntime;
