export function createDocumentProvider({
  id,
  domain,
  documents = [],
}) {

  if (!id) {
    throw new Error("provider id required");
  }

  return {
    id,
    domain,
    documents,
  };

}
