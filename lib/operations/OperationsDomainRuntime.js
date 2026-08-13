export const OperationsDomainRuntime = {
  domain: "operations",
  name: "Operations",
  version: "1.0.0",

  capabilities: {
    work_items: {
      listWorkItems: () =>
        import("@/lib/operations/capabilities/listWorkItems"),
      createWorkItem: () =>
        import("@/lib/operations/capabilities/createWorkItem"),
    },
  },
};

export default OperationsDomainRuntime;
