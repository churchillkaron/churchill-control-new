export function resolveChannelOAuthRoute({

  runtime,

}) {


  const routes = {

    meta:
      "/api/meta/auth",


    google:
      "/api/google/auth",


    whatsapp:
      "/api/whatsapp/auth",


    line:
      "/api/line/auth",


    shopify:
      "/api/shopify/auth",

  };


  return (
    routes[runtime]
    ||
    null
  );

}
