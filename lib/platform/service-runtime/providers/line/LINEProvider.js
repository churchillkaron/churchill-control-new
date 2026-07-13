export const LINEProvider = {

  id:"line",

  async execute({

    capability,

    channel_access_token,

    user_id,

    message,

  } = {}) {


    if (!channel_access_token) {

      throw new Error(
        "LINE_CHANNEL_ACCESS_TOKEN_REQUIRED"
      );

    }


    switch(capability) {


      case "communication.line.send":

        return sendMessage({

          channel_access_token,

          user_id,

          message,

        });


      default:

        throw new Error(
          `LINE capability not supported: ${capability}`
        );

    }

  },

};



async function sendMessage({

  channel_access_token,

  user_id,

  message,

}) {


  const response =
    await fetch(

      "https://api.line.me/v2/bot/message/push",

      {

        method:"POST",

        headers:{

          Authorization:
            `Bearer ${channel_access_token}`,

          "Content-Type":
            "application/json",

        },

        body:
          JSON.stringify({

            to:
              user_id,

            messages:[

              {

                type:
                  "text",

                text:
                  message,

              },

            ],

          }),

      }

    );


  const result =
    await response.json();


  if (!response.ok) {

    throw new Error(
      result?.message ||
      "LINE send failed"
    );

  }


  return {

    success:true,

    provider:"line",

    output:
      result,

  };

}
