import {
  resolveLookup,
} from "./LookupRegistry";

export async function getLookupOptions({

  lookup,

  context = {},

  query = "",

}) {

  const Provider =
    resolveLookup(
      lookup
    );

  if (!Provider) {

    throw new Error(

      `Unknown lookup: ${lookup}`

    );

  }

  if (query) {

    return Provider.search({

      query,

      context,

    });

  }

  return Provider.getOptions({

    context,

  });

}
