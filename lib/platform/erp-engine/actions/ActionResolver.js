export function resolveActions(config={}){

  return{

    create:
      config.create||

      false,

    edit:
      config.edit??

      true,

    archive:
      config.archive??

      true,

    import:
      config.import||

      false,

    export:
      config.export||

      false,

    ai:
      config.ai||

      false,

  };

}
