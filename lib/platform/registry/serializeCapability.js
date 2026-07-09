export function serializeCapability(value){

  if(
    value === null ||
    value === undefined
  ){

    return value;

  }


  if(typeof value === "function"){

    return null;

  }


  if(Array.isArray(value)){

    return value.map(
      serializeCapability
    );

  }


  if(typeof value === "object"){

    return Object.fromEntries(

      Object.entries(value)
        .map(([key,val])=>[
          key,
          serializeCapability(val),
        ])

        .filter(
          ([,val]) =>
            val !== undefined
        )

    );

  }


  return value;

}
