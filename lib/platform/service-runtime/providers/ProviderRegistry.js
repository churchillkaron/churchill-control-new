export const PROVIDER_REGISTRY = {


  openai: {

    id:"openai",

    name:"OpenAI",

    category:"ai",

    capabilities:[

      "ai.text.generate",

      "ai.image.generate",

      "ai.reasoning.execute",

      "document.ocr",

      "document.classify",

      "ai.image.analyze",

    ],

    countries:[
      "*",
    ],

    currencies:[
      "*",
    ],

    runtime:"openai",

    runtimeAvailable:true,

    active:true,

  },



  flux: {

    id:"flux",

    name:"Flux",

    category:"ai",

    capabilities:[

      "ai.image.generate",

      "ai.image.upscale",

    ],

    countries:[
      "*",
    ],

    currencies:[
      "*",
    ],

    runtime:"flux",

    runtimeAvailable:true,

    active:true,

  },



  runway: {

    id:"runway",

    name:"Runway",

    category:"ai",

    capabilities:[

      "ai.video.generate",

    ],

    countries:[
      "*",
    ],

    currencies:[
      "*",
    ],

    runtime:"runway",

    runtimeAvailable:true,

    active:true,

  },



  anthropic: {

    id:"anthropic",

    name:"Anthropic",

    category:"ai",

    capabilities:[

      "ai.text.generate",

      "ai.reasoning.execute",

    ],

    countries:[
      "*",
    ],

    currencies:[
      "*",
    ],

    runtime:"anthropic",

    runtimeAvailable:false,

    active:true,

  },



  meta: {

    id:"meta",

    name:"Meta",

    category:"marketing",

    capabilities:[

      "marketing.social.publish",

      "marketing.ads.manage",

    ],

    countries:[
      "*",
    ],

    currencies:[
      "*",
    ],

    runtime:"meta",

    runtimeAvailable:false,

    active:true,

  },


};



export function getProvider(providerId) {

  return (
    PROVIDER_REGISTRY[providerId] ||
    null
  );

}



export function getProvidersForCapability(

  capability

) {

  return Object.values(
    PROVIDER_REGISTRY
  )
  .filter(

    provider =>

      provider.active &&

      provider.capabilities.includes(
        capability
      )

  );

}
