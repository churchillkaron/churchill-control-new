const documents = new Map();


export function registerDocument(document){

  if(!document?.id){
    throw new Error(
      "Document id required"
    );
  }

  documents.set(
    document.id,
    document
  );

  return document;

}


export function getDocument(id){

  return documents.get(id) || null;

}


export function listDocuments(){

  return [
    ...documents.values()
  ];

}
