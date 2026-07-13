export const PROVIDER_REGISTRY = {


  openai: {

    id:"openai",

    connectionModel:"managed",

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

    connectionModel:"managed",

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

    connectionModel:"managed",

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

    connectionModel:"managed",

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

    connectionModel:"oauth",

    name:"Meta",

    category:"marketing",

    capabilities:[

      "marketing.social.publish",

      "marketing.instagram.publish",

      "marketing.facebook.publish",

      "marketing.ads.manage",

    ],

    countries:[
      "*",
    ],

    currencies:[
      "*",
    ],

    runtime:"meta",

    runtimeAvailable:true,

    active:true,

  },


  google: {

    id:"google",

    connectionModel:"oauth",

    name:"Google",

    category:"integration",

    capabilities:[

      "documents.google.drive",

      "marketing.google.business.publish",

      "marketing.google.ads.manage",

    ],

    countries:["*"],

    currencies:["*"],

    runtime:"google",

    runtimeAvailable:true,

    active:true,

  },


  whatsapp: {

    id:"whatsapp",

    connectionModel:"oauth",

    name:"WhatsApp",

    category:"communication",

    capabilities:[

      "communication.whatsapp.send",

      "communication.whatsapp.template",

    ],

    countries:["*"],

    currencies:["*"],

    runtime:"whatsapp",

    runtimeAvailable:true,

    active:true,

  },


  line: {

    id:"line",

    name:"LINE",

    category:"communication",

    capabilities:[

      "communication.line.send",

    ],

    countries:["*"],

    currencies:["*"],

    runtime:"line",

    runtimeAvailable:true,

    active:true,

  },


  linkedin: {

    id:"linkedin",

    name:"LinkedIn",

    category:"marketing",

    capabilities:[

      "communication.linkedin.publish",

      "marketing.linkedin.publish",

    ],

    countries:["*"],

    currencies:["*"],

    runtime:"linkedin",

    runtimeAvailable:true,

    active:true,

  },


  claude: {

    id:"claude",
    name:"Claude",
    category:"ai",
    connectionModel:"managed",

    capabilities:[
      "ai.text.generate",
      "ai.reasoning.execute",
      "ai.document.analyze",
    ],

    countries:["*"],
    currencies:["*"],

    runtime:"anthropic",
    runtimeAvailable:false,
    active:true,

  },


  gemini: {

    id:"gemini",
    name:"Gemini",
    category:"ai",
    connectionModel:"managed",

    capabilities:[
      "ai.text.generate",
      "ai.reasoning.execute",
    ],

    countries:["*"],
    currencies:["*"],

    runtime:"gemini",
    runtimeAvailable:false,
    active:true,

  },


  mistral: {

    id:"mistral",
    name:"Mistral",
    category:"ai",
    connectionModel:"managed",

    capabilities:[
      "ai.text.generate",
      "ai.reasoning.execute",
    ],

    countries:["*"],
    currencies:["*"],

    runtime:"mistral",
    runtimeAvailable:false,
    active:true,

  },


  deepseek: {

    id:"deepseek",
    name:"DeepSeek",
    category:"ai",
    connectionModel:"managed",

    capabilities:[
      "ai.text.generate",
      "ai.reasoning.execute",
    ],

    countries:["*"],
    currencies:["*"],

    runtime:"deepseek",
    runtimeAvailable:false,
    active:true,

  },


  seedance: {

    id:"seedance",
    name:"Seedance",
    category:"ai",
    connectionModel:"managed",

    capabilities:[
      "ai.video.generate",
      "ai.video.image_to_video",
    ],

    countries:["*"],
    currencies:["*"],

    runtime:"seedance",
    runtimeAvailable:false,
    active:true,

  },


  kling: {

    id:"kling",
    name:"Kling AI",
    category:"ai",
    connectionModel:"managed",

    capabilities:[
      "ai.video.generate",
      "ai.video.image_to_video",
    ],

    countries:["*"],
    currencies:["*"],

    runtime:"kling",
    runtimeAvailable:false,
    active:true,

  },


  sora: {

    id:"sora",
    name:"Sora",
    category:"ai",
    connectionModel:"managed",

    capabilities:[
      "ai.video.generate",
    ],

    countries:["*"],
    currencies:["*"],

    runtime:"sora",
    runtimeAvailable:false,
    active:true,

  },


  veo: {

    id:"veo",
    name:"Google Veo",
    category:"ai",
    connectionModel:"managed",

    capabilities:[
      "ai.video.generate",
    ],

    countries:["*"],
    currencies:["*"],

    runtime:"veo",
    runtimeAvailable:false,
    active:true,

  },


  elevenlabs: {

    id:"elevenlabs",
    name:"ElevenLabs",
    category:"ai",
    connectionModel:"managed",

    capabilities:[
      "ai.voice.generate",
      "ai.voice.clone",
    ],

    countries:["*"],
    currencies:["*"],

    runtime:"elevenlabs",
    runtimeAvailable:false,
    active:true,

  },


  tiktok: {

    id:"tiktok",
    name:"TikTok",
    category:"marketing",
    connectionModel:"oauth",

    capabilities:[
      "marketing.tiktok.publish",
      "marketing.tiktok.analytics",
    ],

    countries:["*"],
    currencies:["*"],

    runtime:"tiktok",
    runtimeAvailable:false,
    active:true,

  },


  x: {

    id:"x",
    name:"X",
    category:"marketing",
    connectionModel:"oauth",

    capabilities:[
      "marketing.x.publish",
      "marketing.x.analytics",
    ],

    countries:["*"],
    currencies:["*"],

    runtime:"x",
    runtimeAvailable:false,
    active:true,

  },


  tripadvisor: {

    id:"tripadvisor",
    name:"TripAdvisor",
    category:"reputation",
    connectionModel:"oauth",

    capabilities:[
      "reputation.review.read",
      "reputation.review.reply",
    ],

    countries:["*"],
    currencies:["*"],

    runtime:"tripadvisor",
    runtimeAvailable:false,
    active:true,

  },

  midjourney: {

    id:"midjourney",
    name:"Midjourney",
    category:"ai",

    connectionModel:"managed",

    capabilities:[
      "ai.image.generate",
      "ai.image.style_transfer",
    ],

    countries:["*"],
    currencies:["*"],

    runtime:"midjourney",
    runtimeAvailable:false,
    active:true,

  },


  ideogram: {

    id:"ideogram",
    name:"Ideogram",
    category:"ai",

    connectionModel:"managed",

    capabilities:[
      "ai.image.generate",
      "ai.image.edit",
    ],

    countries:["*"],
    currencies:["*"],

    runtime:"ideogram",
    runtimeAvailable:false,
    active:true,

  },


  leonardo: {

    id:"leonardo",
    name:"Leonardo AI",
    category:"ai",

    connectionModel:"managed",

    capabilities:[
      "ai.image.generate",
      "ai.image.edit",
    ],

    countries:["*"],
    currencies:["*"],

    runtime:"leonardo",
    runtimeAvailable:false,
    active:true,

  },


  recraft: {

    id:"recraft",
    name:"Recraft",
    category:"ai",

    connectionModel:"managed",

    capabilities:[
      "ai.image.generate",
      "ai.image.branding",
    ],

    countries:["*"],
    currencies:["*"],

    runtime:"recraft",
    runtimeAvailable:false,
    active:true,

  },


  luma: {

    id:"luma",
    name:"Luma Dream Machine",
    category:"ai",

    connectionModel:"managed",

    capabilities:[
      "ai.video.generate",
      "ai.video.image_to_video",
    ],

    countries:["*"],
    currencies:["*"],

    runtime:"luma",
    runtimeAvailable:false,
    active:true,

  },


  hailuo: {

    id:"hailuo",
    name:"Hailuo AI",
    category:"ai",

    connectionModel:"managed",

    capabilities:[
      "ai.video.generate",
      "ai.video.image_to_video",
    ],

    countries:["*"],
    currencies:["*"],

    runtime:"hailuo",
    runtimeAvailable:false,
    active:true,

  },


  pika: {

    id:"pika",
    name:"Pika",
    category:"ai",

    connectionModel:"managed",

    capabilities:[
      "ai.video.generate",
      "ai.video.edit",
    ],

    countries:["*"],
    currencies:["*"],

    runtime:"pika",
    runtimeAvailable:false,
    active:true,

  },


  pixverse: {

    id:"pixverse",
    name:"PixVerse",
    category:"ai",

    connectionModel:"managed",

    capabilities:[
      "ai.video.generate",
    ],

    countries:["*"],
    currencies:["*"],

    runtime:"pixverse",
    runtimeAvailable:false,
    active:true,

  },


  pinterest: {

    id:"pinterest",
    name:"Pinterest",
    category:"marketing",

    connectionModel:"oauth",

    capabilities:[
      "marketing.pinterest.publish",
      "marketing.pinterest.ads.manage",
    ],

    countries:["*"],
    currencies:["*"],

    runtime:"pinterest",
    runtimeAvailable:false,
    active:true,

  },


  youtube: {

    id:"youtube",
    name:"YouTube",
    category:"marketing",

    connectionModel:"oauth",

    capabilities:[
      "marketing.youtube.publish",
      "marketing.youtube.analytics",
    ],

    countries:["*"],
    currencies:["*"],

    runtime:"youtube",
    runtimeAvailable:false,
    active:true,

  },


  yelp: {

    id:"yelp",
    name:"Yelp",
    category:"reputation",

    connectionModel:"oauth",

    capabilities:[
      "reputation.review.read",
      "reputation.review.reply",
    ],

    countries:["*"],
    currencies:["*"],

    runtime:"yelp",
    runtimeAvailable:false,
    active:true,

  },


  opentable: {

    id:"opentable",
    name:"OpenTable",
    category:"hospitality",

    connectionModel:"oauth",

    capabilities:[
      "reservation.sync",
      "review.sync",
    ],

    countries:["*"],
    currencies:["*"],

    runtime:"opentable",
    runtimeAvailable:false,
    active:true,

  },


  booking: {

    id:"booking",
    name:"Booking.com",
    category:"hospitality",

    connectionModel:"oauth",

    capabilities:[
      "reservation.sync",
      "review.sync",
    ],

    countries:["*"],
    currencies:["*"],

    runtime:"booking",
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
