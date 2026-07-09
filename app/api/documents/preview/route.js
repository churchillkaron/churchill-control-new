import {
  renderDocument,
} from "@/lib/platform/documents";


export async function POST(request) {

  try {

    const body =
      await request.json();


    const {

      documentType,

      data = {},

      organizationId,

      entityId,

    } = body;


    const rendered =
      await renderDocument({

        documentType,

        data,

        organizationId,

        entityId,

      });


    return Response.json({

      success:true,

      rendered,

    });


  } catch(error) {


    console.error(
      "DOCUMENT PREVIEW ERROR",
      error
    );


    return Response.json(

      {

        success:false,

        error:
          error.message,

      },

      {
        status:500,
      }

    );

  }

}
