import {
  google,
} from "googleapis";

import {
  ProviderEventRuntime,
} from "@/lib/platform/service-runtime/events/runtime/ProviderEventRuntime";


export const GoogleProvider = {

  id:"google",

  async execute({

    capability,

    access_token,

    refresh_token,

    payload = {},

    organization_id,

  } = {}) {


    if (!access_token) {

      throw new Error(
        "GOOGLE_ACCESS_TOKEN_REQUIRED"
      );

    }


    switch(capability) {


      case "documents.google.drive":

        return googleDrive({

          access_token,

          refresh_token,

          payload,

        });


      case "marketing.google.business.publish":

        return publishBusinessPost({

          organization_id,

          location_id:
            payload.location_id,

          access_token,

          summary:
            payload.summary ||
            payload.text,

        });


      case "marketing.google.ads.manage":

        throw new Error(
          "GOOGLE_ADS_PROVIDER_NOT_IMPLEMENTED"
        );


      default:

        throw new Error(
          `Google capability not supported: ${capability}`
        );

    }

  },

};



async function googleDrive({

  access_token,

  refresh_token,

}) {

  const auth =
    new google.auth.OAuth2();

  auth.setCredentials({

    access_token,

    refresh_token,

  });


  const drive =
    google.drive({

      version:"v3",

      auth,

    });


  const result =
    await drive.files.list({

      pageSize:10,

      fields:
        "files(id,name)",

    });


  return {

    success:true,

    provider:"google",

    output:
      result.data,

  };

}


async function publishBusinessPost({

  organization_id,

  location_id,

  access_token,

  summary,

}) {

  if (!location_id) {

    throw new Error(
      "GOOGLE_LOCATION_ID_REQUIRED"
    );

  }


  const response =
    await fetch(

      `https://mybusiness.googleapis.com/v4/${location_id}/localPosts`,

      {

        method:"POST",

        headers:{

          Authorization:
            `Bearer ${access_token}`,

          "Content-Type":
            "application/json",

        },

        body:
          JSON.stringify({

            languageCode:
              "en",

            summary,

            topicType:
              "STANDARD",

          }),

      }

    );


  const result =
    await response.json();


  if (!response.ok) {

    throw new Error(
      result?.error?.message ||
      "Google Business publish failed"
    );

  }


  await ProviderEventRuntime.record({

    organization_id,

    provider_id:
      "google",

    event_type:
      "GOOGLE_BUSINESS_POST_PUBLISHED",

    external_event_id:
      result?.name || null,

    payload:
      result,

  }).catch(() => null);


  return {

    success:true,

    provider:"google",

    output:
      result,

  };

}
