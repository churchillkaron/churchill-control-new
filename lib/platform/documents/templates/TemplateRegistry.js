const templates = new Map();


export function registerTemplate(
  template
){

  if(!template?.id){
    throw new Error(
      "Template id required"
    );
  }

  templates.set(
    template.id,
    template
  );

}


export function getTemplate(id){

  return (
    templates.get(id)
    || null
  );

}


export function listTemplates(){

  return [
    ...templates.values()
  ];

}
