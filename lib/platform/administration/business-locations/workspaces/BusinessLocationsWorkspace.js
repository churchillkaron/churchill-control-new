const BusinessLocationsWorkspace = {

  id: "business_locations",

  name: "Business Locations",

  description:
    "Manage company business locations.",

  route:
    "/administration/business-locations",

  type:
    "business-workspace",

  document:
    "BusinessLocation",

  create: {

    enabled: true,

    type: "document",

    id: "business_location",

    engine: "create",

    form: "business-location",

    api: "/api/administration/business-locations",

    label: "+ Business Location",

    title: "Business Location"

  },

  runtime: {

    renderer:
      "MasterDataRuntimeWorkCenter",

    listApi:
      "/api/administration/business-locations"

  },

  ui: {

    api:
      "/api/administration/business-locations",

    rowsKey:
      "rows",

    search: [

      "code",

      "name",

      "location_type",

      "city",

      "country",

      "status"

    ]

  }

};

export default BusinessLocationsWorkspace;
