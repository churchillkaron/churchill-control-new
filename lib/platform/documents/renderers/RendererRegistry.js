const renderers = new Map();


export function registerRenderer(
  documentType,
  renderer
){

  renderers.set(
    documentType,
    renderer
  );

}


export function getRenderer(
  documentType
){

  return (
    renderers.get(documentType)
    || null
  );

}


export function listRenderers(){

  return [
    ...renderers.entries()
  ];

}
