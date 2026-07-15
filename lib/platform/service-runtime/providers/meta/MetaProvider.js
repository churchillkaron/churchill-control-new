import {
  publishFacebook,
  publishInstagram,
} from "@/lib/platform/contracts/marketing/MarketingPublishingContract";


export const MetaProvider = {

  id:"meta",

  async execute({

    capability,

    page_id,

    instagram_business_id,

    access_token,

    message,

    image_url,

    organization_id,

  } = {}) {


    switch(capability) {


      case "marketing.facebook.publish":

      case "marketing.social.publish":

        return publishFacebook({

          organization_id,

          pageId:
            page_id,

          pageToken:
            access_token,

          message,

          imageUrl:
            image_url,

        });


      case "marketing.instagram.publish":

        return publishInstagram({

          organization_id,

          instagramBusinessId:
            instagram_business_id,

          accessToken:
            access_token,

          imageUrl:
            image_url,

          caption:
            message,

        });






      case "marketing.social.analytics":

        return getAnalytics({

          post_id:
            page_id,

          access_token,

        });

      case "marketing.social.delete":

        return deletePost({

          access_token,

          post_id:

            page_id,

        });

      case "marketing.ads.manage":

        return {

          success:true,

          provider:"meta",

          message:
            "Meta Ads adapter ready",

        };


      default:

        throw new Error(
          `Meta capability not supported: ${capability}`
        );

    }

  },

};


async function deletePost({

  access_token,

  post_id,

}) {

  const response =
    await fetch(

      `https://graph.facebook.com/v23.0/${post_id}?access_token=${access_token}`,

      {
        method:
          "DELETE",
      }

    );


  return await response.json();

}


async function getAnalytics({

  post_id,

  access_token,

}) {

  const response =
    await fetch(

      `https://graph.facebook.com/v23.0/${post_id}/insights?metric=likes,comments,shares,reach,impressions,saved&access_token=${access_token}`

    );


  return await response.json();

}
