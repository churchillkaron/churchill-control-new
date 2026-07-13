export const WhatsAppProvider = {

  id:"whatsapp",

  async execute({

    capability,

    phone_number_id,

    access_token,

    recipient,

    message,

    template,

  } = {}) {


    if (!access_token) {

      throw new Error(
        "WHATSAPP_ACCESS_TOKEN_REQUIRED"
      );

    }


    switch(capability) {


      case "communication.whatsapp.send":

        return sendMessage({

          phone_number_id,

          access_token,

          recipient,

          message,

        });


      case "communication.whatsapp.template":

        return sendTemplate({

          phone_number_id,

          access_token,

          recipient,

          template,

        });


      default:

        throw new Error(
          `WhatsApp capability not supported: ${capability}`
        );

    }

  },

};


async function sendMessage({

  phone_number_id,

  access_token,

  recipient,

  message,

}) {

  const response =
    await fetch(

      `https://graph.facebook.com/v23.0/${phone_number_id}/messages`,

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

            messaging_product:
              "whatsapp",

            to:
              recipient,

            type:
              "text",

            text:{

              body:
                message,

            },

          }),

      }

    );


  const result =
    await response.json();


  if (!response.ok) {

    throw new Error(
      result?.error?.message ||
      "WhatsApp send failed"
    );

  }


  return {

    success:true,

    provider:"whatsapp",

    output:
      result,

  };

}



async function sendTemplate({

  phone_number_id,

  access_token,

  recipient,

  template,

}) {

  const response =
    await fetch(

      `https://graph.facebook.com/v23.0/${phone_number_id}/messages`,

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

            messaging_product:
              "whatsapp",

            to:
              recipient,

            type:
              "template",

            template,

          }),

      }

    );


  return await response.json();

}
