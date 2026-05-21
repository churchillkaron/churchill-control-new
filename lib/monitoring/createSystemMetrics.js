export default async function createSystemMetrics() {

  return {

    status: "ONLINE",

    uptime: 0,

    memory: {},

    timestamp:
      new Date().toISOString(),

    services: [],

  };

}
