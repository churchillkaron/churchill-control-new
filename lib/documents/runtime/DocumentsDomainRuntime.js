import { createDocumentsFileCreateCapability, createDocumentsFilePackCreateCapability } from "@/lib/documents/runtime/DocumentsOperatorCapability";

export const DocumentsDomainRuntime = {
  domain: "documents",
  name: "Documents",
  version: "1.0.0",
  capabilities: {
    files: {
      create: async () => createDocumentsFileCreateCapability(),
      createPack: async () => createDocumentsFilePackCreateCapability(),
    },
  },
};

export default DocumentsDomainRuntime;
