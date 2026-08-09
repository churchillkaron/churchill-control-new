export const CHANNEL_REGISTRY = [

  {
    id:"meta",

    name:"Meta",

    category:"social",

    channels:[

      {
        id:"facebook",

        name:"Facebook",

        type:"social",

        runtime:"meta",

        actions:[

          {
            id:"connect",
            label:"Connect",
            engine:"channel_connect",
          },

          {
            id:"disconnect",
            label:"Disconnect",
            engine:"channel_disconnect",
          },

          {
            id:"refresh",
            label:"Refresh",
            engine:"channel_refresh",
          },

        ],

        capabilities:[

          "marketing.facebook.publish",

          "marketing.facebook.analytics",

        ],

      },


      {
        id:"instagram",

        name:"Instagram",

        type:"social",

        runtime:"meta",

        actions:[

          {
            id:"connect",
            label:"Connect",
            engine:"channel_connect",
          },

          {
            id:"disconnect",
            label:"Disconnect",
            engine:"channel_disconnect",
          },

          {
            id:"refresh",
            label:"Refresh",
            engine:"channel_refresh",
          },

        ],

        capabilities:[

          "marketing.instagram.publish",

          "marketing.instagram.analytics",

        ],

      },

    ],

  },


  {
    id:"whatsapp",

    name:"WhatsApp Business",

    category:"messaging",

    channels:[

      {
        id:"whatsapp-business",

        name:"WhatsApp Business",

        type:"messaging",

        runtime:"whatsapp",

        actions:[

          {
            id:"connect",
            label:"Connect",
            engine:"channel_connect",
          },

          {
            id:"disconnect",
            label:"Disconnect",
            engine:"channel_disconnect",
          },

          {
            id:"refresh",
            label:"Refresh",
            engine:"channel_refresh",
          },

        ],

        capabilities:[

          "communication.whatsapp.send",

          "communication.whatsapp.templates",

        ],

      },

    ],

  },


  {
    id:"line",

    name:"LINE",

    category:"messaging",

    channels:[

      {
        id:"line-business",

        name:"LINE Business",

        type:"messaging",

        runtime:"line",

        actions:[

          {
            id:"connect",
            label:"Connect",
            engine:"channel_connect",
          },

          {
            id:"disconnect",
            label:"Disconnect",
            engine:"channel_disconnect",
          },

          {
            id:"refresh",
            label:"Refresh",
            engine:"channel_refresh",
          },

        ],

        capabilities:[

          "communication.line.send",

        ],

      },

    ],

  },


  {
    id:"google",

    name:"Google",

    category:"google-services",

    channels:[

      {
        id:"google-business",

        name:"Google Business Profile",

        type:"business-profile",

        runtime:"google",

        actions:[

          {
            id:"connect",
            label:"Connect",
            engine:"channel_connect",
          },

          {
            id:"disconnect",
            label:"Disconnect",
            engine:"channel_disconnect",
          },

          {
            id:"refresh",
            label:"Refresh",
            engine:"channel_refresh",
          },

        ],

        capabilities:[

          "marketing.google.business.locations.read",

          "marketing.google.business.publish",

          "marketing.google.business.media.publish",

          "marketing.google.business.analytics",

          "reputation.review.read",

          "reputation.review.reply",

        ],

      },

      {
        id:"google-ads",

        name:"Google Ads",

        type:"advertising",

        runtime:"google_ads",

        actions:[

          {
            id:"connect",
            label:"Connect",
            engine:"channel_connect",
          },

          {
            id:"refresh",
            label:"Refresh",
            engine:"channel_refresh",
          },

        ],

        capabilities:[

          "marketing.google.ads.manage",

        ],

      },

    ],

  },


  {
    id:"commerce",

    name:"Commerce",

    category:"commerce",

    channels:[

      {
        id:"shopify",

        name:"Shopify",

        type:"commerce",

        runtime:"shopify",

        actions:[

          {
            id:"connect",
            label:"Connect",
            engine:"channel_connect",
          },

          {
            id:"disconnect",
            label:"Disconnect",
            engine:"channel_disconnect",
          },

          {
            id:"refresh",
            label:"Refresh",
            engine:"channel_refresh",
          },

        ],

        capabilities:[

          "commerce.orders.sync",

          "commerce.products.sync",

        ],

      },

    ],

  },

];



export function getChannel(channelId){

  for(
    const category
    of CHANNEL_REGISTRY
  ){

    const channel =
      (category.channels || [])
        .find(
          item =>
            item.id === channelId
        );


    if(channel){
      return channel;
    }

  }


  return null;

}



export function listChannels(){

  return CHANNEL_REGISTRY.flatMap(
    category =>
      category.channels || []
  );

}
