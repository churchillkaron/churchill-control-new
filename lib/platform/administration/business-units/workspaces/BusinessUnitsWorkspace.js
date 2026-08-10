const BusinessUnitsWorkspace = {

  id: "business_units",

  name: "Business Units",

  description: "Manage business units.",

  route: "/administration/business-units",

  type: "business-workspace",

  document: "BusinessUnit",

  create: {

    enabled: true,

    type: "document",

    id: "business_unit",

    engine: "create",

    schema: [
      {
        name: "code",
        label: "Code",
        required: true
      },
      {
        name: "name",
        label: "Name",
        required: true
      },
      {
        name: "status",
        label: "Status",
        type: "select",
        options: ["ACTIVE", "INACTIVE"],
        defaultValue: "ACTIVE"
      },
      {
        name: "description",
        label: "Description",
        type: "textarea",
        rows: 3
      }
    ],

    api: "/api/administration/business-units",

    label: "+ Business Unit",

    title: "Business Unit"

  },

  runtime: {

    renderer: "MasterDataRuntimeWorkCenter",

    listApi: "/api/administration/business-units"

  },

  ui: {

    api: "/api/administration/business-units",

    rowsKey: "rows",

    search: [

      "code",

      "name",

      "status"

    ]

  }

};

export default BusinessUnitsWorkspace;
