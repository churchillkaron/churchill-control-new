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

    form: "team",

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
