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

    form: "department",

    api: "/api/administration/departments",

    label: "+ Department",

    title: "Department"

  },

  runtime: {

    renderer: "MasterDataRuntimeWorkCenter",

    listApi: "/api/administration/departments"

  },

  ui: {

    api: "/api/administration/departments",

    rowsKey: "rows",

    search: [

      "code",

      "name",

      "status"

    ]

  }

};

export default DepartmentsWorkspace;
