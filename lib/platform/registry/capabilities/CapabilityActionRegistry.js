export const CAPABILITY_ACTION_REGISTRY = {

  IMAGE_AI: {

    actions:[

      {
        id:"generate_image",

        name:"Generate Image",

        engine:"service_execute",

        form:"creative-image-request",

        executionCapability:
          "ai.image.generate",

      },

      {
        id:"analyze_image",

        name:"Analyze Image",

        engine:"service_execute",

        form:"creative-image-analysis",

        executionCapability:
          "ai.image.analyze",

      },

    ],

  },


  VIDEO_AI: {

    actions:[

      {
        id:"generate_video",

        name:"Generate Video",

        engine:"service_execute",

        form:"creative-video-request",

        executionCapability:
          "ai.video.generate",

      },

    ],

  },


  OCR: {

    actions:[

      {
        id:"process_document",

        name:"Process Document",

        engine:"service_execute",

        form:"document-upload",

        executionCapability:
          "document.ocr",

      },

    ],

  },


  TEXT_AI: {

    actions:[

      {
        id:"generate_text",

        name:"Generate Text",

        engine:"service_execute",

        form:"text-request",

        executionCapability:
          "ai.text.generate",

      },

    ],

  },

};



export function getCapabilityActions(
  capability
){

  return (
    CAPABILITY_ACTION_REGISTRY[
      capability
    ]?.actions
    ||
    []
  );

}
