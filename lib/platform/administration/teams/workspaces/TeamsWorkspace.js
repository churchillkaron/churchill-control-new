const TeamsWorkspace = {

  id: "teams",

  name: "Teams",

  description: "Manage organizational teams.",

  route: "/administration/teams",

  type: "business-workspace",

  document: "Team",

  create: {

    enabled: true,

    type: "document",

    id: "team",

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

    api: "/api/administration/teams",

    label: "+ Team",

    title: "Team"

  },

  runtime: {

    renderer: "MasterDataRuntimeWorkCenter",

    listApi: "/api/administration/teams"

  },

  ui: {

    api: "/api/administration/teams",

    rowsKey: "rows",

    search: [

      "code",

      "name",

      "status"

    ]

  }

};

export default TeamsWorkspace;
