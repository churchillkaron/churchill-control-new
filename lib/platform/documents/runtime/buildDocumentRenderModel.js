export function buildDocumentRenderModel({

  documentType,

  data = {},

  template = null,

  brand = null,

}) {


  return {

    documentType,

    data,

    template,

    brand,

    generatedAt:
      new Date()
        .toISOString(),

  };

}
