export function resolveTable(config={}){

  return{

    table:
      config.table||

      null,

    primaryKey:
      config.primaryKey||

      "id",

  };

}
