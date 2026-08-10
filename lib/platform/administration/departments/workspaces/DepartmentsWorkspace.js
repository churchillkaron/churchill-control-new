const DepartmentsWorkspace = {
  id: "departments",
  name: "Departments",
  description: "Manage organizational departments.",
  route: "/administration/departments",
  type: "business-workspace",
  document: "Department",

  create: {
    enabled: true,
    type: "document",
    id: "department",
    engine: "create",
    api: "/api/administration/departments",
    label: "+ Department",
    title: "Department",
    schema: [
      {
        name: "code",
        label: "Code",
        required: true,
      },
      {
        name: "name",
        label: "Department Name",
        required: true,
      },
      {
        name: "entity_id",
        label: "Legal Entity",
        type: "lookup",
        lookup: "legal_entities",
      },
      {
        name: "status",
        label: "Status",
        defaultValue: "ACTIVE",
      },
      {
        name: "description",
        label: "Description",
      },
    ],
  },

  runtime: {
    renderer: "MasterDataRuntimeWorkCenter",
    listApi: "/api/administration/departments",
  },

  ui: {
    api: "/api/administration/departments",
    rowsKey: "rows",
    search: [
      "code",
      "name",
      "status",
    ],
  },
};

export default DepartmentsWorkspace;
