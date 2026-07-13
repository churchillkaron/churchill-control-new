export const LinkedInProvider = {

  id:"linkedin",

  async execute({

    capability,

    access_token,

    author_urn,

    text,

    image_url,

  } = {}) {


    if (!access_token) {

      throw new Error(
        "LINKEDIN_ACCESS_TOKEN_REQUIRED"
      );

    }


    switch(capability) {


      case "communication.linkedin.publish":

      case "marketing.linkedin.publish":

        return publishPost({

          access_token,

          author_urn,

          text,

          image_url,

        });


      default:

        throw new Error(
          `LinkedIn capability not supported: ${capability}`
        );

    }

  },

};


async function publishPost({

  access_token,

  author_urn,

  text,

}) {


  const response =
    await fetch(

      "https://api.linkedin.com/v2/ugcPosts",

      {

        method:"POST",

        headers:{

          Authorization:
            `Bearer ${access_token}`,

          "Content-Type":
            "application/json",

          "X-Restli-Protocol-Version":
            "2.0.0",

        },

        body:
          JSON.stringify({

            author:
              author_urn,

            lifecycleState:
              "PUBLISHED",

            specificContent:{

              "com.linkedin.ugc.ShareContent":{

                shareCommentary:{

                  text:
                    text || "",

                },

                shareMediaCategory:
                  "NONE",

              },

            },

            visibility:{

              "com.linkedin.ugc.MemberNetworkVisibility":
                "PUBLIC",

            },

          }),

      }

    );


  const result =
    await response.json();


  if (!response.ok) {

    throw new Error(
      result?.message ||
      "LinkedIn publish failed"
    );

  }


  return {

    success:true,

    provider:"linkedin",

    output:
      result,

  };

}
