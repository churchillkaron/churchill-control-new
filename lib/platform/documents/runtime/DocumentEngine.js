import {
  resolveTemplate,
} from "../templates/runtime/TemplateResolver";

import {
  resolveDocumentContext,
} from "../context/DocumentContextResolver";

import {
  buildDocumentRenderModel,
} from "./buildDocumentRenderModel";

import {
  getDocumentBuilder,
} from "../builders/DocumentBuilderRegistry";

import {
  initDocumentEngine,
} from "../bootstrap";


export async function renderDocument({

  documentType,

  data = {},

  templateId = null,

  brand = null,

  organizationId = null,

  entityId = null,

}) {


  initDocumentEngine();


  const template =
    await resolveTemplate({

      organizationId,

      documentType,

    });


  const context =
    await resolveDocumentContext({

      documentType,

      organizationId,

      entityId,

      data,

    });


  const builder =
    getDocumentBuilder(
      documentType
    );


  console.log(
    "DOCUMENT BUILDER RESOLUTION",
    {
      documentType,
      found:
        Boolean(builder),
    }
  );


  let documentData =
    context;


  if (builder) {

    documentData =
      await builder({

        data,

        context,

      });

  }


  return buildDocumentRenderModel({

    documentType,

    data:
      {
        ...context,
        data: documentData,
      },

    template,

    brand:
      context.brand || brand,

  });

}
