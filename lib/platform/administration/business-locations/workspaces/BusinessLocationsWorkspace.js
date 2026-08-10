const BusinessLocationsWorkspace = {
  id: "business_locations",
  name: "Business Locations",
  description: "Manage company business locations.",
  route: "/administration/business-locations",
  type: "business-workspace",
  document: "BusinessLocation",

  create: {
    enabled: true,
    type: "document",
    id: "business_location",
    engine: "create",
    api: "/api/administration/business-locations",
    label: "+ Business Location",
    title: "Business Location",
    schema: [
      {
        name: "code",
        label: "Code",
        required: true,
      },
      {
        name: "name",
        label: "Location Name",
        required: true,
      },
      {
        name: "location_type",
        label: "Location Type",
        required: true,
      },
      {
        name: "business_unit_id",
        label: "Business Unit",
        type: "lookup",
        lookup: "business_units",
      },
      {
        name: "department_id",
        label: "Department",
        type: "lookup",
        lookup: "departments",
      },
      {
        name: "address",
        label: "Address",
      },
      {
        name: "city",
        label: "City",
      },
      {
        name: "province",
        label: "Province / State",
      },
      {
        name: "postal_code",
        label: "Postal Code",
      },
      {
        name: "country",
        label: "Country",
      },
      {
        name: "timezone",
        label: "Timezone",
      },
      {
        name: "currency_code",
        label: "Currency",
        type: "lookup",
        lookup: "currencies",
      },
      {
        name: "phone",
        label: "Phone",
      },
      {
        name: "email",
        label: "Email",
        type: "email",
      },
      {
        name: "status",
        label: "Status",
        type: "select",
        options: ["ACTIVE", "INACTIVE"],
        defaultValue: "ACTIVE",
      },
      {
        name: "description",
        label: "Description",
        type: "textarea",
        rows: 3,
      },
    ],
  },

  runtime: {
    renderer: "MasterDataRuntimeWorkCenter",
    listApi: "/api/administration/business-locations",
  },

  ui: {
    api: "/api/administration/business-locations",
    rowsKey: "rows",
    search: [
      "code",
      "name",
      "location_type",
      "city",
      "country",
      "status",
    ],
  },
};

export default BusinessLocationsWorkspace;
