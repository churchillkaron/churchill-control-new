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

    form: "business-unit",

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
