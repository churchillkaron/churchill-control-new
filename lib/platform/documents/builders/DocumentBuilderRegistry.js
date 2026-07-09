const builders = new Map();


export function registerDocumentBuilder(
  documentType,
  builder
){

  builders.set(
    documentType,
    builder
  );

}


export function getDocumentBuilder(
  documentType
){

  return (
    builders.get(documentType)
    || null
  );

}
