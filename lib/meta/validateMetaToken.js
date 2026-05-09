export async function validateMetaToken({
  accessToken,
}) {

  try {

    if (!accessToken) {

      return {
        success: false,
        error: "Missing access token",
      };

    }

    const response = await fetch(
      `https://graph.facebook.com/me?fields=id,name&access_token=${accessToken}`
    );

    const data = await response.json();

    console.log(
      "META TOKEN VALIDATION:",
      data
    );

    if (data?.error) {

      return {
        success: false,
        error: data.error.message,
        details: data.error,
      };

    }

    return {
      success: true,
      accountId: data.id,
      name: data.name,
      response: data,
    };

  } catch (error) {

    console.error(
      "META TOKEN VALIDATION ERROR:",
      error
    );

    return {
      success: false,
      error: error.message,
    };

  }

}